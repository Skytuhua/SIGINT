import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NewsArticle, SecFiling, YouTubeLive } from "../../../news/types";

const providers = vi.hoisted(() => ({
  getGdeltArticles: vi.fn(),
  getGdeltGeo: vi.fn(),
  getRssArticles: vi.fn(),
  fetchSecCompanyFilings: vi.fn(),
  fetchSecTickerMap: vi.fn(),
  searchSecFilings: vi.fn(),
  fetchWikidataEntity: vi.fn(),
  geocodeNominatim: vi.fn(),
  discoverYouTubeLiveStreams: vi.fn(),
  getNewsApiArticles: vi.fn(),
}));
vi.mock("../providers/gdelt", () => providers);
vi.mock("../providers/rss", () => providers);
vi.mock("../providers/sec", () => providers);
vi.mock("../providers/wikidata", () => providers);
vi.mock("../providers/nominatim", () => providers);
vi.mock("../providers/youtube", () => providers);
vi.mock("../providers/newsapi", () => providers);
import { executeNewsSearch } from "../search";

const result = <T>(data: T) => ({ data, degraded: false, latencyMs: 0, cacheHit: "miss" as const });

function article(id: string, date: string): NewsArticle {
  return {
    id, headline: `Story ${id}`, url: `https://${id}.example/story`, canonicalUrl: `https://${id}.example/story`,
    domain: `${id}.example`, source: id, publishedAt: Date.parse(date), snippet: "", language: "en",
    category: "world", score: 0, backendSource: "rss", lat: 10, lon: 20,
    provenance: { headlineSource: "rss", coordsSource: "none", entitySource: "none", confidence: 0.8 },
  };
}

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-26T12:00:00Z"));
  providers.getGdeltArticles.mockResolvedValue(result([]));
  providers.getGdeltGeo.mockResolvedValue(result({ points: [], aggregates: [] }));
  providers.getRssArticles.mockResolvedValue(result({ items: [], feedsChecked: 1, degradedFeeds: [] }));
  providers.fetchSecCompanyFilings.mockResolvedValue(result([]));
  providers.fetchSecTickerMap.mockResolvedValue(result({}));
  providers.searchSecFilings.mockResolvedValue(result([]));
  providers.fetchWikidataEntity.mockResolvedValue(result(null));
  providers.geocodeNominatim.mockResolvedValue(result(null));
  providers.getNewsApiArticles.mockResolvedValue(result([]));
  providers.discoverYouTubeLiveStreams.mockResolvedValue(result({ items: [] }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe("merged news publication dates", () => {
  it("applies inclusive UTC calendar bounds to RSS before facets, markers and pagination", async () => {
    providers.getRssArticles.mockResolvedValue(result({
      items: [
        article("old", "2020-01-01T12:00:00Z"),
        article("before", "2026-09-30T23:59:59.999Z"),
        article("first", "2026-10-01T00:00:00Z"),
        article("last", "2026-10-26T23:59:59.999Z"),
        article("after", "2026-10-27T00:00:00Z"),
      ], feedsChecked: 1, degradedFeeds: [],
    }));

    const response = await executeNewsSearch(new URLSearchParams("src=rss&from=2026-10-01&to=2026-10-26&limit=1"));

    expect(response.items.map((item) => item.id)).toEqual(["last"]);
    expect(response.total).toBe(2);
    expect(response.markers.map((marker) => marker.articleId)).toEqual(["last", "first"]);
    expect(response.facets.sources.map((facet) => facet.key)).toEqual(["last", "first"]);
  });

  it("applies a relative timespan to RSS including the exact lower bound", async () => {
    providers.getRssArticles.mockResolvedValue(result({
      items: [
        article("outside", "2026-10-25T11:59:59.999Z"),
        article("boundary", "2026-10-25T12:00:00Z"),
        article("recent", "2026-10-26T11:00:00Z"),
        article("future", "2026-10-26T12:00:00.001Z"),
      ], feedsChecked: 1, degradedFeeds: [],
    }));

    const response = await executeNewsSearch(new URLSearchParams("src=rss&timespan=24h"));

    expect(response.items.map((item) => item.id)).toEqual(["recent", "boundary"]);
  });

  it("applies explicit dates to the direct SEC company path", async () => {
    const filing = (id: string, publishedAt: string): SecFiling => ({
      id, cik: "0000000001", companyName: "Example", formType: "10-K", filedAt: publishedAt.slice(0, 10),
      accessionNumber: id, url: `https://sec.gov/${id}`, headline: `Filing ${id}`, snippet: "",
      publishedAt: Date.parse(publishedAt), score: 50, category: "filings", backendSource: "sec",
      source: "SEC EDGAR", domain: "sec.gov", language: "en",
    });
    providers.fetchSecCompanyFilings.mockResolvedValue(result([
      filing("old", "2020-01-01T00:00:00Z"), filing("current", "2026-10-20T00:00:00Z"),
    ]));

    const response = await executeNewsSearch(new URLSearchParams("q=cik:1&from=2026-10-01&to=2026-10-26"));

    expect(response.items.map((item) => item.id)).toEqual(["current"]);
  });

  it("keeps explicit calendar ranges effective when a relative timespan is also present", async () => {
    providers.getRssArticles.mockResolvedValue(result({
      items: [article("historical", "2020-01-02T00:00:00Z"), article("recent", "2026-10-26T11:00:00Z")],
      feedsChecked: 1, degradedFeeds: [],
    }));

    const response = await executeNewsSearch(new URLSearchParams("src=rss&timespan=24h&from=2020-01-01&to=2020-01-03"));

    expect(response.items.map((item) => item.id)).toEqual(["historical"]);
  });

  it("retains the date constraint when inserting video fallback items", async () => {
    const stream = (id: string, publishedAt: string): YouTubeLive => ({
      id, videoId: id, channelId: "channel", channelName: "News", title: `Stream ${id}`,
      status: "recent", sourceUrl: `https://youtube.com/watch?v=${id}`, publishedAt,
    });
    providers.discoverYouTubeLiveStreams.mockResolvedValue(result({ items: [
      stream("old", "2020-01-01T00:00:00Z"), stream("new", "2026-10-26T11:00:00Z"),
    ] }));

    const response = await executeNewsSearch(new URLSearchParams("has=video&timespan=24h"));

    expect(response.items.map((item) => item.headline)).toEqual(["Stream new"]);
    expect(response.total).toBe(1);
  });
});
