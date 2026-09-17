import { afterEach, describe, expect, it, vi } from "vitest";
import { runLayerPipeline } from "../pipeline";
import type { LayerRegistryEntry } from "../types";

function makeLayer(): LayerRegistryEntry {
  return {
    id: "test-layer",
    label: "Test",
    icon: "dot",
    category: "test",
    defaultEnabled: true,
    type: "geojsonPoints",
    stackOrder: 1,
    dataSource: {
      adapter: "route",
      routePath: "/api/test",
      refreshMs: 60_000,
      cacheKey: "test-layer",
      cacheTtlMs: 30_000,
      staleTtlMs: 60_000,
    },
    style: {},
    performance: { maxFeatures: 100 },
  };
}

function initialHealth() {
  return {
    status: "unavailable" as const,
    lastSuccessAt: null,
    lastError: null,
    nextRetryAt: null,
    consecutiveFailures: 0,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runLayerPipeline abort handling", () => {
  it("rethrows cancellation aborts instead of counting them as failures", async () => {
    const layer = makeLayer();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new DOMException("Aborted", "AbortError")))
    );

    await expect(runLayerPipeline(layer, new AbortController().signal, initialHealth())).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("still counts real failures as failures", async () => {
    const layer = makeLayer();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network down")))
    );

    const result = await runLayerPipeline(layer, new AbortController().signal, initialHealth());
    expect(result.data).toBeNull();
    expect(result.health.consecutiveFailures).toBe(1);
  });
});
