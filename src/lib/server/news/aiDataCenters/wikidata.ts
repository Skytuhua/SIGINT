import { cachedFetch, fetchJsonOrThrow, type UpstreamPolicy } from "../upstream";
import type {
  WikidataSparqlResponse,
  WikidataBinding,
  AiDataCenterSite,
  AiDataCenterSourceStatus,
  OperatorType,
} from "./types";

const WIKIDATA_SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

const WIKIDATA_POLICY: UpstreamPolicy = {
  key: "ai-dc-wikidata",
  ttlMs: 4 * 60 * 60_000,
  staleTtlMs: 40 * 60 * 60_000,
  timeoutMs: 30_000,
  maxRetries: 1,
  backoffBaseMs: 2_000,
  circuitFailureThreshold: 3,
  circuitOpenMs: 5 * 60_000,
  rateLimit: { capacity: 1, refillPerSec: 0.3, minIntervalMs: 3_000 },
};

// ── Operator classification ──────────────────────────────────────────────────

const HYPERSCALER_PATTERNS = [
  "google", "alphabet", "amazon", "aws", "microsoft", "azure", "meta",
  "facebook", "apple", "oracle", "alibaba", "aliyun", "tencent", "huawei",
  "nvidia", "xai", "bytedance", "samsung sds", "baidu",
];

const COLOCATION_PATTERNS = [
  "equinix", "digital realty", "cyrusone", "qts", "coresite", "ntt",
  "vantage", "flexential", "databank", "t5", "switch", "aligned",
  "iron mountain", "compass datacenters", "edgeconnex", "stack infrastructure",
  "yondr", "prime data centers",
];

const TELECOM_PATTERNS = [
  "at&t", "verizon", "deutsche telekom", "t-mobile", "vodafone", "bt ",
  "orange", "telefonica", "china telecom", "china unicom", "china mobile",
  "kddi", "ntt communications", "singtel", "telstra",
];

const GOVERNMENT_PATTERNS = [
  "government", "department of", "ministry", "military", "defense",
  "national security", "agency",
];

const RESEARCH_PATTERNS = [
  "university", "institute", "laboratory", "research", "cern",
  "national lab", "oak ridge", "argonne", "sandia",
];

function classifyOperator(name: string): OperatorType {
  const lower = name.toLowerCase();
  if (HYPERSCALER_PATTERNS.some((p) => lower.includes(p))) return "hyperscaler";
  if (COLOCATION_PATTERNS.some((p) => lower.includes(p))) return "colocation";
  if (TELECOM_PATTERNS.some((p) => lower.includes(p))) return "telecom";
  if (GOVERNMENT_PATTERNS.some((p) => lower.includes(p))) return "government";
  if (RESEARCH_PATTERNS.some((p) => lower.includes(p))) return "research";
  return "unknown";
}

/** Normalize operator names to canonical forms */
function normalizeOperator(name: string): string {
  const lower = name.toLowerCase().trim();
  if (lower.includes("amazon") || lower.includes("aws")) return "Amazon (AWS)";
  if (lower.includes("google") || lower.includes("alphabet")) return "Google";
  if (lower.includes("microsoft") || lower.includes("azure")) return "Microsoft";
  if (lower.includes("meta") || lower.includes("facebook")) return "Meta";
  if (lower.includes("alibaba") || lower.includes("aliyun")) return "Alibaba Cloud";
  if (lower.includes("oracle")) return "Oracle";
  if (lower.includes("apple")) return "Apple";
  if (lower.includes("tencent")) return "Tencent";
  if (lower.includes("huawei")) return "Huawei";
  if (lower.includes("nvidia")) return "NVIDIA";
  if (lower.includes("bytedance")) return "ByteDance";
  if (lower.includes("equinix")) return "Equinix";
  if (lower.includes("digital realty")) return "Digital Realty";
  if (lower.includes("ntt")) return "NTT";
  return name.trim();
}

// ── SPARQL query ─────────────────────────────────────────────────────────────

function buildQuery(): string {
  return `
SELECT DISTINCT ?dc ?dcLabel ?coord ?operator ?operatorLabel
       ?country ?countryLabel ?countryIso2 ?admin1Label ?cityLabel
WHERE {
  VALUES ?dcClass {
    wd:Q1442639     # data center
    wd:Q28711724    # server farm
    wd:Q110299860   # cloud computing region
    wd:Q105763191   # hyperscale data center
  }
  ?dc wdt:P31/wdt:P279* ?dcClass.
  ?dc wdt:P625 ?coord.
  OPTIONAL {
    ?dc wdt:P137 ?operator.
    ?operator rdfs:label ?operatorLabel.
    FILTER(LANG(?operatorLabel) = "en")
  }
  OPTIONAL {
    ?dc wdt:P17 ?country.
    ?country rdfs:label ?countryLabel.
    FILTER(LANG(?countryLabel) = "en")
    OPTIONAL { ?country wdt:P297 ?countryIso2. }
  }
  OPTIONAL {
    ?dc wdt:P131 ?admin1.
    ?admin1 rdfs:label ?admin1Label.
    FILTER(LANG(?admin1Label) = "en")
  }
  OPTIONAL {
    ?dc wdt:P131*/wdt:P131 ?city.
    ?city wdt:P31/wdt:P279* wd:Q515.
    ?city rdfs:label ?cityLabel.
    FILTER(LANG(?cityLabel) = "en")
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 800
`;
}

// ── Parse Wikidata bindings ──────────────────────────────────────────────────

function extractStr(binding: WikidataBinding, key: string): string {
  return binding[key]?.value?.trim() ?? "";
}

function extractQid(binding: WikidataBinding, key: string): string {
  const uri = binding[key]?.value ?? "";
  const match = uri.match(/Q\d+$/);
  return match ? match[0] : "";
}

function parseCoord(coordStr: string): { lat: number; lon: number } | null {
  const m = coordStr.match(/Point\(([-\d.]+)\s+([-\d.]+)\)/);
  if (!m) return null;
  const lon = parseFloat(m[1]);
  const lat = parseFloat(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

function parseBindings(bindings: WikidataBinding[]): AiDataCenterSite[] {
  // Group by data center QID to handle multiple operator rows
  const grouped = new Map<string, {
    qid: string;
    name: string;
    lat: number;
    lon: number;
    operators: Set<string>;
    country: string;
    countryIso2: string;
    admin1: string;
    city: string;
  }>();

  for (const b of bindings) {
    const qid = extractQid(b, "dc");
    if (!qid) continue;

    const coordStr = extractStr(b, "coord");
    const coord = parseCoord(coordStr);
    if (!coord) continue;

    const existing = grouped.get(qid);
    const operatorName = extractStr(b, "operatorLabel");

    if (existing) {
      if (operatorName) existing.operators.add(normalizeOperator(operatorName));
    } else {
      const operators = new Set<string>();
      if (operatorName) operators.add(normalizeOperator(operatorName));
      grouped.set(qid, {
        qid,
        name: extractStr(b, "dcLabel"),
        lat: coord.lat,
        lon: coord.lon,
        operators,
        country: extractStr(b, "countryLabel"),
        countryIso2: extractStr(b, "countryIso2").toUpperCase(),
        admin1: extractStr(b, "admin1Label"),
        city: extractStr(b, "cityLabel"),
      });
    }
  }

  const now = Date.now();
  const sites: AiDataCenterSite[] = [];

  for (const [qid, entry] of Array.from(grouped.entries())) {
    const operatorArr: string[] = [];
    entry.operators.forEach((v) => { if (v) operatorArr.push(v); });
    const primaryOperator = operatorArr[0] || "Unknown";
    const operatorType = classifyOperator(primaryOperator);

    sites.push({
      id: `wikidata-${qid}`,
      sourceId: qid,
      sourceType: "wikidata",
      name: entry.name || `Data Center ${qid}`,
      operator: primaryOperator,
      operatorType,
      lat: entry.lat,
      lon: entry.lon,
      country: entry.country,
      countryIso2: entry.countryIso2,
      admin1: entry.admin1 || undefined,
      city: entry.city || undefined,
      evidenceTags: ["wikidata:data_center"],
      confidence: 80, // explicit Wikidata DC class
      lastUpdated: now,
    });
  }

  return sites;
}

// ── Public entry point ───────────────────────────────────────────────────────

export async function fetchDataCentersFromWikidata(): Promise<{
  sites: AiDataCenterSite[];
  sourceStatus: AiDataCenterSourceStatus;
}> {
  const query = buildQuery();
  const url = `${WIKIDATA_SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}`;

  const result = await cachedFetch<WikidataSparqlResponse>({
    cacheKey: "ai-dc-sparql",
    policy: WIKIDATA_POLICY,
    request: () =>
      fetchJsonOrThrow<WikidataSparqlResponse>(
        url,
        {
          headers: {
            Accept: "application/sparql-results+json",
            "User-Agent": "SIGINT/1.0 (https://github.com/sigint; contact@sigint.app)",
          },
        },
        WIKIDATA_POLICY.timeoutMs,
      ),
    fallbackValue: { results: { bindings: [] } },
  });

  const bindings = result.data?.results?.bindings ?? [];
  const sites = parseBindings(bindings);

  const sourceStatus: AiDataCenterSourceStatus = {
    status: result.degraded ? "degraded" : sites.length > 0 ? "live" : "unavailable",
    lastUpdated: sites.length > 0 ? Date.now() : null,
    errorCode: result.error ?? null,
  };

  return { sites, sourceStatus };
}
