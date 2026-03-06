import { cachedFetch, fetchJsonOrThrow, type CachedFetchResult, type UpstreamPolicy } from "../upstream";
import type {
  NuclearFacilityRecord,
  NuclearFacilityStatus,
  NuclearFacilityType,
  NuclearFacilitySourceIds,
  NuclearSourceKey,
  NuclearSourceStatus,
  NuclearSourceStatusMap,
} from "./types";

const WIKIDATA_SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

type WikidataBinding = Record<
  string,
  { type: string; value: string } | undefined
>;

interface WikidataSparqlResponse {
  results?: { bindings?: WikidataBinding[] };
}

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

export interface NuclearFetchResult {
  facilities: NuclearFacilityRecord[];
  sourceStatus: NuclearSourceStatusMap;
}

function baseSourceStatus(source: NuclearSourceKey): NuclearSourceStatus {
  return { status: "unavailable", lastUpdated: null, errorCode: null };
}

function statusFromCached<T>(
  source: NuclearSourceKey,
  res: CachedFetchResult<T>
): NuclearSourceStatus {
  if (res.cacheHit === "fresh" && !res.degraded) {
    return { status: "live", lastUpdated: Date.now(), errorCode: null };
  }
  if (res.cacheHit === "stale" && !res.degraded) {
    return { status: "cached", lastUpdated: Date.now(), errorCode: null };
  }
  if (res.cacheHit === "stale" && res.degraded) {
    return { status: "degraded", lastUpdated: Date.now(), errorCode: res.error ?? null };
  }
  return {
    status: res.degraded ? "degraded" : "unavailable",
    lastUpdated: res.degraded ? Date.now() : null,
    errorCode: res.error ?? null,
  };
}

// ---- Wikidata ----

const WIKIDATA_POLICY: UpstreamPolicy = {
  key: "nuclear-wikidata",
  ttlMs: 24 * 60 * 60_000,
  staleTtlMs: 10 * 24 * 60 * 60_000,
  timeoutMs: 15_000,
  maxRetries: 1,
  backoffBaseMs: 800,
  circuitFailureThreshold: 3,
  circuitOpenMs: 3 * 60_000,
  rateLimit: { capacity: 1, refillPerSec: 0.5, minIntervalMs: 1000 },
};

function wikidataFacilitiesQuery(): string {
  // This query intentionally stays high-level: it targets nuclear power plants,
  // research reactors, fuel-cycle facilities and waste sites using a union of
  // instance-of / subclass-of constraints that are commonly used on Wikidata.
  // It only requests non-sensitive, high-level metadata.
  return `
SELECT ?item ?itemLabel ?itemDescription ?coord ?country ?countryLabel ?admin1 ?admin1Label ?operator ?operatorLabel ?statusLabel ?capacityMw ?reactorCount ?startDate WHERE {
  VALUES ?nuclearClass {
    wd:Q134447  # nuclear power plant
    wd:Q601568  # research reactor
    wd:Q3962114 # uranium enrichment plant
    wd:Q211271  # nuclear fuel reprocessing plant
    wd:Q203013  # nuclear fuel fabrication plant
    wd:Q746413  # spent fuel pool
    wd:Q843823  # radioactive waste repository
  }
  ?item wdt:P31/wdt:P279* ?nuclearClass.
  OPTIONAL { ?item wdt:P625 ?coord. }
  OPTIONAL { ?item wdt:P17 ?country. }
  OPTIONAL { ?item wdt:P131 ?admin1. }
  OPTIONAL { ?item wdt:P137 ?operator. }
  OPTIONAL { ?item wdt:P580 ?startDate. }
  OPTIONAL { ?item wdt:P548 ?status. }
  OPTIONAL { ?item wdt:P5800 ?capacityMw. }  # electrical capacity (MW)
  OPTIONAL { ?item wdt:P2959 ?reactorCount. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 4000
`.trim();
}

function parseWikidataNumber(binding?: { value: string }): number | undefined {
  if (!binding) return undefined;
  const n = Number(binding.value);
  return Number.isFinite(n) ? n : undefined;
}

function parseCoordLiteral(coordLiteral?: { value: string }): { lat: number; lon: number } | null {
  if (!coordLiteral) return null;
  const v = coordLiteral.value;
  // Coordinates are typically in the form "Point( lon lat )"
  const match = /Point\\(([-\\d\\.]+) ([-\\d\\.]+)\\)/.exec(v);
  if (!match) return null;
  const lon = Number(match[1]);
  const lat = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function normalizeWikidataStatus(label?: string): NuclearFacilityStatus {
  if (!label) return "Unknown";
  const v = label.toLowerCase();
  if (v.includes("operat")) return "Operating";
  if (v.includes("construct")) return "Under Construction";
  if (v.includes("plan")) return "Planned";
  if (v.includes("decommission")) return "Decommissioning";
  if (v.includes("retired") || v.includes("shutdown") || v.includes("closed")) return "Retired";
  return "Unknown";
}

function normalizeWikidataType(label?: string, desc?: string): NuclearFacilityType {
  const text = `${label ?? ""} ${desc ?? ""}`.toLowerCase();
  if (text.includes("power") || text.includes("nuclear power plant")) return "Nuclear Power Plant";
  if (text.includes("research") || text.includes("experimental")) return "Research Reactor";
  if (text.includes("enrichment")) return "Uranium Enrichment";
  if (text.includes("reprocessing")) return "Reprocessing";
  if (text.includes("fabrication")) return "Fuel Fabrication";
  if (text.includes("waste") || text.includes("repository")) return "Waste Repository / Interim Storage";
  if (text.includes("storage")) return "Spent Fuel Storage / Dry Cask";
  return "Other Nuclear Facility";
}

function facilityIdFromQid(qid: string): string {
  return qid || "";
}

export async function fetchFromWikidata(): Promise<NuclearFetchResult> {
  const query = wikidataFacilitiesQuery();
  const url = new URL(WIKIDATA_SPARQL_ENDPOINT);
  url.searchParams.set("query", query);
  url.searchParams.set("format", "json");

  const res = await cachedFetch<WikidataSparqlResponse>({
    cacheKey: "nuclear-facilities-v1",
    policy: WIKIDATA_POLICY,
    request: () =>
      fetchJsonOrThrow<WikidataSparqlResponse>(
        url.toString(),
        { headers: { accept: "application/sparql-results+json" } },
        WIKIDATA_POLICY.timeoutMs
      ),
    fallbackValue: { results: { bindings: [] } },
  });

  const bindings = res.data.results?.bindings ?? [];
  const facilities: NuclearFacilityRecord[] = [];

  for (const row of bindings) {
    const item = row.item?.value;
    if (!item) continue;
    const qid = item.split("/").pop() ?? "";
    if (!qid) continue;

    const coord = parseCoordLiteral(row.coord as any);
    if (!coord) continue;

    const label = row.itemLabel?.value ?? qid;
    const desc = row.itemDescription?.value;
    const type = normalizeWikidataType(label, desc);
    const status = normalizeWikidataStatus((row.statusLabel as any)?.value);
    const country = row.countryLabel?.value ?? undefined;
    const admin1 = row.admin1Label?.value ?? undefined;
    const operator = row.operatorLabel?.value ?? undefined;
    const capacityMw = parseWikidataNumber(row.capacityMw as any);
    const reactorCount = parseWikidataNumber(row.reactorCount as any);
    const startDate = (row.startDate as any)?.value ?? undefined;

    const sourceIds: NuclearFacilitySourceIds = { wikidataQid: qid };
    const references = [
      {
        label: "Wikidata item",
        url: `https://www.wikidata.org/wiki/${qid}`,
      },
    ];

    const record: NuclearFacilityRecord = {
      id: facilityIdFromQid(qid),
      name: label,
      type,
      status,
      lat: coord.lat,
      lon: coord.lon,
      country,
      admin1,
      operator,
      capacityMw,
      reactorCount,
      startDate,
      lastUpdated: Date.now(),
      sourceName: "Wikidata",
      sourceUrl: `https://query.wikidata.org/`,
      sourceIds,
      references,
      rawUpstream: { wikidata: row },
    };
    facilities.push(record);
  }

  const sourceStatus: NuclearSourceStatusMap = {
    wikidata: statusFromCached("wikidata", res),
    osm: baseSourceStatus("osm"),
    nrc: baseSourceStatus("nrc"),
    snapshot: baseSourceStatus("snapshot"),
  };

  return { facilities, sourceStatus };
}

// ---- OpenStreetMap / Overpass ----

const OVERPASS_POLICY: UpstreamPolicy = {
  key: "nuclear-overpass",
  ttlMs: 24 * 60 * 60_000,
  staleTtlMs: 7 * 24 * 60 * 60_000,
  timeoutMs: 25_000,
  maxRetries: 1,
  backoffBaseMs: 1000,
  circuitFailureThreshold: 3,
  circuitOpenMs: 5 * 60_000,
  rateLimit: { capacity: 1, refillPerSec: 0.2, minIntervalMs: 5000 },
};

function overpassQuery(): string {
  // Global query for nuclear generation / plant features.
  // We keep geometry to derive footprints where possible.
  return `
[out:json][timeout:60];
(
  node["power"="plant"]["plant:source"="nuclear"];
  way["power"="plant"]["plant:source"="nuclear"];
  relation["power"="plant"]["plant:source"="nuclear"];
  node["power"="generator"]["generator:source"="nuclear"];
  way["power"="generator"]["generator:source"="nuclear"];
  relation["power"="generator"]["generator:source"="nuclear"];
);
out center geom;
`.trim();
}

function normalizeOsmType(tags: Record<string, string>): NuclearFacilityType {
  const plantSource = tags["plant:source"] ?? "";
  const generatorSource = tags["generator:source"] ?? "";
  const lower = `${plantSource} ${generatorSource}`.toLowerCase();
  if (lower.includes("nuclear")) return "Nuclear Power Plant";
  return "Other Nuclear Facility";
}

function normalizeOsmStatus(tags: Record<string, string>): NuclearFacilityStatus {
  const lifecycle = (tags["lifecycle"] ?? tags["disused"] ?? tags["abandoned"] ?? "").toLowerCase();
  const status = (tags["operational_status"] ?? tags["status"] ?? "").toLowerCase();
  if (status.includes("construction")) return "Under Construction";
  if (status.includes("planned") || status.includes("proposed")) return "Planned";
  if (status.includes("decommission")) return "Decommissioning";
  if (lifecycle.includes("abandoned") || lifecycle.includes("disused")) return "Retired";
  return "Operating";
}

function osmFeatureId(el: OverpassElement): string {
  return `${el.type}/${el.id}`;
}

export async function fetchFromOverpass(): Promise<NuclearFetchResult> {
  const body = `data=${encodeURIComponent(overpassQuery())}`;

  const res = await cachedFetch<OverpassResponse>({
    cacheKey: "nuclear-overpass-v1",
    policy: OVERPASS_POLICY,
    fallbackValue: { elements: [] },
    request: async () =>
      fetchJsonOrThrow<OverpassResponse>(
        OVERPASS_ENDPOINT,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "WorldView/0.1 (research; nuclear-sites)",
          },
          body,
        },
        OVERPASS_POLICY.timeoutMs
      ),
  });

  const elements = res.data.elements ?? [];
  const facilities: NuclearFacilityRecord[] = [];

  for (const el of elements) {
    const tags = el.tags ?? {};
    const id = osmFeatureId(el);
    const center = el.center ?? (el.lat != null && el.lon != null ? { lat: el.lat, lon: el.lon } : null);
    if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lon)) continue;

    const name = tags.name || "Nuclear Facility";
    const type = normalizeOsmType(tags);
    const status = normalizeOsmStatus(tags);
    const country = tags["addr:country"] ?? tags["is_in:country"] ?? undefined;
    const admin1 = tags["addr:state"] ?? tags["addr:province"] ?? undefined;
    const operator = tags.operator ?? undefined;

    const refCapacity = tags["plant:output:electricity"] ?? tags["generator:output:electricity"];
    const capacityMw = refCapacity ? Number(refCapacity) || undefined : undefined;
    const reactorCount =
      tags["reactor:count"] != null ? Number(tags["reactor:count"]) || undefined : undefined;

    let footprint: Array<[number, number]> | undefined;
    if (Array.isArray(el.geometry) && el.geometry.length >= 3) {
      footprint = el.geometry.map((p) => [p.lon, p.lat] as [number, number]);
    }

    const sourceIds: NuclearFacilitySourceIds = { osmId: id };
    const references = [
      {
        label: "OpenStreetMap element",
        url: `https://www.openstreetmap.org/${id}`,
      },
    ];

    const record: NuclearFacilityRecord = {
      id,
      name,
      type,
      status,
      lat: center.lat,
      lon: center.lon,
      geometryPolygon: footprint,
      country,
      admin1,
      operator,
      capacityMw,
      reactorCount,
      startDate: undefined,
      lastUpdated: Date.now(),
      sourceName: "OpenStreetMap Overpass",
      sourceUrl: "https://overpass-api.de/api/interpreter",
      sourceIds,
      references,
      rawUpstream: { osm: el },
    };
    facilities.push(record);
  }

  const sourceStatus: NuclearSourceStatusMap = {
    wikidata: baseSourceStatus("wikidata"),
    osm: statusFromCached("osm", res),
    nrc: baseSourceStatus("nrc"),
    snapshot: baseSourceStatus("snapshot"),
  };

  return { facilities, sourceStatus };
}

// ---- US NRC (placeholder / extensible) ----

const NRC_POLICY: UpstreamPolicy = {
  key: "nuclear-nrc",
  ttlMs: 7 * 24 * 60 * 60_000,
  staleTtlMs: 30 * 24 * 60 * 60_000,
  timeoutMs: 12_000,
  maxRetries: 1,
  backoffBaseMs: 1200,
  circuitFailureThreshold: 3,
  circuitOpenMs: 10 * 60_000,
};

// For now, we keep NRC integration minimal and ready to be extended with a real
// dataset URL. The structure is kept similar to other fetchers so we can drop
// in the actual endpoint later without touching the merge logic.
export async function fetchFromNrc(): Promise<NuclearFetchResult> {
  const facilities: NuclearFacilityRecord[] = [];

  const res: CachedFetchResult<unknown> = {
    data: null,
    degraded: true,
    latencyMs: 0,
    cacheHit: "miss",
    error: "nrc-not-configured",
  };

  const sourceStatus: NuclearSourceStatusMap = {
    wikidata: baseSourceStatus("wikidata"),
    osm: baseSourceStatus("osm"),
    nrc: {
      status: "unavailable",
      lastUpdated: null,
      errorCode: "nrc-not-configured",
    },
    snapshot: baseSourceStatus("snapshot"),
  };

  // The facilities array is intentionally empty until a concrete NRC feed is
  // specified; this still allows the overall pipeline to function using
  // Wikidata and OSM while leaving a clear hook for future enhancement.
  void res; // keep lint happy about unused variable

  return { facilities, sourceStatus };
}

