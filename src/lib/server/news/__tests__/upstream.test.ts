import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("undici", () => ({ Agent: class {}, setGlobalDispatcher: vi.fn() }));
import { cachedFetch, fetchJsonOrThrow, UpstreamHttpError } from "../upstream";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("upstream HTTP diagnostics", () => {
  it("keeps request URLs out of HTTP errors, logs and degraded results", async () => {
    const url = "https://user:dummy-password@provider.example/private-path?apiKey=dummy-key#private-fragment";
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const request = () => fetchJsonOrThrow(url, {}, 1000);

    await expect(request()).rejects.toMatchObject({
      name: "UpstreamHttpError", status: 401, message: "Upstream returned HTTP 401",
    });
    const result = await cachedFetch({
      cacheKey: "http-error-test",
      policy: {
        key: "http-error-test", ttlMs: 1000, timeoutMs: 1000, maxRetries: 0,
        backoffBaseMs: 1, circuitFailureThreshold: 3, circuitOpenMs: 1000,
      },
      fallbackValue: [], request,
    });
    expect(result).toMatchObject({ degraded: true, error: "Upstream returned HTTP 401" });
    expect(log).toHaveBeenCalledWith("[upstream:http-error-test] attempt 1 failed:", "Upstream returned HTTP 401");
    expect(fetchMock).toHaveBeenCalledWith(url, { cache: "no-store" });
  });

  it("preserves the typed HTTP status and successful JSON responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ok: true })));
    await expect(fetchJsonOrThrow("https://provider.example", {}, 1000)).rejects.toBeInstanceOf(UpstreamHttpError);
    await expect(fetchJsonOrThrow("https://provider.example", {}, 1000)).resolves.toEqual({ ok: true });
  });
});
