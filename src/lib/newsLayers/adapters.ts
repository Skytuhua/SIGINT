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

function resolveRoutePath(layer: LayerRegistryEntry): string {
  const base = layer.dataSource.routePath ?? "";
  if (!base) return "";
  if (typeof window === "undefined") return base;

  if (layer.id === "intel-hotspots") {
    let selected: string | null = null;
    try {
      selected = window.localStorage.getItem("wv:intel-hotspots:timeWindow");
    } catch {
      selected = null;
    }
    const timeWindow = selected === "6h" || selected === "24h" || selected === "7d" ? selected : "24h";
    const delimiter = base.includes("?") ? "&" : "?";
    return `${base}${delimiter}timeWindow=${timeWindow}`;
  }

  if (layer.id === "conflict-zones") {
    let timeWindow: "6h" | "24h" | "7d" | "30d" | "90d" = "7d";
    let mode = "strict";
    let verifiedOverlay = "0";
    try {
      const storedTw = window.localStorage.getItem("wv:conflict-zones:timeWindow");
      if (storedTw === "6h" || storedTw === "24h" || storedTw === "7d" || storedTw === "30d" || storedTw === "90d") {
        timeWindow = storedTw;
      }
      const storedMode = window.localStorage.getItem("wv:conflict-zones:mode");
      if (storedMode === "broad") mode = "broad";
      const storedVerified = window.localStorage.getItem("wv:conflict-zones:verifiedOverlay");
      if (storedVerified === "1" || storedVerified === "true") verifiedOverlay = "1";
    } catch {
      // ignore
    }
    const delimiter = base.includes("?") ? "&" : "?";
    return `${base}${delimiter}timeWindow=${timeWindow}&mode=${mode}&verifiedOverlay=${verifiedOverlay}`;
  }

  if (layer.id === "armed-conflict") {
    let timeWindow: "6h" | "24h" | "7d" = "24h";
    let broader = "0";
    try {
      const storedTw = window.localStorage.getItem("wv:armed-conflict:timeWindow");
      if (storedTw === "6h" || storedTw === "24h" || storedTw === "7d") {
        timeWindow = storedTw;
      }
      const storedBroad = window.localStorage.getItem("wv:armed-conflict:broader");
      if (storedBroad === "1" || storedBroad === "true") {
        broader = "1";
      }
    } catch {
      // ignore and use defaults
    }
    const delimiter = base.includes("?") ? "&" : "?";
    return `${base}${delimiter}timeWindow=${timeWindow}&broad=${broader}`;
  }

  return base;
}

export const routeAdapter: LayerAdapter = {
  async fetch({ layer, signal }) {
    return fetchJsonWithPolicy(resolveRoutePath(layer), {
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
