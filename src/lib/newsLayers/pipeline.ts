import { readPersistentFeedCache, writePersistentFeedCache } from "../runtime/persistentFeedCache";
import { capAndAggregateFeatures } from "./normalize";
import { selectAdapter } from "./adapters";
import type { LayerFeatureCollection, LayerHealthState, LayerRegistryEntry } from "./types";

function nowHealth(
  status: LayerHealthState["status"],
  prev: LayerHealthState,
  error?: unknown,
  nextRetryAt: number | null = null,
  consecutiveFailures = 0
): LayerHealthState {
  return {
    status,
    lastSuccessAt: status === "live" ? Date.now() : prev.lastSuccessAt,
    lastError: error ? String(error) : null,
    nextRetryAt,
    consecutiveFailures,
  };
}

export async function loadLayerFromCache(layer: LayerRegistryEntry): Promise<LayerFeatureCollection | null> {
  const cached = await readPersistentFeedCache<LayerFeatureCollection>(layer.dataSource.cacheKey);
  if (!cached.entry?.payload) return null;
  return cached.entry.payload;
}

export async function runLayerPipeline(
  layer: LayerRegistryEntry,
  signal: AbortSignal,
  previous: LayerHealthState
): Promise<{ data: LayerFeatureCollection | null; health: LayerHealthState; cacheHit: boolean }> {
  const cacheKey = layer.dataSource.cacheKey;
  const cached = await readPersistentFeedCache<LayerFeatureCollection>(cacheKey);
  const warm = cached.entry?.payload ?? null;
  const now = Date.now();

  const adapter = selectAdapter(layer);
  try {
    const raw = await adapter.fetch({ layer, signal });
    const normalized = adapter.normalize(raw, { layer, signal });
    const capped = capAndAggregateFeatures(normalized, layer.performance.maxFeatures);

    await writePersistentFeedCache({
      cacheKey,
      savedAt: now,
      expiresAt: now + layer.dataSource.cacheTtlMs,
      staleUntil: now + layer.dataSource.staleTtlMs,
      payload: capped,
      itemCount: capped.features.length,
    });

    const hasFeatures = capped.features.length > 0;
    return {
      data: capped,
      cacheHit: false,
      health: nowHealth(
        hasFeatures ? "live" : "degraded",
        previous,
        hasFeatures ? null : "No features returned",
        null,
        0
      ),
    };
  } catch (error) {
    const isFresh = Boolean(cached.entry && cached.entry.expiresAt > now);
    const isStaleUsable = Boolean(cached.entry && cached.entry.staleUntil > now);
    if (warm && (isFresh || isStaleUsable)) {
      return {
        data: capAndAggregateFeatures(warm, layer.performance.maxFeatures),
        cacheHit: true,
        health: nowHealth(
          isFresh ? "cached" : "degraded",
          previous,
          isFresh ? null : error,
          null,
          isFresh ? previous.consecutiveFailures : previous.consecutiveFailures + 1
        ),
      };
    }

    return {
      data: null,
      cacheHit: false,
      health: nowHealth(
        "unavailable",
        previous,
        error,
        Date.now() + Math.max(5_000, layer.dataSource.refreshMs),
        previous.consecutiveFailures + 1
      ),
    };
  }
}
