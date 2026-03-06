import { cachedFetch, fetchJsonOrThrow, type UpstreamPolicy } from "../upstream";
import type {
  OverpassResponse,
  OverpassElement,
  AiDataCenterSite,
  AiDataCenterSourceStatus,
  OperatorType,
} from "./types";

const OVERPASS_API = "https://overpass-api.de/api/interpreter";

const OVERPASS_POLICY: UpstreamPolicy = {
  key: "ai-dc-overpass",
  ttlMs: 4 * 60 * 60_000,
  staleTtlMs: 48 * 60 * 60_000,
  timeoutMs: 55_000,
  maxRetries: 1,
  backoffBaseMs: 3_000,
  circuitFailureThreshold: 3,
  circuitOpenMs: 10 * 60_000,
  rateLimit: { capacity: 1, refillPerSec: 0.1, minIntervalMs: 10_000 },
};

const OVERPASS_QUERY = `[out:json][timeout:55];
(
  nwr["building"="data_centre"];
  nwr["building"="data_center"];
  nwr["telecom"="data_center"];
  nwr["man_made"="data_center"];
  nwr["industrial"="data_centre"];
  nwr["landuse"="industrial"]["name"~"[Dd]ata [Cc]ent(er|re)",i];
);
out center 2000;`;

// ── Operator classification (same logic as wikidata.ts) ──────────────────────

const HYPERSCALER_PATTERNS = [
  "google", "alphabet", "amazon", "aws", "microsoft", "azure", "meta",
  "facebook", "apple", "oracle", "alibaba", "aliyun", "tencent", "huawei",
  "nvidia", "xai", "bytedance", "samsung sds", "baidu",
];
const COLOCATION_PATTERNS = [
  "equinix", "digital realty", "cyrusone", "qts", "coresite", "ntt",
  "vantage", "flexential", "databank", "switch", "aligned",
  "iron mountain", "compass", "edgeconnex", "stack infrastructure", "yondr",
];
const TELECOM_PATTERNS = [
  "at&t", "verizon", "deutsche telekom", "vodafone", "bt ", "orange",
  "telefonica", "china telecom", "china unicom", "china mobile", "kddi",
  "singtel", "telstra",
];

function classifyOperator(name: string): OperatorType {
  const lower = name.toLowerCase();
  if (HYPERSCALER_PATTERNS.some((p) => lower.includes(p))) return "hyperscaler";
  if (COLOCATION_PATTERNS.some((p) => lower.includes(p))) return "colocation";
  if (TELECOM_PATTERNS.some((p) => lower.includes(p))) return "telecom";
  return "unknown";
}

function normalizeOperator(name: string): string {
  const lower = name.toLowerCase().trim();
  if (lower.includes("amazon") || lower.includes("aws")) return "Amazon (AWS)";
  if (lower.includes("google") || lower.includes("alphabet")) return "Google";
  if (lower.includes("microsoft") || lower.includes("azure")) return "Microsoft";
  if (lower.includes("meta") || lower.includes("facebook")) return "Meta";
  if (lower.includes("equinix")) return "Equinix";
  if (lower.includes("digital realty")) return "Digital Realty";
  if (lower.includes("ntt")) return "NTT";
  return name.trim();
}

// ── Parse Overpass elements ──────────────────────────────────────────────────

function getCoord(el: OverpassElement): { lat: number; lon: number } | null {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat! < -90 || lat! > 90 || lon! < -180 || lon! > 180) return null;
  return { lat: lat!, lon: lon! };
}

function buildEvidenceTags(tags: Record<string, string>): string[] {
  const evidence: string[] = [];
  if (tags.building === "data_centre" || tags.building === "data_center") {
    evidence.push("osm:building=data_centre");
  }
  if (tags.telecom === "data_center") evidence.push("osm:telecom=data_center");
  if (tags.man_made === "data_center") evidence.push("osm:man_made=data_center");
  if (tags.industrial === "data_centre") evidence.push("osm:industrial=data_centre");
  if (evidence.length === 0) evidence.push("osm:name_heuristic");
  return evidence;
}

function computeConfidence(tags: Record<string, string>): number {
  // Explicit data center tags = high confidence
  if (
    tags.building === "data_centre" ||
    tags.building === "data_center" ||
    tags.telecom === "data_center" ||
    tags.man_made === "data_center"
  ) {
    return 75;
  }
  // Name-based heuristic match only
  return 40;
}

function parseElements(elements: OverpassElement[]): AiDataCenterSite[] {
  const now = Date.now();
  const sites: AiDataCenterSite[] = [];

  for (const el of elements) {
    const coord = getCoord(el);
    if (!coord) continue;

    const tags = el.tags ?? {};
    const name = tags.name || tags["name:en"] || `OSM ${el.type}/${el.id}`;
    const rawOperator = tags.operator || tags["operator:wikidata"] || "";
    const operator = rawOperator ? normalizeOperator(rawOperator) : "Unknown";
    const operatorType = rawOperator ? classifyOperator(rawOperator) : "unknown";

    sites.push({
      id: `osm-${el.type}-${el.id}`,
      sourceId: `${el.type}/${el.id}`,
      sourceType: "osm",
      name,
      operator,
      operatorType,
      lat: coord.lat,
      lon: coord.lon,
      country: tags["addr:country"] || "",
      countryIso2: (tags["addr:country"] || "").toUpperCase().slice(0, 2),
      admin1: tags["addr:state"] || tags["addr:province"] || undefined,
      city: tags["addr:city"] || undefined,
      evidenceTags: buildEvidenceTags(tags),
      confidence: computeConfidence(tags),
      lastUpdated: now,
    });
  }

  return sites;
}

// ── Public entry point ───────────────────────────────────────────────────────

export async function fetchDataCentersFromOverpass(): Promise<{
  sites: AiDataCenterSite[];
  sourceStatus: AiDataCenterSourceStatus;
}> {
  const result = await cachedFetch<OverpassResponse>({
    cacheKey: "ai-dc-overpass",
    policy: OVERPASS_POLICY,
    request: () =>
      fetchJsonOrThrow<OverpassResponse>(
        OVERPASS_API,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
        },
        OVERPASS_POLICY.timeoutMs,
      ),
    fallbackValue: { elements: [] },
  });

  const elements = result.data?.elements ?? [];
  const sites = parseElements(elements);

  const sourceStatus: AiDataCenterSourceStatus = {
    status: result.degraded ? "degraded" : sites.length > 0 ? "live" : "unavailable",
    lastUpdated: sites.length > 0 ? Date.now() : null,
    errorCode: result.error ?? null,
  };

  return { sites, sourceStatus };
}
