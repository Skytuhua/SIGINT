import { cachedFetch, fetchJsonOrThrow, type CachedFetchResult, type UpstreamPolicy } from "../upstream";
import type {
  WikidataSparqlResponse,
  WikidataBinding,
  RawEconomicHub,
  EconomicHubAsset,
  EconomicCenterSourceStatus,
} from "./types";

const WIKIDATA_SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

const WIKIDATA_POLICY: UpstreamPolicy = {
  key: "econ-centers-wikidata",
  ttlMs: 4 * 60 * 60_000,
  staleTtlMs: 40 * 60 * 60_000,
  timeoutMs: 25_000,
  maxRetries: 1,
  backoffBaseMs: 2_000,
  circuitFailureThreshold: 3,
  circuitOpenMs: 5 * 60_000,
  rateLimit: { capacity: 1, refillPerSec: 0.3, minIntervalMs: 3_000 },
};

// Fetch cities (pop >= 300k OR has a stock exchange) with associated
// exchanges, major ports, and IATA airports in a single SPARQL round-trip.
// Rows are one-per-asset so the same city may appear multiple times;
// the parser groups by city QID.
function buildCitiesQuery(): string {
  return `
SELECT ?city ?cityLabel ?coord ?country ?countryLabel ?countryIso2
       ?admin1Label ?population ?exchange ?exchangeLabel ?port ?portLabel
       ?airport ?airportLabel
WHERE {
  VALUES ?cityClass {
    wd:Q515      wd:Q1549591  wd:Q1637706  wd:Q208511  wd:Q202754
  }
  ?city wdt:P31/wdt:P279* ?cityClass.
  OPTIONAL { ?city wdt:P625 ?coord. }
  OPTIONAL {
    ?city wdt:P17 ?country.
    OPTIONAL { ?country wdt:P297 ?countryIso2. }
  }
  OPTIONAL {
    ?city wdt:P131 ?admin1.
    ?admin1 rdfs:label ?admin1Label.
    FILTER(LANG(?admin1Label) = "en")
  }
  OPTIONAL { ?city wdt:P1082 ?population. }
  OPTIONAL {
    ?exchange wdt:P31/wdt:P279* wd:Q11691.
    ?exchange wdt:P131|wdt:P276|wdt:P159 ?city.
    FILTER NOT EXISTS { ?exchange wdt:P576 []. }
  }
  OPTIONAL {
    ?port wdt:P31/wdt:P279* wd:Q44782.
    ?port wdt:P131|wdt:P276 ?city.
  }
  OPTIONAL {
    ?airport wdt:P31/wdt:P279* wd:Q1248784.
    ?airport wdt:P131|wdt:P276 ?city.
    FILTER EXISTS { ?airport wdt:P239 []. }
  }
  FILTER(?population >= 300000 || BOUND(?exchange))
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY DESC(?population)
LIMIT 500
`.trim();
}

function parseWikidataNumber(binding?: { value: string }): number | undefined {
  if (!binding) return undefined;
  const n = Number(binding.value);
  return Number.isFinite(n) ? n : undefined;
}

/** Parse WKT literal: "Point( lon lat )" */
function parseCoordLiteral(binding?: { value: string }): { lat: number; lon: number } | null {
  if (!binding) return null;
  const match = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(binding.value);
  if (!match) return null;
  const lon = Number(match[1]);
  const lat = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function extractQid(uri?: string): string | null {
  if (!uri) return null;
  const m = /\/(Q\d+)$/.exec(uri);
  return m ? m[1] : null;
}

function dedupeAssets(assets: EconomicHubAsset[]): EconomicHubAsset[] {
  const seen = new Set<string>();
  return assets.filter((a) => {
    if (seen.has(a.wikidataQid)) return false;
    seen.add(a.wikidataQid);
    return true;
  });
}

interface WikidataFetchResult {
  rawHubs: RawEconomicHub[];
  sourceStatus: EconomicCenterSourceStatus;
}

export async function fetchFromWikidata(): Promise<WikidataFetchResult> {
  const query = buildCitiesQuery();
  const url = new URL(WIKIDATA_SPARQL_ENDPOINT);
  url.searchParams.set("query", query);
  url.searchParams.set("format", "json");

  const res = await cachedFetch<WikidataSparqlResponse>({
    cacheKey: "econ-centers-wikidata-cities-v2",
    policy: WIKIDATA_POLICY,
    fallbackValue: { results: { bindings: [] } },
    request: () =>
      fetchJsonOrThrow<WikidataSparqlResponse>(
        url.toString(),
        { headers: { Accept: "application/sparql-results+json" } },
        WIKIDATA_POLICY.timeoutMs,
      ),
  });

  const bindings: WikidataBinding[] = res.data.results?.bindings ?? [];

  // Group by city QID — one row per asset attachment
  const hubMap = new Map<
    string,
    Omit<RawEconomicHub, "poiCounts" | "macro"> & {
      exchanges: EconomicHubAsset[];
      ports: EconomicHubAsset[];
      airports: EconomicHubAsset[];
    }
  >();

  for (const row of bindings) {
    const cityUri = row["city"]?.value;
    const cityQid = extractQid(cityUri);
    if (!cityQid) continue;

    if (!hubMap.has(cityQid)) {
      const coord = parseCoordLiteral(row["coord"]);
      if (!coord) continue; // skip cities without coordinates

      hubMap.set(cityQid, {
        id: `wikidata-${cityQid}`,
        wikidataQid: cityQid,
        name: row["cityLabel"]?.value ?? cityQid,
        country: row["countryLabel"]?.value ?? "",
        countryIso2: row["countryIso2"]?.value ?? "",
        admin1: row["admin1Label"]?.value,
        lat: coord.lat,
        lon: coord.lon,
        population: parseWikidataNumber(row["population"] as { value: string } | undefined),
        hasExchange: false,
        hasPort: false,
        hasAirport: false,
        keyAssets: { exchanges: [], ports: [], airports: [] },
        exchanges: [],
        ports: [],
        airports: [],
      });
    }

    const hub = hubMap.get(cityQid)!;

    // Accumulate assets
    const exchangeQid = extractQid(row["exchange"]?.value);
    if (exchangeQid) {
      hub.exchanges.push({
        name: row["exchangeLabel"]?.value ?? exchangeQid,
        wikidataQid: exchangeQid,
      });
      hub.hasExchange = true;
    }

    const portQid = extractQid(row["port"]?.value);
    if (portQid) {
      hub.ports.push({
        name: row["portLabel"]?.value ?? portQid,
        wikidataQid: portQid,
      });
      hub.hasPort = true;
    }

    const airportQid = extractQid(row["airport"]?.value);
    if (airportQid) {
      hub.airports.push({
        name: row["airportLabel"]?.value ?? airportQid,
        wikidataQid: airportQid,
      });
      hub.hasAirport = true;
    }
  }

  // Convert to RawEconomicHub[]
  const rawHubs: RawEconomicHub[] = [];
  for (const [, h] of hubMap) {
    rawHubs.push({
      id: h.id,
      wikidataQid: h.wikidataQid,
      name: h.name,
      country: h.country,
      countryIso2: h.countryIso2,
      admin1: h.admin1,
      lat: h.lat,
      lon: h.lon,
      population: h.population,
      hasExchange: h.hasExchange,
      hasPort: h.hasPort,
      hasAirport: h.hasAirport,
      keyAssets: {
        exchanges: dedupeAssets(h.exchanges),
        ports: dedupeAssets(h.ports),
        airports: dedupeAssets(h.airports),
      },
      // Filled in by the orchestrator after POI + WB fetches
      poiCounts: { banks: 0, financial: 0, ports: 0, airports: 0, industrial: 0 },
      macro: null,
    });
  }

  return { rawHubs, sourceStatus: statusFromResult(res) };
}

function statusFromResult<T>(res: CachedFetchResult<T>): EconomicCenterSourceStatus {
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
