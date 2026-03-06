import type { NewsArticle } from "../../../news/types";
import { canonicalizeUrl, stableArticleId } from "../../../news/engine/dedupe";
import {
  cachedFetch,
  type CachedFetchResult,
  type UpstreamPolicy,
  fetchJsonOrThrow,
} from "../upstream";

export interface NewsApiParams {
  q?: string;
  from?: string;
  to?: string;
  language?: string;
  maxItems?: number;
}

const NEWSAPI_POLICY: UpstreamPolicy = {
  key: "newsapi",
  ttlMs: 30_000,
  staleTtlMs: 5 * 60_000,
  timeoutMs: 9_000,
  maxRetries: 1,
  backoffBaseMs: 450,
  circuitFailureThreshold: 3,
  circuitOpenMs: 30_000,
  rateLimit: { capacity: 6, refillPerSec: 5, minIntervalMs: 150 },
};

interface NewsApiArticle {
  source?: { id?: string | null; name?: string | null } | null;
  author?: string | null;
  title?: string | null;
  description?: string | null;
  url?: string | null;
  urlToImage?: string | null;
  publishedAt?: string | null;
  content?: string | null;
}

interface NewsApiResponse {
  status: string;
  totalResults?: number;
  articles?: NewsApiArticle[];
  code?: string;
  message?: string;
}

function parsePublishedAt(value?: string | null): number {
  if (!value) return Date.now();
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : Date.now();
}

function toNewsArticle(row: NewsApiArticle, fallbackLanguage: string): NewsArticle | null {
  const url = (row.url ?? "").trim();
  if (!url) return null;

  const canonicalUrl = canonicalizeUrl(url);
  let domain = "unknown";
  try {
    domain = new URL(canonicalUrl).hostname.replace(/^www\./, "");
  } catch {
    // keep default
  }

  const headline = (row.title ?? url).trim();
  const snippet = (row.description ?? "").trim();
  const publishedAt = parsePublishedAt(row.publishedAt ?? undefined);
  const sourceLabel = (row.source?.name ?? domain).trim() || domain;

  const item: NewsArticle = {
    id: "",
    headline,
    url,
    canonicalUrl,
    domain,
    source: sourceLabel,
    publishedAt,
    snippet,
    imageUrl: row.urlToImage ?? undefined,
    language: fallbackLanguage || "en",
    category: "world",
    score: 0,
    backendSource: "newsapi",
    provenance: {
      headlineSource: "newsapi",
      coordsSource: "none",
      entitySource: "none",
      confidence: 0.75,
    },
  };

  item.id = stableArticleId(item);
  return item;
}

export async function getNewsApiArticles(
  params: NewsApiParams
): Promise<CachedFetchResult<NewsArticle[]>> {
  const apiKey = (process.env.NEWS_API_KEY ?? "").trim();
  if (!apiKey) {
    return {
      data: [],
      degraded: true,
      latencyMs: 0,
      cacheHit: "miss",
      error: "newsapi-key-missing",
    };
  }

  const baseUrl = (process.env.NEWS_API_BASE_URL ?? "https://newsapi.org/v2/everything").trim();
  const url = new URL(baseUrl);

  const q = (params.q ?? "").trim();
  if (q) {
    url.searchParams.set("q", q);
  } else {
    // fall back to a broad world-news query to avoid API errors on empty q
    url.searchParams.set("q", "world news");
  }

  if (params.from) url.searchParams.set("from", params.from);
  if (params.to) url.searchParams.set("to", params.to);
  if (params.language) url.searchParams.set("language", params.language);
  url.searchParams.set("pageSize", String(Math.max(20, Math.min(100, params.maxItems ?? 60))));
  url.searchParams.set("sortBy", "publishedAt");
  url.searchParams.set("apiKey", apiKey);

  return cachedFetch<NewsArticle[]>({
    cacheKey: url.toString(),
    policy: NEWSAPI_POLICY,
    fallbackValue: [],
    request: async () => {
      const json = await fetchJsonOrThrow<NewsApiResponse>(
        url.toString(),
        {
          headers: {
            "User-Agent": "WorldView/0.1 (newsapi-ingestion)",
            Accept: "application/json",
          },
        },
        NEWSAPI_POLICY.timeoutMs
      );

      if (json.status !== "ok") {
        throw new Error(json.message || json.code || "newsapi-error");
      }

      const articles = Array.isArray(json.articles) ? json.articles : [];
      const language = params.language ?? "en";
      const mapped: NewsArticle[] = [];
      for (const row of articles) {
        const item = toNewsArticle(row, language);
        if (item) mapped.push(item);
      }
      return mapped;
    },
  });
}

