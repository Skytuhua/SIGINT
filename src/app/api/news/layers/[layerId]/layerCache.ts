type GenericFeature = {
  type: "Feature";
  id?: string | number;
  geometry: {
    type: "Point" | "LineString" | "Polygon";
    coordinates: unknown;
  };
  properties?: Record<string, unknown>;
};

type GenericFeatureCollection = {
  type: "FeatureCollection";
  features: GenericFeature[];
};

// ── Server-side TTL cache ────────────────────────────────────────────────────

interface CacheEntry {
  data: GenericFeatureCollection;
  expiresAt: number;
  staleUntil: number;
}

export type CacheEntryData = GenericFeatureCollection;

const LAYER_TTL: Record<string, number> = {
  "intel-hotspots":     90_000,
  "conflict-zones":     120_000,
  "armed-conflict":     120_000,
  "military-activity":  20_000,
  "cyber-incidents":    120_000,
  "disease-outbreaks":  600_000,
  "arms-embargo-zones":  6 * 3600_000,
  "sanctions-entities":  24 * 3600_000,
  "ucdp-events":         6 * 3600_000,
  "economic-centers":    4 * 3600_000,
  "ai-data-centers":     4 * 3600_000,
  "earthquakes":         60_000,
  "disaster-alerts":     6 * 60_000,
};

const STALE_MULTIPLIER = 10;

// Query parameters each layer's payload actually depends on. Only listed
// parameters become part of the cache key; every other layer is keyed by id
// alone. Keep this aligned with getLayerPayload and its downstream adapters.
const LAYER_QUERY_PARAMS: Record<string, readonly string[]> = {
  "intel-hotspots": ["timeWindow"],
  "conflict-zones": ["timeWindow", "mode", "verifiedOverlay", "west", "south", "east", "north"],
  "armed-conflict": ["timeWindow", "broad"],
  "ucdp-events": ["fromYear", "toYear", "countries", "violenceTypes", "minFatalities"],
};
// Bounded key space: at most a handful of variants per param-keyed layer.
export const MAX_LAYER_CACHE_ENTRIES = 128;

const layerCache = new Map<string, CacheEntry>();

/**
 * Build a cache key for a layer request. Param-keyed layers include their
 * relevant query parameters (sorted for order-invariance); other layers key on
 * the id alone so stray query noise cannot create unbounded variants.
 */
export function buildLayerCacheKey(layerId: string, searchParams: URLSearchParams): string {
  const relevant = LAYER_QUERY_PARAMS[layerId];
  if (!relevant) return layerId;
  const parts: string[] = [];
  for (const name of relevant) {
    const value = searchParams.get(name); // FIRST value, matching route reads
    if (value === null) continue;
    // Encode so values containing ?/&/= cannot collide across parameters.
    parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`);
  }
  return parts.length > 0 ? `${layerId}?${parts.join("&")}` : layerId;
}

/** Test/runtime helper to reset the cache (e.g. between test cases). */
export function clearLayerCache(): void {
  layerCache.clear();
}

export function getCached(cacheKey: string): CacheEntryData | null {
  const entry = layerCache.get(cacheKey);
  if (!entry) return null;
  const now = Date.now();
  if (now < entry.staleUntil) {
    // Re-insert to refresh LRU recency (Map iterates in insertion order); this
    // also orders same-millisecond accesses that timestamp comparison cannot.
    layerCache.delete(cacheKey);
    layerCache.set(cacheKey, entry);
    return entry.data;
  }
  layerCache.delete(cacheKey);
  return null;
}

export function isFresh(cacheKey: string): boolean {
  const entry = layerCache.get(cacheKey);
  return Boolean(entry && Date.now() < entry.expiresAt);
}

export function setCache(cacheKey: string, data: CacheEntryData): void {
  const layerId = cacheKey.split("?")[0] ?? cacheKey;
  const ttl = LAYER_TTL[layerId] ?? 120_000;
  const now = Date.now();

  if (layerCache.size >= MAX_LAYER_CACHE_ENTRIES && !layerCache.has(cacheKey)) {
    // Map insertion order: front = least recently used (getCached re-inserts).
    const oldestKey = layerCache.keys().next().value;
    if (oldestKey !== undefined) layerCache.delete(oldestKey);
  }

  layerCache.set(cacheKey, {
    data,
    expiresAt: now + ttl,
    staleUntil: now + ttl * STALE_MULTIPLIER,
  });
}
