import { cachedFetch, fetchJsonOrThrow, type CachedFetchResult, type UpstreamPolicy } from "../upstream";

interface IntelHotspotsFeatureCollection {
  type: "FeatureCollection";
  features: Array<Record<string, unknown>>;
}

function isIntelHotspotsFeatureCollection(value: unknown): value is IntelHotspotsFeatureCollection {
  if (!value || typeof value !== "object") return false;
  const anyValue = value as { type?: unknown; features?: unknown };
  return anyValue.type === "FeatureCollection" && Array.isArray(anyValue.features);
}

const INTEL_HOTSPOTS_POLICY: UpstreamPolicy = {
  key: "intel-hotspots",
  ttlMs: 120_000,
  staleTtlMs: 10 * 60_000,
  timeoutMs: 12_000,
  maxRetries: 2,
  backoffBaseMs: 450,
  circuitFailureThreshold: 3,
  circuitOpenMs: 2 * 60_000,
  rateLimit: { capacity: 6, refillPerSec: 4, minIntervalMs: 200 },
};

const EMPTY_FC: IntelHotspotsFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

function getUpstreamUrl(): string | null {
  const raw = process.env.INTEL_HOTSPOTS_URL ?? "";
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed;
}

export async function getIntelHotspots(): Promise<CachedFetchResult<IntelHotspotsFeatureCollection>> {
  const upstreamUrl = getUpstreamUrl();
  if (!upstreamUrl) {
    return {
      data: EMPTY_FC,
      degraded: false,
      latencyMs: 0,
      cacheHit: "miss",
    };
  }

  const url = upstreamUrl;

  return cachedFetch({
    cacheKey: url,
    policy: INTEL_HOTSPOTS_POLICY,
    fallbackValue: EMPTY_FC,
    request: async () => {
      const json = await fetchJsonOrThrow<Record<string, unknown>>(
        url,
        { headers: { "User-Agent": "SIGINT/0.1 (intel-hotspots)" } },
        INTEL_HOTSPOTS_POLICY.timeoutMs
      );

      if (isIntelHotspotsFeatureCollection(json)) {
        return json;
      }

      const rows = Array.isArray(json) ? (json as Record<string, unknown>[]) : [];
      if (!rows.length) return EMPTY_FC;

      const features = rows
        .map((row, index) => {
          const lat = Number((row as { lat?: unknown; latitude?: unknown }).lat ?? (row as { latitude?: unknown }).latitude);
          const lon = Number((row as { lon?: unknown; longitude?: unknown }).lon ?? (row as { longitude?: unknown }).longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
          const id =
            String(
              (row as { id?: unknown }).id ??
                (row as { eventId?: unknown }).eventId ??
                (row as { uid?: unknown }).uid ??
                `intel-${index}`
            ).trim() || `intel-${index}`;
          const name =
            String(
              (row as { name?: unknown }).name ??
                (row as { title?: unknown }).title ??
                (row as { label?: unknown }).label ??
                "Intel Hotspot"
            ) || "Intel Hotspot";
          const countRaw =
            (row as { count?: unknown }).count ??
            (row as { intensity?: unknown }).intensity ??
            (row as { value?: unknown }).value ??
            (row as { fatalities?: unknown }).fatalities;
          const countNum = Number(countRaw);
          const count = Number.isFinite(countNum) ? countNum : 1;
          const tsRaw =
            (row as { ts?: unknown }).ts ??
            (row as { time?: unknown }).time ??
            (row as { timestamp?: unknown }).timestamp ??
            (row as { eventDate?: unknown }).eventDate;
          const tsParsed =
            typeof tsRaw === "number"
              ? tsRaw
              : typeof tsRaw === "string"
              ? Number.isFinite(Number(tsRaw))
                ? Number(tsRaw)
                : Date.parse(tsRaw)
              : NaN;
          const ts = Number.isFinite(tsParsed) ? tsParsed : Date.now();

          return {
            type: "Feature",
            id,
            geometry: {
              type: "Point",
              coordinates: [lon, lat],
            },
            properties: {
              ...(row as Record<string, unknown>),
              name,
              count,
              ts,
            },
          } as Record<string, unknown>;
        })
        .filter((f): f is Record<string, unknown> => Boolean(f));

      if (!features.length) return EMPTY_FC;

      return {
        type: "FeatureCollection",
        features,
      };
    },
  });
}

