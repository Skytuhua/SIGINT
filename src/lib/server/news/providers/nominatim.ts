import { cachedFetch, fetchJsonOrThrow, type CachedFetchResult, type UpstreamPolicy } from "../upstream";
import { normalizeCountryCode } from "../../../news/countryCode";

const NOMINATIM_SEARCH_BASE = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_REVERSE_BASE = "https://nominatim.openstreetmap.org/reverse";

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

export interface NominatimReverseResult {
  lat: number;
  lon: number;
  displayName: string;
  country: string | null;
  countryCode: string | null;
  bbox: [number, number, number, number] | null;
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
  const url = new URL(NOMINATIM_SEARCH_BASE);
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

export async function reverseGeocodeNominatim(
  lat: number,
  lon: number
): Promise<CachedFetchResult<NominatimReverseResult | null>> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return {
      data: null,
      degraded: false,
      latencyMs: 0,
      cacheHit: "miss",
    };
  }

  const url = new URL(NOMINATIM_REVERSE_BASE);
  url.searchParams.set("lat", lat.toFixed(6));
  url.searchParams.set("lon", lon.toFixed(6));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("zoom", "3");
  url.searchParams.set("addressdetails", "1");

  return cachedFetch({
    cacheKey: url.toString(),
    policy: POLICY,
    fallbackValue: null,
    request: async () => {
      const payload = await fetchJsonOrThrow<{
        lat?: string;
        lon?: string;
        display_name?: string;
        boundingbox?: [string, string, string, string] | string[];
        address?: {
          country?: string;
          country_code?: string;
        };
      }>(
        url.toString(),
        {
          headers: {
            "User-Agent": "WorldView/0.1 (research; reverse geocoding for news map)",
            "Accept-Language": "en",
          },
        },
        POLICY.timeoutMs
      );

      const parsedLat = Number(payload.lat ?? lat);
      const parsedLon = Number(payload.lon ?? lon);
      if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLon)) return null;

      const normalizedCode = normalizeCountryCode(payload.address?.country_code ?? null);
      const rawBbox = payload.boundingbox;
      let bbox: [number, number, number, number] | null = null;
      if (Array.isArray(rawBbox) && rawBbox.length === 4) {
        const south = Number(rawBbox[0]);
        const north = Number(rawBbox[1]);
        const west = Number(rawBbox[2]);
        const east = Number(rawBbox[3]);
        if (
          [south, north, west, east].every((value) => Number.isFinite(value)) &&
          north > south &&
          east > west
        ) {
          bbox = [west, south, east, north];
        }
      }

      return {
        lat: parsedLat,
        lon: parsedLon,
        displayName: payload.display_name ?? "",
        country: payload.address?.country ?? null,
        countryCode: normalizedCode,
        bbox,
      };
    },
  });
}
