import { describe, expect, it, vi } from "vitest";
import type { NewsArticle } from "../../types";
import { dedupeArticles } from "../dedupe";

function article(id: string, headline: string, overrides: Partial<NewsArticle> = {}): NewsArticle {
  return {
    id, headline, url: `https://example.com/${id}`, canonicalUrl: "",
    domain: "example.com", source: "Example", publishedAt: 1_800_000_000_000,
    snippet: "", language: "en", category: "world", score: 50,
    backendSource: "rss",
    provenance: { headlineSource: "rss", coordsSource: "none", entitySource: "none", confidence: 1 },
    ...overrides,
  };
}

function normalizationCount(items: NewsArticle[]): { result: NewsArticle[]; count: number } {
  const titles = new Set(items.map((item) => item.headline));
  const spy = vi.spyOn(String.prototype, "toLowerCase");
  try {
    const result = dedupeArticles(items);
    // Count only our headlines, not lowercasing inside URL parsing or Vitest.
    const count = spy.mock.contexts.filter((value) => titles.has(String(value))).length;
    return { result, count };
  } finally {
    spy.mockRestore();
  }
}

describe("dedupeArticles", () => {
  it("normalizes each compared headline at most once per call", () => {
    const items = ["aaaa", "bbbb", "cccc", "dddd"].map((title, i) => article(String(i), title));
    const { result, count } = normalizationCount(items);
    expect(result).toEqual(items);
    expect(count).toBe(items.length);
    expect(normalizationCount(items).count).toBe(items.length);
  });

  it("skips headline work for URL duplicates and excluded domain/time pairs", () => {
    const first = article("a", "aaaa");
    const items = [
      first,
      article("b", "bbbb", { url: `${first.url}?utm_source=test` }),
      article("c", "cccc", { domain: "other.example" }),
      article("d", "dddd", { publishedAt: first.publishedAt - 6 * 60 * 60_000 - 1 }),
    ];
    const { result, count } = normalizationCount(items);
    expect(result.map((item) => item.id)).toEqual(["a", "c", "d"]);
    expect(count).toBe(0);
  });

  it("preserves similarity thresholds and newest-first selection", () => {
    const older = article("older", "aaaa", { publishedAt: 1_800_000_000_000 - 1 });
    const newer = article("newer", "aaaa!");
    expect(dedupeArticles([older, newer])).toEqual([newer]);
    expect(dedupeArticles([older, newer], 1.01)).toEqual([newer, older]);
  });

  it("retains empty normalized titles and matches single-character titles", () => {
    const empty = [article("a", "!!!"), article("b", "???")];
    expect(dedupeArticles(empty)).toEqual(empty);
    const single = [article("a", "A"), article("b", "a")];
    expect(dedupeArticles(single)).toEqual([single[0]]);
  });
});
