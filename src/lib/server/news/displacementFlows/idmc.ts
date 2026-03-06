import type { DisplacementFlow, SourceStatus } from "./types";
import { getCentroid } from "./countryCentroids";
import { formatValue } from "./pipeline";

const IDMC_API = "https://api.internal-displacement.org/countries/all";
const IDMC_SOURCE_URL = "https://www.internal-displacement.org/database/";
const CACHE_TTL_MS = 24 * 60 * 60_000;
// Small offset so IDP LineStrings are not zero-length on the map
const IDP_OFFSET_DEG = 1.5;

interface IdmcCountry {
  iso3?: string;
  country_name?: string;
  total_displacement?: number | null;
  conflict_displacement?: number | null;
  disaster_displacement?: number | null;
}

interface IdmcCache {
  flows: DisplacementFlow[];
  savedAt: number;
}

let _cache: IdmcCache | null = null;

function isCacheValid(): boolean {
  return Boolean(_cache && Date.now() - _cache.savedAt < CACHE_TTL_MS);
}

export async function fetchIdmcFlows(signal?: AbortSignal): Promise<{
  flows: DisplacementFlow[];
  status: SourceStatus;
}> {
  if (isCacheValid() && _cache) {
    return { flows: _cache.flows, status: "cached" };
  }

  try {
    const res = await fetch(IDMC_API, {
      headers: { Accept: "application/json" },
      signal: signal ?? AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`IDMC API ${res.status}`);

    const data: IdmcCountry[] = await res.json();
    const now = Date.now();
    const flows: DisplacementFlow[] = [];
    const year = new Date().getFullYear() - 1; // IDMC typically publishes previous-year data

    for (const item of data) {
      const iso3 = item.iso3?.toUpperCase();
      if (!iso3) continue;

      const centroid = getCentroid(iso3);
      if (!centroid) continue;

      const countryName = item.country_name ?? iso3;
      const conflictVal = Number(item.conflict_displacement ?? 0);
      const disasterVal = Number(item.disaster_displacement ?? 0);

      // Conflict IDPs
      if (conflictVal >= 1000) {
        flows.push(makeIdpFlow({
          iso3,
          countryName,
          centroid,
          value: conflictVal,
          cause: "conflict",
          year,
          now,
        }));
      }

      // Disaster IDPs (separate flow entry)
      if (disasterVal >= 1000) {
        flows.push(makeIdpFlow({
          iso3,
          countryName,
          centroid,
          value: disasterVal,
          cause: "disaster",
          year,
          now,
          idSuffix: "-dis",
        }));
      }
    }

    flows.sort((a, b) => b.value - a.value);
    _cache = { flows, savedAt: now };
    return { flows, status: "live" };
  } catch {
    if (_cache) {
      return { flows: _cache.flows, status: "degraded" };
    }
    return { flows: [], status: "unavailable" };
  }
}

function makeIdpFlow(opts: {
  iso3: string;
  countryName: string;
  centroid: [number, number];
  value: number;
  cause: "conflict" | "disaster";
  year: number;
  now: number;
  idSuffix?: string;
}): DisplacementFlow {
  const { iso3, countryName, centroid, value, cause, year, now, idSuffix = "" } = opts;
  const [lat, lon] = centroid;
  return {
    id: `idmc-idp-${iso3}-${cause}${idSuffix}-${year}`,
    flowType: "idp",
    corridorName: `${countryName} (Internal)`,
    originName: countryName,
    originIso3: iso3,
    originLat: lat,
    originLon: lon,
    destinationName: countryName,
    destinationIso3: iso3,
    // Slight offset so MapLibre renders a visible short arc
    destLat: lat + IDP_OFFSET_DEG,
    destLon: lon + IDP_OFFSET_DEG,
    value,
    valueFormatted: formatValue(value),
    unit: "individuals",
    cause,
    confidence: "estimated",
    timeRangeFrom: `${year}-01-01`,
    timeRangeTo: `${year}-12-31`,
    sourceName: "IDMC",
    sourceUrl: IDMC_SOURCE_URL,
    lastUpdated: now,
    ts: now,
  };
}
