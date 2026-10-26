import type { NewsArticle } from "../types";
export function article(id = "story"): NewsArticle {
  return {
    id, headline: `Headline ${id}`, url: `https://example.test/${id}`, canonicalUrl: `https://example.test/${id}`,
    domain: "example.test", source: "Example", publishedAt: 1000, snippet: "Saved snippet", language: "en",
    category: "tech", score: 50, backendSource: "rss", aliases: ["Example"],
    provenance: { headlineSource: "rss", coordsSource: "none", entitySource: "none", confidence: 1 },
  };
}
