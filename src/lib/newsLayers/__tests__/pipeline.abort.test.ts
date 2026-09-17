import { afterEach, describe, expect, it, vi } from "vitest";
import { runLayerPipeline } from "../pipeline";
import { RefreshScheduler } from "../../runtime/refreshScheduler";
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
  vi.useRealTimers();
});

describe("runLayerPipeline abort handling", () => {
  it.each(["deadline", "cancel"])("distinguishes scheduler %s through the real fetch adapter", async (mode) => {
    vi.useFakeTimers();
    const layer = makeLayer();
    layer.dataSource.cacheKey = `scheduler-${mode}`;
    layer.dataSource.timeoutMs = 5000;
    layer.dataSource.maxRetries = 0;
    const fetchMock = vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init!.signal!;
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);
    let result: Awaited<ReturnType<typeof runLayerPipeline>> | undefined;
    let failure: unknown;
    const scheduler = new RefreshScheduler();
    scheduler.registerTask({
      key: mode, intervalMs: 60000, timeoutMs: 500, runOnStart: true,
      run: async ({ signal }) => {
        try { result = await runLayerPipeline(layer, signal, initialHealth()); }
        catch (error) { failure = error; }
      },
    });
    try {
      scheduler.start();
      await vi.advanceTimersByTimeAsync(10);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      if (mode === "cancel") scheduler.stop();
      await vi.advanceTimersByTimeAsync(500);
      if (mode === "deadline") {
        expect(failure).toBeUndefined();
        expect(result?.health.consecutiveFailures).toBe(1);
        expect(result?.health.lastError).toContain("Timeout");
      } else {
        expect(result).toBeUndefined();
        expect(failure).toMatchObject({ name: "AbortError" });
      }
    } finally {
      scheduler.dispose();
      await vi.advanceTimersByTimeAsync(0);
    }
  });
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
