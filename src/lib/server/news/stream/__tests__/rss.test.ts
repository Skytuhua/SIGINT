import { afterEach, describe, expect, it, vi } from "vitest";
import type { NewsArticle } from "../../../../news/types";
import { pollRss, resetRssCursor } from "../adapters/rss";
import { getRssArticles } from "../../providers/rss";

vi.mock("../../providers/rss", () => ({ getRssArticles: vi.fn() }));
const article = (id: string, publishedAt: number) => ({
  id, publishedAt, headline: id, url: `https://example.com/${id}`, canonicalUrl: `https://example.com/${id}`,
  domain: "example.com", source: "Example", snippet: "", language: "en", category: "world", score: 0,
  backendSource: "rss", provenance: { headlineSource: "rss", coordsSource: "none", entitySource: "none", confidence: 0.5 },
} as NewsArticle);
const feed = (items: NewsArticle[]) => ({ data: { items, feedsChecked: 2, degradedFeeds: [] }, degraded: false, cacheHit: "miss" as const, latencyMs: 0 });
afterEach(() => { resetRssCursor(); vi.clearAllMocks(); });

describe("RSS ingestion identity", () => {
  it("emits unseen late and equal-timestamp stories once", async () => {
    vi.mocked(getRssArticles).mockResolvedValueOnce(feed([article("first", 2000)]))
      .mockResolvedValueOnce(feed([article("first", 2000), article("late", 1000), article("same-time", 2000)]))
      .mockResolvedValueOnce(feed([article("first", 2000), article("late", 1000), article("same-time", 2000)]));
    expect((await pollRss()).items.map(item => item.id)).toEqual(["first"]);
    expect((await pollRss()).items.map(item => item.id)).toEqual(["late", "same-time"]);
    expect((await pollRss()).items).toEqual([]);
  });
});
