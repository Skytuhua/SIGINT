import { cachedFetch, fetchJsonOrThrow, type CachedFetchResult, type UpstreamPolicy } from "../upstream";
import type { OverpassResponse, PoiCount, EconomicCenterSourceStatus } from "./types";

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

const OVERPASS_POLICY: UpstreamPolicy = {
  key: "econ-centers-overpass",
  ttlMs: 4 * 60 * 60_000,
  staleTtlMs: 40 * 60 * 60_000,
  timeoutMs: 55_000,
  maxRetries: 1,
  backoffBaseMs: 3_000,
  circuitFailureThreshold: 2,
  circuitOpenMs: 10 * 60_000,
  rateLimit: { capacity: 1, refillPerSec: 0.1, minIntervalMs: 10_000 },
};

// Single global query for all relevant POI types
// timeout:55 tells the Overpass server to abort and return partial results rather than error
const OVERPASS_QUERY = `[out:json][timeout:55];
(
  node["amenity"="bank"]["name"~".",i];
  node["office"="financial"]["name"~".",i];
  node["landuse"="industrial"]["name"~".",i];
  node["harbour"="yes"];
  node["port"="yes"];
  node["aeroway"="aerodrome"]["iata"~"."];
);
out center 5000;`;

type PoiType = "bank" | "financial" | "port" | "airport" | "industrial";

interface PoiPoint {
  lat: number;
  lon: number;
  type: PoiType;
}

function classifyElement(el: {
  tags?: Record<string, string>;
}): PoiType | null {
  const tags = el.tags ?? {};
  if (tags["aeroway"] === "aerodrome" && tags["iata"]) return "airport";
  if (tags["harbour"] === "yes" || tags["port"] === "yes") return "port";
  if (tags["amenity"] === "bank") return "bank";
  if (tags["office"] === "financial") return "financial";
  if (tags["landuse"] === "industrial") return "industrial";
  return null;
}

/** Haversine distance in km between two lat/lon points */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchGlobalPois(): Promise<PoiPoint[]> {
  const body = new URLSearchParams({ data: OVERPASS_QUERY });
  const resp = await fetchJsonOrThrow<OverpassResponse>(
    OVERPASS_ENDPOINT,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    },
    OVERPASS_POLICY.timeoutMs,
  );

  const points: PoiPoint[] = [];
  for (const el of resp.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat === undefined || lon === undefined) continue;
    const type = classifyElement(el);
    if (!type) continue;
    points.push({ lat, lon, type });
  }
  return points;
}

export interface PoiDensityResult {
  densities: Map<string, PoiCount>;
  sourceStatus: EconomicCenterSourceStatus;
}

export async function fetchPoiDensities(
  hubs: Array<{ id: string; lat: number; lon: number }>,
): Promise<PoiDensityResult> {
  const res = await cachedFetch<PoiPoint[]>({
    cacheKey: "econ-centers-overpass-global-v1",
    policy: OVERPASS_POLICY,
    fallbackValue: [],
    request: fetchGlobalPois,
  });

  const pois = res.data;
  const densities = new Map<string, PoiCount>();
  const RADIUS_KM = 50;

  for (const hub of hubs) {
    const counts: PoiCount = { banks: 0, financial: 0, ports: 0, airports: 0, industrial: 0 };
    for (const poi of pois) {
      if (haversineKm(hub.lat, hub.lon, poi.lat, poi.lon) > RADIUS_KM) continue;
      if (poi.type === "bank") counts.banks++;
      else if (poi.type === "financial") counts.financial++;
      else if (poi.type === "port") counts.ports++;
      else if (poi.type === "airport") counts.airports++;
      else if (poi.type === "industrial") counts.industrial++;
    }
    densities.set(hub.id, counts);
  }

  return { densities, sourceStatus: statusFromResult(res) };
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
