import type { DisplacementFlow, SourceStatus } from "./types";
import { getCentroid } from "./countryCentroids";
import { formatValue } from "./pipeline";

const UNHCR_API =
  "https://api.unhcr.org/population/v1/population/?limit=5000&yearFrom=2023&yearTo=2023&download=false";
const UNHCR_SOURCE_URL = "https://www.unhcr.org/refugee-statistics/";
const CACHE_TTL_MS = 24 * 60 * 60_000;

interface UnhcrItem {
  year?: number;
  iso3_origin?: string;
  coo_name?: string;
  iso3_of_asylum?: string;
  coa_name?: string;
  refugees_under_unhcrs_mandate?: number | null;
  asylum_seekers?: number | null;
}

interface UnhcrApiResponse {
  items?: UnhcrItem[];
  paging?: { total?: number };
}

interface UnhcrCache {
  flows: DisplacementFlow[];
  dataYear: number;
  savedAt: number;
}

let _cache: UnhcrCache | null = null;

function isCacheValid(): boolean {
  return Boolean(_cache && Date.now() - _cache.savedAt < CACHE_TTL_MS);
}

export async function fetchUnhcrFlows(signal?: AbortSignal): Promise<{
  flows: DisplacementFlow[];
  status: SourceStatus;
  dataYear: number;
}> {
  if (isCacheValid() && _cache) {
    return { flows: _cache.flows, status: "cached", dataYear: _cache.dataYear };
  }

  try {
    const res = await fetch(UNHCR_API, {
      headers: { Accept: "application/json" },
      signal: signal ?? AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`UNHCR API ${res.status}`);
    const json: UnhcrApiResponse = await res.json();
    const items: UnhcrItem[] = json.items ?? [];

    const now = Date.now();
    let dataYear = 2023;
    const flows: DisplacementFlow[] = [];

    for (const item of items) {
      const iso3o = item.iso3_origin?.toUpperCase();
      const iso3a = item.iso3_of_asylum?.toUpperCase();
      if (!iso3o || !iso3a || iso3o === iso3a) continue;

      const originCentroid = getCentroid(iso3o);
      const destCentroid = getCentroid(iso3a);
      if (!originCentroid || !destCentroid) continue;

      const refugees = Number(item.refugees_under_unhcrs_mandate ?? 0);
      const asylum = Number(item.asylum_seekers ?? 0);
      const total = refugees + asylum;
      if (total < 100) continue;

      const year = item.year ?? 2023;
      if (year > dataYear) dataYear = year;

      const originName = item.coo_name ?? iso3o;
      const destName = item.coa_name ?? iso3a;
      const id = `unhcr-ref-${iso3o}-${iso3a}-${year}`;

      flows.push({
        id,
        flowType: "refugee",
        corridorName: `${originName} → ${destName}`,
        originName,
        originIso3: iso3o,
        originLat: originCentroid[0],
        originLon: originCentroid[1],
        destinationName: destName,
        destinationIso3: iso3a,
        destLat: destCentroid[0],
        destLon: destCentroid[1],
        value: total,
        valueFormatted: formatValue(total),
        unit: "individuals",
        cause: "conflict",
        confidence: "measured",
        timeRangeFrom: `${year}-01-01`,
        timeRangeTo: `${year}-12-31`,
        sourceName: "UNHCR",
        sourceUrl: UNHCR_SOURCE_URL,
        lastUpdated: now,
        ts: now,
      });
    }

    flows.sort((a, b) => b.value - a.value);
    _cache = { flows, dataYear, savedAt: now };
    return { flows, status: "live", dataYear };
  } catch {
    if (_cache) {
      return { flows: _cache.flows, status: "degraded", dataYear: _cache.dataYear };
    }
    return { flows: [], status: "unavailable", dataYear: 2023 };
  }
}
