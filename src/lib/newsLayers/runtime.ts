import { isAbortError } from "../runtime/fetchJson";
import { globalRefreshRuntime } from "../runtime/globalRefreshRuntime";
import { loadLayerFromCache, runLayerPipeline } from "./pipeline";
import type {
  LayerFeatureCollection,
  LayerHealthState,
  LayerRegistryEntry,
} from "./types";

interface RuntimeCallbacks {
  onData: (layerId: string, data: LayerFeatureCollection, health: LayerHealthState) => void;
  onHealth: (layerId: string, health: LayerHealthState) => void;
}

interface LayerRunState {
  unregister: (() => void) | null;
  health: LayerHealthState;
  circuitOpenUntil: number;
  /** Quick fingerprint of the last emitted data to skip redundant onData calls. */
  lastDataFingerprint: string;
}

const CIRCUIT_FAILURES = 3;
const CIRCUIT_OPEN_MS = 5 * 60_000;

/** Cheap fingerprint: feature count + first/last feature id + first feature ts. */
function dataFingerprint(data: LayerFeatureCollection): string {
  const n = data.features.length;
  if (n === 0) return "0";
  const first = data.features[0];
  const last = data.features[n - 1];
  return `${n}:${first.id ?? ""}:${first.ts ?? 0}:${last.id ?? ""}:${last.ts ?? 0}`;
}

function initialHealth(): LayerHealthState {
  return {
    status: "unavailable",
    lastSuccessAt: null,
    lastError: null,
    nextRetryAt: null,
    consecutiveFailures: 0,
  };
}

export class NewsLayerRuntime {
  private readonly registry = new Map<string, LayerRegistryEntry>();

  private readonly states = new Map<string, LayerRunState>();

  private readonly callbacks: RuntimeCallbacks;

  constructor(layers: LayerRegistryEntry[], callbacks: RuntimeCallbacks) {
    for (const layer of layers) {
      this.registry.set(layer.id, layer);
      this.states.set(layer.id, {
        unregister: null,
        health: initialHealth(),
        circuitOpenUntil: 0,
        lastDataFingerprint: "",
      });
    }
    this.callbacks = callbacks;
  }

  getHealth(layerId: string): LayerHealthState {
    return this.states.get(layerId)?.health ?? initialHealth();
  }

  async primeFromCache(layerId: string): Promise<void> {
    const layer = this.registry.get(layerId);
    const state = this.states.get(layerId);
    if (!layer || !state) return;

    const payload = await loadLayerFromCache(layer);
    if (!payload) return;

    const fp = dataFingerprint(payload);
    const nextHealth: LayerHealthState = {
      ...state.health,
      status: "cached",
      lastError: null,
      nextRetryAt: null,
    };
    state.health = nextHealth;
    if (fp !== state.lastDataFingerprint) {
      state.lastDataFingerprint = fp;
      this.callbacks.onData(layerId, payload, nextHealth);
    }
  }

  enable(layerId: string): void {
    const layer = this.registry.get(layerId);
    const state = this.states.get(layerId);
    if (!layer || !state || state.unregister) return;

    state.unregister = globalRefreshRuntime.register({
      pool: "news",
      task: {
        key: `news-layer:${layerId}`,
        intervalMs: layer.dataSource.refreshMs,
        jitterPct: layer.dataSource.jitterPct ?? 0.12,
        runOnStart: true,
        timeoutMs: layer.dataSource.timeoutMs ?? 20_000,
        run: async ({ signal }) => {
          await this.runLayer(layer, state, signal);
        },
      },
    });
  }

  disable(layerId: string): void {
    const state = this.states.get(layerId);
    if (!state) return;
    state.unregister?.();
    state.unregister = null;
  }

  refresh(layerId: string): void {
    globalRefreshRuntime.trigger(`news-layer:${layerId}`);
  }

  dispose(): void {
    this.states.forEach((state) => {
      state.unregister?.();
      state.unregister = null;
    });
  }

  private async runLayer(layer: LayerRegistryEntry, state: LayerRunState, signal: AbortSignal): Promise<void> {
    const now = Date.now();
    if (state.circuitOpenUntil > now) {
      const degraded: LayerHealthState = {
        ...state.health,
        status: "degraded",
        nextRetryAt: state.circuitOpenUntil,
      };
      state.health = degraded;
      this.callbacks.onHealth(layer.id, degraded);
      return;
    }

    try {
      const result = await runLayerPipeline(layer, signal, state.health);
      state.health = result.health;

      if (result.health.consecutiveFailures >= CIRCUIT_FAILURES) {
        state.circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS;
        state.health = {
          ...state.health,
          status: "degraded",
          nextRetryAt: state.circuitOpenUntil,
        };
      } else {
        state.circuitOpenUntil = 0;
      }

      if (result.data) {
        const fp = dataFingerprint(result.data);
        if (fp !== state.lastDataFingerprint) {
          state.lastDataFingerprint = fp;
          this.callbacks.onData(layer.id, result.data, state.health);
        } else {
          this.callbacks.onHealth(layer.id, state.health);
        }
      } else {
        this.callbacks.onHealth(layer.id, state.health);
      }
    } catch (error) {
      if (isAbortError(error)) return;
      const failureCount = state.health.consecutiveFailures + 1;
      const unavailable: LayerHealthState = {
        ...state.health,
        status: "unavailable",
        lastError: String(error),
        nextRetryAt: Date.now() + Math.max(5_000, layer.dataSource.refreshMs),
        consecutiveFailures: failureCount,
      };
      state.health = unavailable;
      if (failureCount >= CIRCUIT_FAILURES) {
        state.circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS;
        state.health = {
          ...state.health,
          status: "degraded",
          nextRetryAt: state.circuitOpenUntil,
        };
      }
      this.callbacks.onHealth(layer.id, state.health);
    }
  }
}
