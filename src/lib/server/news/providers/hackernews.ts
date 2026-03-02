import { categorizeArticle } from "../../../news/engine/categorize";
import { canonicalizeUrl, stableArticleId } from "../../../news/engine/dedupe";
import type { NewsArticle } from "../../../news/types";
import { cachedFetch, fetchJsonOrThrow, type CachedFetchResult, type UpstreamPolicy } from "../upstream";

const HN_BASE = "https://hacker-news.firebaseio.com/v0";

const POLICY: UpstreamPolicy = {
  key: "hackernews",
  ttlMs: 45_000,
  staleTtlMs: 5 * 60_000,
  timeoutMs: 10_000,
  maxRetries: 1,
  backoffBaseMs: 400,
  circuitFailureThreshold: 3,
  circuitOpenMs: 90_000,
  rateLimit: { capacity: 10, refillPerSec: 5, minIntervalMs: 100 },
};

interface HNItem {
  id: number;
  title?: string;
  url?: string;
  score?: number;
  time?: number;
  by?: string;
  type?: string;
  descendants?: number;
}

function hnToArticle(item: HNItem): NewsArticle | null {
  if (!item.title || !item.url) return null;
  const domain = (() => {
    try { return new URL(item.url).hostname.replace(/^www\./, ""); }
    catch { return "news.ycombinator.com"; }
  })();
  const canonical = canonicalizeUrl(item.url);
  const detected = categorizeArticle({ headline: item.title, snippet: "", source: "Hacker News", domain });

  const article: NewsArticle = {
    id: "",
    headline: item.title,
    url: item.url,
    canonicalUrl: canonical,
    domain,
    source: "Hacker News",
    publishedAt: (item.time ?? Math.floor(Date.now() / 1000)) * 1000,
    snippet: `${item.score ?? 0} points | ${item.descendants ?? 0} comments`,
    language: "en",
    category: detected.hitCount > 0 ? detected.category : "tech",
    score: Math.min(100, (item.score ?? 0) / 5),
    backendSource: "derived",
    provenance: {
      headlineSource: "derived",
      coordsSource: "none",
      entitySource: "none",
      confidence: 0.7,
    },
  };
  article.id = stableArticleId(article);
  return article;
}

export async function getHackerNewsTop(maxItems = 30): Promise<CachedFetchResult<NewsArticle[]>> {
  return cachedFetch({
    cacheKey: `hn-top-${maxItems}`,
    policy: POLICY,
    fallbackValue: [],
    request: async () => {
      const ids = await fetchJsonOrThrow<number[]>(
        `${HN_BASE}/topstories.json`,
        { headers: { "User-Agent": "WorldView/0.1" } },
        POLICY.timeoutMs,
      );
      const sliced = ids.slice(0, maxItems);
      const items = await Promise.all(
        sliced.map((id) =>
          fetchJsonOrThrow<HNItem>(
            `${HN_BASE}/item/${id}.json`,
            { headers: { "User-Agent": "WorldView/0.1" } },
            POLICY.timeoutMs,
          ).catch(() => null),
        ),
      );
      return items
        .filter((item): item is HNItem => Boolean(item))
        .map(hnToArticle)
        .filter((a): a is NewsArticle => Boolean(a));
    },
  });
}
