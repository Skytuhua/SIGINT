import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UpstreamPolicy } from "../upstream";

const policy: UpstreamPolicy = {
  key: "eviction-test",
  ttlMs: 60_000,
  staleTtlMs: 120_000,
  timeoutMs: 1_000,
  maxRetries: 0,
  backoffBaseMs: 0,
  circuitFailureThreshold: 1_000,
  circuitOpenMs: 1_000,
};

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(Date, "now").mockReturnValue(1_000_000);
});
afterEach(() => vi.restoreAllMocks());

async function setup() {
  const { cachedFetch } = await import("../upstream");
  const request = vi.fn(async () => ({ ok: true }));
  const load = (cacheKey: string, overrides: Partial<UpstreamPolicy> = {}) =>
    cachedFetch({ policy: { ...policy, ...overrides }, cacheKey, request, backgroundRefresh: false });
  return { load, request };
}

describe("cachedFetch cache bounding", () => {
  it("retains all 512 entries at capacity", async () => {
    const { load, request } = await setup();
    for (let i = 0; i < 512; i++) await load(`item-${i}`);
    expect((await load("item-0")).cacheHit).toBe("fresh");
    expect(request).toHaveBeenCalledTimes(512);
  });

  it("evicts the oldest written entry on overflow", async () => {
    const { load, request } = await setup();
    for (let i = 0; i < 513; i++) await load(`item-${i}`);
    expect((await load("item-512")).cacheHit).toBe("fresh");
    expect((await load("item-0")).cacheHit).toBe("miss");
    expect(request).toHaveBeenCalledTimes(514);
  });

  it("evicts fully expired entries before older live entries", async () => {
    const { load, request } = await setup();
    await load("old-live");
    await load("short-lived", { ttlMs: 10, staleTtlMs: 20 });
    for (let i = 0; i < 510; i++) await load(`item-${i}`);
    vi.mocked(Date.now).mockReturnValue(1_000_021);
    await load("overflow");
    expect((await load("old-live")).cacheHit).toBe("fresh");
    expect((await load("short-lived")).cacheHit).toBe("miss");
    expect(request).toHaveBeenCalledTimes(514);
  });

  it("preserves stale fallback entries until their stale deadline", async () => {
    const { load, request } = await setup();
    await load("stale", { ttlMs: 10, staleTtlMs: 120_000 });
    vi.mocked(Date.now).mockReturnValue(1_000_011);
    for (let i = 0; i < 511; i++) await load(`item-${i}`);
    expect((await load("stale")).cacheHit).toBe("stale");
    expect(request).toHaveBeenCalledTimes(512);
  });
});
