import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn().mockImplementation(async (hostname: string) => {
    if (hostname === "publisher.example") return [{ address: "93.184.216.34", family: 4 }];
    throw new Error("ENOTFOUND");
  }),
}));
vi.mock("../../upstream", () => ({
  cachedFetch: async (options: { request: () => Promise<unknown>; fallbackValue: unknown }) => {
    try {
      return { data: await options.request(), degraded: false, cacheHit: "miss", latencyMs: 0 };
    } catch {
      return { data: options.fallbackValue, degraded: true, cacheHit: "miss", latencyMs: 0 };
    }
  },
}));

import { getArticleSummary } from "../articleSummary";

beforeEach(() => vi.stubEnv("OPENAI_API_KEY", ""));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("article-summary IPv6 destination protection", () => {
  it("blocks an initial loopback IPv6 URL before fetching", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("unexpected upstream request"));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getArticleSummary({ url: "http://[::1]/internal" });
    expect(result.unavailableReason).toBe("unsupported_url");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["http://[::1]/internal", "http://[::ffff:127.0.0.1]/internal"])(
    "blocks redirect destination %s before fetching it",
    async (destination) => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(null, {
        status: 302, headers: { location: destination },
      }));
      vi.stubGlobal("fetch", fetchMock);
      const result = await getArticleSummary({ url: "https://publisher.example/redirect" });
      expect(result.unavailableReason).toBe("fetch_failed");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
});
