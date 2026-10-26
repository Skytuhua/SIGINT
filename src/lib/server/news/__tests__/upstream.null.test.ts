import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UpstreamPolicy } from "../upstream";

vi.mock("undici", () => ({ Agent: class {}, setGlobalDispatcher: vi.fn() }));
const policy: UpstreamPolicy = {
  key: "null-test", ttlMs: 10, staleTtlMs: 100, timeoutMs: 100,
  maxRetries: 0, backoffBaseMs: 0, circuitFailureThreshold: 1, circuitOpenMs: 100,
};
beforeEach(() => { vi.resetModules(); vi.spyOn(Date, "now").mockReturnValue(1000); });
afterEach(() => vi.restoreAllMocks());

describe("cached null lookups", () => {
  it("retains a successful negative lookup for its fresh TTL", async () => {
    const { cachedFetch } = await import("../upstream");
    let calls = 0;
    const load = () => cachedFetch({ cacheKey: "unknown", policy, request: async () => { calls++; return null; } });
    await load();
    expect(await load()).toMatchObject({ data: null, cacheHit: "fresh", degraded: false });
    expect(calls).toBe(1);
  });

  it("serves a stale null during revalidation and after a refresh failure", async () => {
    const { cachedFetch } = await import("../upstream");
    await cachedFetch({ cacheKey: "unknown", policy, request: async () => null });
    vi.mocked(Date.now).mockReturnValue(1011);
    expect(await cachedFetch({ cacheKey: "unknown", policy, backgroundRefresh: false, request: async () => "unexpected" }))
      .toMatchObject({ data: null, cacheHit: "stale" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await cachedFetch({ cacheKey: "unknown", policy, preferStale: false, request: async () => { throw new Error("unavailable"); } }))
      .toMatchObject({ data: null, cacheHit: "stale", degraded: true });
    expect(await cachedFetch({ cacheKey: "unknown", policy, request: async () => "unexpected" }))
      .toMatchObject({ data: null, cacheHit: "stale", error: "circuit-open" });
  });
});
