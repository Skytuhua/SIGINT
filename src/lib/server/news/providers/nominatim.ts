import { cachedFetch, fetchJsonOrThrow, type CachedFetchResult, type UpstreamPolicy } from "../upstream";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";

const POLICY: UpstreamPolicy = {
  key: "nominatim",
  ttlMs: 7 * 24 * 60 * 60_000,
  staleTtlMs: 30 * 24 * 60 * 60_000,
  timeoutMs: 8_000,
  maxRetries: 1,
  backoffBaseMs: 700,
  circuitFailureThreshold: 3,
  circuitOpenMs: 5 * 60_000,
  rateLimit: { capacity: 1, refillPerSec: 1, minIntervalMs: 1100 },
};

export interface NominatimResult {
  lat: number;
  lon: number;
  displayName: string;
  type: string;
  importance: number;
}

export async function geocodeNominatim(place: string): Promise<CachedFetchResult<NominatimResult | null>> {
  const q = place.trim();
  if (!q) {
    return {
      data: null,
      degraded: false,
      latencyMs: 0,
      cacheHit: "miss",
    };
  }
  const url = new URL(NOMINATIM_BASE);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  return cachedFetch({
    cacheKey: url.toString(),
    policy: POLICY,
    fallbackValue: null,
    request: async () => {
      const list = await fetchJsonOrThrow<
        Array<{
          lat: string;
          lon: string;
          display_name: string;
          type: string;
          importance: number;
        }>
      >(
        url.toString(),
        {
          headers: {
            "User-Agent": "WorldView/0.1 (research; geocoding for news geo-tagging)",
            "Accept-Language": "en",
          },
        },
        POLICY.timeoutMs
      );
      if (!list.length) return null;
      const row = list[0];
      const lat = Number(row.lat);
      const lon = Number(row.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return {
        lat,
        lon,
        displayName: row.display_name,
        type: row.type,
        importance: Number(row.importance) || 0,
      };
    },
  });
}

