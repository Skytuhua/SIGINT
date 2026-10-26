import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../ssrf", async (importOriginal) => ({ ...await importOriginal<object>(), isBlockedHost: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]) }));
vi.mock("undici", () => ({
  Agent: class { destroy = vi.fn().mockResolvedValue(undefined); },
  fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
}));
vi.mock("../../upstream", () => ({
  cachedFetch: async (options: { request: (signal: AbortSignal) => Promise<unknown>; fallbackValue: unknown }) => {
    try {
      return { data: await options.request(new AbortController().signal), degraded: false, cacheHit: "miss", latencyMs: 0 };
    } catch {
      return { data: options.fallbackValue, degraded: true, cacheHit: "miss", latencyMs: 0 };
    }
  },
}));

import { isBlockedHost } from "../../../ssrf";
import { getArticleSummary } from "../articleSummary";

beforeEach(() => {
  vi.mocked(isBlockedHost).mockImplementation(async (host) => host === "denied.example");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function redirectResponse(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

function htmlResponse(): Response {
  return new Response(
    "<html><body><p>" + "Reporters documented the entire scene overnight near the harbor. ".repeat(12) + "</p></body></html>",
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

describe("article-summary redirect policy", () => {
  it("uses manual redirect handling and checks a destination before fetching it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(redirectResponse("https://denied.example/article"));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getArticleSummary({ url: "https://publisher.example/blocked" });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
    expect(isBlockedHost).toHaveBeenCalledWith("denied.example", expect.any(AbortSignal));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.unavailableReason).toBe("fetch_failed");
  });

  it("follows same-site redirects and extracts the article", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(redirectResponse("/final/story"))
      .mockResolvedValueOnce(htmlResponse());
    vi.stubGlobal("fetch", fetchMock);
    const result = await getArticleSummary({ url: "https://publisher.example/a" });
    expect(fetchMock.mock.calls[1][0]).toBe("https://publisher.example/final/story");
    expect(result.summary).toBeTruthy();
    expect(result.engine).toBe("extractive");
  });

  it("rejects cross-origin redirect schemes other than http and https", async () => {
    const fetchMock = vi.fn().mockResolvedValue(redirectResponse("ftp://publisher.example/file"));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getArticleSummary({ url: "https://publisher.example/x" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.unavailableReason).toBe("fetch_failed");
  });

  it("stops at the redirect limit", async () => {
    let calls = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      calls += 1;
      return Promise.resolve(redirectResponse(`/hop${calls}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await getArticleSummary({ url: "https://publisher.example/loop" });
    expect(calls).toBe(6);
    expect(result.unavailableReason).toBe("fetch_failed");
  });
});
