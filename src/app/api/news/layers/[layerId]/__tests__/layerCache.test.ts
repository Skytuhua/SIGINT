import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_LAYER_CACHE_ENTRIES,
  buildLayerCacheKey,
  clearLayerCache,
  getCached,
  isFresh,
  setCache,
  type CacheEntryData,
} from "../layerCache";

function fc(n: number): CacheEntryData {
  return {
    type: "FeatureCollection",
    features: Array.from({ length: n }, (_, i) => ({
      type: "Feature" as const,
      id: i,
      geometry: { type: "Point" as const, coordinates: [0, 0] },
    })),
  };
}

describe("layer cache keys", () => {
  it("keys param-free layers by layer id alone", () => {
    expect(buildLayerCacheKey("earthquakes", new URLSearchParams())).toBe("earthquakes");
    expect(buildLayerCacheKey("earthquakes", new URLSearchParams("junk=1"))).toBe("earthquakes");
  });

  it("separates cache entries per distinct relevant query", () => {
    expect(buildLayerCacheKey("armed-conflict", new URLSearchParams("timeWindow=6h"))).not.toBe(
      buildLayerCacheKey("armed-conflict", new URLSearchParams("timeWindow=24h"))
    );
    expect(
      buildLayerCacheKey("ucdp-events", new URLSearchParams("fromYear=1989&toYear=2024"))
    ).not.toBe(buildLayerCacheKey("ucdp-events", new URLSearchParams("fromYear=2020&toYear=2020")));
  });

  it("is invariant to parameter order", () => {
    expect(
      buildLayerCacheKey("ucdp-events", new URLSearchParams("violenceTypes=state-based&countries=SY,YE"))
    ).toBe(
      buildLayerCacheKey("ucdp-events", new URLSearchParams("countries=SY,YE&violenceTypes=state-based"))
    );
  });

  it("distinguishes empty values from absent values", () => {
    expect(buildLayerCacheKey("intel-hotspots", new URLSearchParams("timeWindow="))).not.toBe(
      buildLayerCacheKey("intel-hotspots", new URLSearchParams())
    );
  });

  it("uses the first duplicate value, matching URLSearchParams.get", () => {
    const key = (q: string) => buildLayerCacheKey("armed-conflict", new URLSearchParams(q));
    expect(key("timeWindow=6h&timeWindow=24h")).toBe(key("timeWindow=6h"));
    expect(key("timeWindow=6h&timeWindow=24h")).not.toBe(key("timeWindow=24h&timeWindow=6h"));
  });

  it("encodes delimiters inside values without collisions", () => {
    const key = (q: string) => buildLayerCacheKey("ucdp-events", new URLSearchParams(q));
    expect(key("countries=SY%26minFatalities%3D9")).not.toBe(key("countries=SY&minFatalities=9"));
  });

  it("ignores parameters not used by the requested layer", () => {
    expect(buildLayerCacheKey("armed-conflict", new URLSearchParams("countries=SY"))).toBe("armed-conflict");
    expect(
      buildLayerCacheKey("armed-conflict", new URLSearchParams("broad=1&utm_source=test"))
    ).toBe(buildLayerCacheKey("armed-conflict", new URLSearchParams("broad=1")));
  });
});

describe("layer cache entries", () => {
  beforeEach(() => {
    clearLayerCache();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-17T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("serves distinct payloads per key and refreshes recency on hit", () => {
    const old = fc(1);
    const recent = fc(2);
    setCache("ucdp-events?fromYear=1989", old);
    vi.advanceTimersByTime(1);
    setCache("ucdp-events?fromYear=2020", recent);

    expect(getCached("ucdp-events?fromYear=1989")).toBe(old);
    expect(getCached("ucdp-events?fromYear=2020")).toBe(recent);
    expect(isFresh("ucdp-events?fromYear=1989")).toBe(true);
  });

  it("serves stale entries past ttl and drops them past staleUntil", () => {
    const data = fc(3);
    setCache("conflict-zones", data);
    vi.advanceTimersByTime(121_000); // past 120s ttl
    expect(isFresh("conflict-zones")).toBe(false);
    expect(getCached("conflict-zones")).toBe(data); // stale-while-revalidate window
    vi.advanceTimersByTime(120_000 * 10);
    expect(getCached("conflict-zones")).toBeNull();
  });

  it("evicts the least recently used entry at the size cap", () => {
    for (let i = 0; i < MAX_LAYER_CACHE_ENTRIES; i++) {
      setCache(`earthquakes#${i}`, fc(0));
    }
    // Touch the first entry so it becomes most recently used.
    getCached("earthquakes#0");
    setCache("earthquakes#overflow", fc(0));

    expect(getCached("earthquakes#1")).toBeNull(); // evicted (LRU victim)
    expect(getCached("earthquakes#0")).not.toBeNull(); // survived via recency
    expect(getCached("earthquakes#overflow")).not.toBeNull();
  });
});
