import { afterEach, expect, it, vi } from "vitest";
vi.mock("undici", () => ({ Agent: class {}, setGlobalDispatcher: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("aborts a cached provider request when its deadline expires", async () => {
  const { cachedFetch } = await import("../upstream");
  vi.spyOn(console, "error").mockImplementation(() => {});
  let requestSignal: AbortSignal | undefined;
  await expect(cachedFetch({
    cacheKey: "abort-provider", policy: { key: "abort-provider", ttlMs: 100, timeoutMs: 15,
      maxRetries: 0, backoffBaseMs: 0, circuitFailureThreshold: 1, circuitOpenMs: 100 },
    request: (signal: AbortSignal) => new Promise((_resolve, reject) => {
      requestSignal = signal;
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
  })).rejects.toThrow();
  expect(requestSignal?.aborted).toBe(true);
});

it("keeps fetchJsonOrThrow cancellation active while reading JSON", async () => {
  const { fetchJsonOrThrow } = await import("../upstream");
  let signal: AbortSignal | undefined;
  vi.stubGlobal("fetch", async (_: string, init: RequestInit) => {
    signal = init.signal as AbortSignal | undefined;
    return { ok: true, json: () => new Promise((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(signal?.reason), { once: true });
    }) };
  });
  const pending = fetchJsonOrThrow("https://example.com/slow-body", {}, 15);
  const result = await Promise.race([pending.then(() => "resolved", () => "rejected"), new Promise(resolve => setTimeout(() => resolve("still-pending"), 40))]);
  expect(result).toBe("rejected");
  expect(signal?.aborted).toBe(true);
});
