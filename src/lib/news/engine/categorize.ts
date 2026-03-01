import { CATEGORY_KEYWORDS } from "../../../config/newsConfig";
import type { NewsArticle, NewsCategory } from "../types";

function countHits(text: string, needles: string[]): number {
  let hits = 0;
  for (const needle of needles) {
    if (!needle) continue;
    if (text.includes(needle.toLowerCase())) hits += 1;
  }
  return hits;
}

export function categorizeArticle(input: Pick<NewsArticle, "headline" | "snippet" | "source" | "domain">): {
  category: NewsCategory;
  hitCount: number;
} {
  const haystack = `${input.headline} ${input.snippet} ${input.source} ${input.domain}`.toLowerCase();

  if (input.domain.includes("sec.gov")) {
    return { category: "filings", hitCount: 3 };
  }

  let bestCategory: NewsCategory = "world";
  let bestHits = 0;
  const categories = Object.keys(CATEGORY_KEYWORDS) as NewsCategory[];
  for (const category of categories) {
    if (category === "watchlist") continue;
    const hits = countHits(haystack, CATEGORY_KEYWORDS[category]);
    if (hits > bestHits) {
      bestHits = hits;
      bestCategory = category;
    }
  }

  return { category: bestCategory, hitCount: bestHits };
}

