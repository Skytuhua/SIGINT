import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchJsonOrThrow: vi.fn(), cachedFetch: vi.fn() }));
vi.mock("../../upstream", () => mocks);
import { getNewsApiArticles } from "../newsapi";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("NewsAPI authentication", () => {
  it("uses header authentication without including credentials in request or cache URLs", async () => {
    vi.stubEnv("NEWS_API_KEY", "dummy-newsapi-key");
    vi.stubEnv("NEWS_API_BASE_URL", "https://newsapi.org/v2/everything?apiKey=obsolete-dummy-key");
    mocks.fetchJsonOrThrow.mockResolvedValue({ status: "ok", articles: [] });
    mocks.cachedFetch.mockImplementation(async (options) => ({ data: await options.request() }));

    await getNewsApiArticles({ q: "weather", maxItems: 25 });

    const [url, init] = mocks.fetchJsonOrThrow.mock.calls[0];
    expect(new URL(url).searchParams.has("apiKey")).toBe(false);
    expect(new URL(url).searchParams.get("q")).toBe("weather");
    expect(new URL(url).searchParams.get("pageSize")).toBe("25");
    expect(new Headers(init.headers).get("X-Api-Key")).toBe("dummy-newsapi-key");
    expect(mocks.cachedFetch.mock.calls[0][0].cacheKey).toBe(url);
  });
});
