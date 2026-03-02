import { fetchJsonWithPolicy } from "../runtime/fetchJson";
import { normalizeLayerFeatureCollection } from "./normalize";
import type { LayerFeatureCollection, LayerRegistryEntry } from "./types";

export interface LayerAdapterContext {
  layer: LayerRegistryEntry;
  signal: AbortSignal;
}

export interface LayerAdapter {
  fetch: (ctx: LayerAdapterContext) => Promise<unknown>;
  normalize: (raw: unknown, ctx: LayerAdapterContext) => LayerFeatureCollection;
}

function normalizeWithLayer(raw: unknown, ctx: LayerAdapterContext): LayerFeatureCollection {
  return normalizeLayerFeatureCollection(raw, ctx.layer.id);
}

export const routeAdapter: LayerAdapter = {
  async fetch({ layer, signal }) {
    return fetchJsonWithPolicy(layer.dataSource.routePath ?? "", {
      key: layer.dataSource.cacheKey,
      signal,
      timeoutMs: layer.dataSource.timeoutMs ?? 20_000,
      retries: layer.dataSource.maxRetries ?? 2,
      negativeTtlMs: 1_000,
    });
  },
  normalize: normalizeWithLayer,
};

export const snapshotAdapter: LayerAdapter = {
  async fetch({ layer, signal }) {
    return fetchJsonWithPolicy(layer.dataSource.snapshotPath ?? "", {
      key: layer.dataSource.cacheKey,
      signal,
      timeoutMs: layer.dataSource.timeoutMs ?? 15_000,
      retries: layer.dataSource.maxRetries ?? 1,
      negativeTtlMs: 5_000,
    });
  },
  normalize: normalizeWithLayer,
};

export const wmtsRasterAdapter: LayerAdapter = {
  async fetch() {
    return { type: "FeatureCollection", features: [] };
  },
  normalize: normalizeWithLayer,
};

export const derivedAdapter: LayerAdapter = {
  async fetch({ layer, signal }) {
    return fetchJsonWithPolicy(layer.dataSource.routePath ?? "", {
      key: layer.dataSource.cacheKey,
      signal,
      timeoutMs: layer.dataSource.timeoutMs ?? 20_000,
      retries: layer.dataSource.maxRetries ?? 1,
      negativeTtlMs: 1_500,
    });
  },
  normalize: normalizeWithLayer,
};

export function selectAdapter(layer: LayerRegistryEntry): LayerAdapter {
  if (layer.dataSource.adapter === "snapshot") return snapshotAdapter;
  if (layer.dataSource.adapter === "wmtsRaster") return wmtsRasterAdapter;
  if (layer.dataSource.adapter === "derived") return derivedAdapter;
  return routeAdapter;
}
