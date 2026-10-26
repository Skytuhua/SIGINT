import { afterEach, describe, expect, it, vi } from "vitest";
import { cachedFetch, fetchJsonOrThrow, UpstreamHttpError, type UpstreamPolicy } from "../upstream";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const policy: UpstreamPolicy = {
  key: "error-redaction-test",
  ttlMs: 1_000,
  timeoutMs: 1_000,
  maxRetries: 0,
  backoffBaseMs: 0,
  circuitFailureThreshold: 10,
  circuitOpenMs: 1_000,
};

describe("fetchJsonOrThrow HTTP error redaction", () => {
  it.each([
    ["https://www.googleapis.com/youtube/v3/search?key=test-only-secret&part=id", "https://www.googleapis.com/youtube/v3/search"],
    ["https://test-user:test-password@provider.example:8443/api?token=test-only-token#test-fragment", "https://provider.example:8443/api"],
    ["https://provider.example/api", "https://provider.example/api"],
  ])("reports only the status for %s", async (url) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("denied", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    const error = await fetchJsonOrThrow(url, {}, 1_000).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(UpstreamHttpError);
    expect(error).toMatchObject({ status: 403, message: "Upstream returned HTTP 403" });
    expect(String((error as Error).message)).not.toContain("provider.example");
    expect(String((error as Error).message)).not.toContain("/api");
    expect(fetchMock).toHaveBeenCalledWith(url, { cache: "no-store" });
  });

  it("keeps the cached fallback error and server log free of URL secrets", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("denied", { status: 403 })));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await cachedFetch({
      policy,
      cacheKey: "fallback",
      request: () => fetchJsonOrThrow("https://provider.example/api?key=test-only-secret#test-fragment", {}, 1_000),
      fallbackValue: { items: [] },
    });
    expect(result).toMatchObject({
      data: { items: [] },
      degraded: true,
      cacheHit: "miss",
      error: "Upstream returned HTTP 403",
    });
    expect(log).toHaveBeenCalledWith(
      "[upstream:error-redaction-test] attempt 1 failed:",
      "Upstream returned HTTP 403",
    );
  });

  it("returns successful JSON unchanged", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ items: [{ id: "video" }] })));
    await expect(fetchJsonOrThrow("https://provider.example/api?key=test-only-secret", {}, 1_000))
      .resolves.toEqual({ items: [{ id: "video" }] });
  });
});
