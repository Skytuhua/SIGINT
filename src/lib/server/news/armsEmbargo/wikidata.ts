import crypto from "node:crypto";
import type {
  ArmsEmbargoAuthority,
  ArmsEmbargoProgramme,
  ArmsEmbargoScope,
  ArmsEmbargoStatus,
  ArmsEmbargoSource,
} from "./types";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const REQUEST_TIMEOUT_MS = 30_000;
const USER_AGENT = "WorldView/1.0 (arms-embargo-layer; https://github.com/worldview)";

const SPARQL_QUERY = `
SELECT DISTINCT
  ?programme ?programmeLabel ?programmeDescription
  ?target ?targetLabel ?targetIso
  ?authority ?authorityLabel
  ?start ?end
  ?legalBasis ?legalBasisLabel
  ?officialSite ?refUrl
  ?instanceOf ?instanceOfLabel
WHERE {
  {
    ?programme wdt:P31/wdt:P279* wd:Q989265 .
  } UNION {
    ?programme wdt:P31 wd:Q2159911 .
  } UNION {
    ?programme wdt:P31 wd:Q15617994 .
  }

  OPTIONAL { ?programme wdt:P1001 ?target . ?target wdt:P297 ?targetIso . }
  OPTIONAL { ?programme wdt:P17 ?targetCountry2 . ?targetCountry2 wdt:P297 ?targetIso2 . }
  OPTIONAL { ?programme wdt:P797 ?authority . }
  OPTIONAL { ?programme wdt:P137 ?authority2 . }
  OPTIONAL { ?programme wdt:P580 ?start . }
  OPTIONAL { ?programme wdt:P582 ?end . }
  OPTIONAL { ?programme wdt:P457 ?legalBasis . }
  OPTIONAL { ?programme wdt:P856 ?officialSite . }
  OPTIONAL { ?programme wdt:P31 ?instanceOf . }

  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,es,de,ru,zh,ar" . }
}
LIMIT 2000
`;

interface SparqlBinding {
  programme?: { type: string; value: string };
  programmeLabel?: { type: string; value: string };
  programmeDescription?: { type: string; value: string };
  target?: { type: string; value: string };
  targetLabel?: { type: string; value: string };
  targetIso?: { type: string; value: string };
  targetCountry2?: { type: string; value: string };
  targetIso2?: { type: string; value: string };
  authority?: { type: string; value: string };
  authorityLabel?: { type: string; value: string };
  authority2?: { type: string; value: string };
  start?: { type: string; value: string };
  end?: { type: string; value: string };
  legalBasis?: { type: string; value: string };
  legalBasisLabel?: { type: string; value: string };
  officialSite?: { type: string; value: string };
  refUrl?: { type: string; value: string };
  instanceOf?: { type: string; value: string };
  instanceOfLabel?: { type: string; value: string };
}

function qidFromUri(uri: string): string {
  const parts = uri.split("/");
  return parts[parts.length - 1];
}

function strVal(binding: { type: string; value: string } | undefined): string | null {
  return binding?.value?.trim() || null;
}

function parseDate(binding: { type: string; value: string } | undefined): string | null {
  const raw = strVal(binding);
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

const AUTHORITY_MAP: Record<string, ArmsEmbargoAuthority> = {
  Q37470: "UNSC",    // United Nations Security Council
  Q899770: "UNSC",   // UNSC resolution
  Q1065: "UNSC",     // United Nations
  Q458: "EU",        // European Union
  Q21: "UK",         // United Kingdom
  Q30: "US",         // United States
};

function classifyAuthority(
  authorityUri: string | null,
  authorityLabel: string | null,
  programmeLabel: string | null,
  description: string | null
): ArmsEmbargoAuthority {
  if (authorityUri) {
    const qid = qidFromUri(authorityUri);
    if (AUTHORITY_MAP[qid]) return AUTHORITY_MAP[qid];
  }

  const haystack = [authorityLabel, programmeLabel, description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\bunsc\b|united nations|security council|un\s+arms\s+embargo/.test(haystack)) return "UNSC";
  if (/\beu\b|european union|european council/.test(haystack)) return "EU";
  if (/\buk\b|united kingdom|british/.test(haystack)) return "UK";
  if (/\bus\b|united states|ofac|itar/.test(haystack)) return "US";
  return "Other";
}

function classifyScope(
  description: string | null,
  instanceOfLabel: string | null,
  programmeLabel: string | null,
  measures: string[]
): ArmsEmbargoScope {
  const haystack = [description, instanceOfLabel, programmeLabel, ...measures]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\bpartial\b|\btargeted\b|\bselective\b|\bspecific\b|\blimited\b/.test(haystack)) return "Partial";
  if (/\bcomprehensive\b|\bfull\b|\btotal\b|\bcomplete\b/.test(haystack)) return "Full";
  if (/\barms embargo\b/.test(haystack)) return "Full";
  return "Unknown";
}

function classifyStatus(startDate: string | null, endDate: string | null): ArmsEmbargoStatus {
  if (endDate) {
    const end = new Date(endDate);
    if (!isNaN(end.getTime()) && end < new Date()) return "Ended";
    if (!isNaN(end.getTime()) && end >= new Date()) return "Active";
  }
  if (startDate) return "Active";
  return "Unknown";
}

function buildMeasures(
  instanceOfLabel: string | null,
  description: string | null,
  programmeLabel: string | null
): string[] {
  const measures: string[] = [];
  const haystack = [instanceOfLabel, description, programmeLabel]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/arms embargo/.test(haystack)) measures.push("Arms embargo");
  if (/dual.use/.test(haystack)) measures.push("Dual-use restrictions");
  if (/military assistance|military aid/.test(haystack)) measures.push("Military assistance ban");
  if (/training ban|military training/.test(haystack)) measures.push("Military training ban");
  if (/technical assistance/.test(haystack)) measures.push("Technical assistance restrictions");
  if (/financial|economic sanction/.test(haystack)) measures.push("Financial sanctions");

  if (measures.length === 0) measures.push("Arms embargo");
  return measures;
}

function classifySourceName(url: string): string {
  const host = url.toLowerCase();
  if (host.includes("un.org")) return "UN";
  if (host.includes("europa.eu") || host.includes("eur-lex")) return "EU";
  if (host.includes("gov.uk")) return "UK";
  if (host.includes("state.gov") || host.includes("treasury.gov") || host.includes("congress.gov")) return "US";
  if (host.includes("wikidata.org")) return "Wikidata";
  return "External";
}

function stableId(authority: ArmsEmbargoAuthority, name: string, startDate: string | null, target: string): string {
  const input = `${authority}|${name}|${startDate ?? ""}|${target}`;
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 16);
}

export async function fetchProgrammesFromWikidata(): Promise<ArmsEmbargoProgramme[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${SPARQL_ENDPOINT}?query=${encodeURIComponent(SPARQL_QUERY)}`, {
      headers: {
        Accept: "application/sparql-results+json",
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`Wikidata SPARQL returned ${res.status}: ${res.statusText}`);
    }

    const json = (await res.json()) as { results?: { bindings?: SparqlBinding[] } };
    const bindings = json.results?.bindings ?? [];
    return normalizeSparqlResults(bindings);
  } finally {
    clearTimeout(timer);
  }
}

function normalizeSparqlResults(bindings: SparqlBinding[]): ArmsEmbargoProgramme[] {
  const grouped = new Map<string, {
    qid: string;
    label: string;
    description: string | null;
    targets: Map<string, string>;
    authorityUri: string | null;
    authorityLabel: string | null;
    startDate: string | null;
    endDate: string | null;
    legalBasis: string | null;
    legalBasisLabel: string | null;
    officialSites: Set<string>;
    instanceOfLabel: string | null;
  }>();

  for (const b of bindings) {
    const progUri = strVal(b.programme);
    if (!progUri) continue;
    const qid = qidFromUri(progUri);

    let group = grouped.get(qid);
    if (!group) {
      group = {
        qid,
        label: strVal(b.programmeLabel) ?? qid,
        description: strVal(b.programmeDescription) ?? null,
        targets: new Map(),
        authorityUri: strVal(b.authority) ?? strVal(b.authority2 as any) ?? null,
        authorityLabel: strVal(b.authorityLabel) ?? null,
        startDate: parseDate(b.start),
        endDate: parseDate(b.end),
        legalBasis: strVal(b.legalBasis) ?? null,
        legalBasisLabel: strVal(b.legalBasisLabel) ?? null,
        officialSites: new Set(),
        instanceOfLabel: strVal(b.instanceOfLabel) ?? null,
      };
      grouped.set(qid, group);
    }

    const iso = strVal(b.targetIso) ?? strVal(b.targetIso2 as any);
    if (iso) {
      const isoUpper = iso.toUpperCase();
      const targetLabel = strVal(b.targetLabel) ?? isoUpper;
      group.targets.set(isoUpper, targetLabel);
    }

    if (!group.startDate && b.start) group.startDate = parseDate(b.start);
    if (!group.endDate && b.end) group.endDate = parseDate(b.end);

    const site = strVal(b.officialSite);
    if (site) group.officialSites.add(site);
    const refUrl = strVal(b.refUrl);
    if (refUrl) group.officialSites.add(refUrl);
  }

  const programmes: ArmsEmbargoProgramme[] = [];
  const now = new Date().toISOString();

  for (const [, g] of Array.from(grouped.entries())) {
    const authority = classifyAuthority(g.authorityUri, g.authorityLabel, g.label, g.description);
    const measures = buildMeasures(g.instanceOfLabel, g.description, g.label);
    const scope = classifyScope(g.description, g.instanceOfLabel, g.label, measures);
    const status = classifyStatus(g.startDate, g.endDate);

    const targets: string[] = Array.from(g.targets.keys());
    const mainTarget = targets[0] ?? g.qid;

    const sources: ArmsEmbargoSource[] = [
      {
        sourceName: "Wikidata",
        sourceUrl: `https://www.wikidata.org/wiki/${g.qid}`,
        sourceId: g.qid,
      },
    ];

    const officialSiteUrls = Array.from(g.officialSites);
    for (const url of officialSiteUrls) {
      sources.push({
        sourceName: classifySourceName(url),
        sourceUrl: url,
        sourceId: null,
      });
    }

    programmes.push({
      id: stableId(authority, g.label, g.startDate, mainTarget),
      name: g.label,
      authority,
      scope,
      measures,
      startDate: g.startDate,
      endDate: g.endDate,
      status,
      legalBasis: g.legalBasisLabel ?? g.legalBasis ? `${g.legalBasisLabel ?? g.legalBasis}` : null,
      sources,
      lastUpdated: now,
      targets,
      wikidataQid: g.qid,
    });
  }

  return programmes;
}
