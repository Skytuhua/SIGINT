import { describe, expect, it } from "vitest";
import type { NewsArticle } from "../../types";
import { dedupeArticles } from "../dedupe";

function article(id: string, overrides: Partial<NewsArticle> = {}): NewsArticle {
  return {
    id, headline: "Markets report today", url: `https://example.com/${id}`,
    canonicalUrl: "", domain: "example.com", source: "Example",
    publishedAt: 1_800_000_000_000, snippet: "", language: "en",
    category: "world", score: 50, backendSource: "rss",
    provenance: { headlineSource: "rss", coordsSource: "none", entitySource: "none", confidence: 1 },
    ...overrides,
  };
}

describe("dedupe candidate grouping", () => {
  it("does linear domain lookup work when every article has a different domain", () => {
    let reads = 0;
    const items = Array.from({ length: 100 }, (_, i) => {
      const item = article(String(i));
      Object.defineProperty(item, "domain", { get() { reads++; return `${i}.example`; } });
      return item;
    });
    const output = dedupeArticles(items);
    expect(output).toHaveLength(100);
    expect(reads).toBeLessThanOrEqual(400);
  });

  it("keeps domain and inclusive six-hour matching semantics", () => {
    const first = article("a");
    const boundary = article("b", { publishedAt: first.publishedAt - 6 * 60 * 60_000 });
    const outside = article("c", { publishedAt: boundary.publishedAt - 1 });
    const otherDomain = article("d", { domain: "other.example" });
    expect(dedupeArticles([outside, boundary, otherDomain, first]).map((item) => item.id))
      .toEqual(["a", "d", "c"]);
  });

  it("deduplicates canonical URLs globally across domains", () => {
    const first = article("a");
    const second = article("b", { domain: "other.example", url: `${first.url}?utm_source=test` });
    expect(dedupeArticles([second, first])).toEqual([first]);
  });

  it("checks non-neighbor candidates without indexing rejected articles", () => {
    const items = [
      article("a", { headline: "aaaa" }),
      article("b", { headline: "bbbb" }),
      article("c", { headline: "aaaa!" }),
    ];
    expect(dedupeArticles(items).map((item) => item.id)).toEqual(["a", "b"]);
    expect(dedupeArticles(items, 1.01)).toEqual(items);
  });
});
