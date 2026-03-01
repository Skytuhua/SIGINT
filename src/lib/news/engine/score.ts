import { MARKET_MOVING_KEYWORDS } from "../../../config/newsConfig";
import type { NewsArticle, NewsWatchlist } from "../types";

function recencyScore(publishedAt: number, now: number): number {
  const ageMs = Math.max(0, now - publishedAt);
  const ageHours = ageMs / 3_600_000;
  if (ageHours <= 1) return 28;
  if (ageHours <= 6) return 22;
  if (ageHours <= 24) return 16;
  if (ageHours <= 72) return 10;
  if (ageHours <= 168) return 6;
  return 2;
}

function keywordScore(text: string): number {
  let score = 0;
  for (const [needle, weight] of Object.entries(MARKET_MOVING_KEYWORDS)) {
    if (text.includes(needle.toLowerCase())) score += weight;
  }
  return Math.min(30, score);
}

function watchlistScore(text: string, watchlist: NewsWatchlist): number {
  let score = 0;
  for (const ticker of watchlist.tickers) {
    if (ticker && text.includes(ticker.toLowerCase())) score += 8;
  }
  for (const topic of watchlist.topics) {
    if (topic && text.includes(topic.toLowerCase())) score += 5;
  }
  for (const region of watchlist.regions) {
    if (region && text.includes(region.toLowerCase())) score += 4;
  }
  for (const source of watchlist.sources) {
    if (source && text.includes(source.toLowerCase())) score += 3;
  }
  return Math.min(30, score);
}

function sourceCredibility(domain: string): number {
  const d = domain.toLowerCase();
  if (d.includes("reuters") || d.includes("apnews") || d.includes("bloomberg")) return 8;
  if (d.includes("ft.com") || d.includes("wsj.com") || d.includes("nytimes.com")) return 7;
  if (d.includes("sec.gov")) return 10;
  return 4;
}

export function scoreArticle(
  item: Pick<NewsArticle, "headline" | "snippet" | "domain" | "publishedAt" | "category">,
  watchlist: NewsWatchlist,
  now = Date.now()
): number {
  const text = `${item.headline} ${item.snippet}`.toLowerCase();
  const filingBoost = item.category === "filings" ? 12 : 0;
  const score =
    recencyScore(item.publishedAt, now) +
    keywordScore(text) +
    watchlistScore(text, watchlist) +
    filingBoost +
    sourceCredibility(item.domain);
  return Math.max(0, Math.min(100, Math.round(score)));
}

