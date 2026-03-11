import { XMLParser } from "fast-xml-parser";
import { NEWS_RSS_FEEDS, type RssFeedSource } from "../../../../config/newsConfig";
import { categorizeArticle } from "../../../news/engine/categorize";
import { canonicalizeUrl, stableArticleId } from "../../../news/engine/dedupe";
import type { NewsArticle, NewsCategory } from "../../../news/types";
import { cachedFetch, type CachedFetchResult, type UpstreamPolicy } from "../upstream";

const POLICY: UpstreamPolicy = {
  key: "rss",
  ttlMs: 60_000,
  staleTtlMs: 10 * 60_000,
  timeoutMs: 14_000,
  maxRetries: 0,
  backoffBaseMs: 450,
  circuitFailureThreshold: 8,
  circuitOpenMs: 15_000,
  rateLimit: { capacity: 6, refillPerSec: 5, minIntervalMs: 100 },
};

const XML = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  parseTagValue: false,
  processEntities: true,
});

interface RssParams {
  q?: string;
  cat?: NewsCategory;
  domain?: string;
  maxItems?: number;
}

export interface RssNewsResult {
  items: NewsArticle[];
  feedsChecked: number;
  degradedFeeds: string[];
}

function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function readText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  if (typeof record["#text"] === "string") return record["#text"].trim();
  if (typeof record["__cdata"] === "string") return record["__cdata"].trim();
  if (typeof record["@_href"] === "string") return record["@_href"].trim();
  if (typeof record["@_url"] === "string") return record["@_url"].trim();
  if (typeof record["href"] === "string") return String(record["href"]).trim();
  return "";
}

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePublishedAt(value: unknown): number {
  const text = readText(value);
  if (!text) return Date.now();
  const ts = Date.parse(text);
  if (Number.isFinite(ts)) return ts;
  return Date.now();
}

function extractLink(row: Record<string, unknown>): string {
  const link = row.link;
  if (typeof link === "string") return link.trim();
  if (Array.isArray(link)) {
    const candidate = link
      .map((entry) => readText(entry))
      .find(Boolean);
    if (candidate) return candidate;
  }
  if (link && typeof link === "object") {
    const asRecord = link as Record<string, unknown>;
    if (typeof asRecord["@_href"] === "string") return asRecord["@_href"].trim();
    if (typeof asRecord["href"] === "string") return String(asRecord["href"]).trim();
  }
  const guid = readText(row.guid);
  return guid;
}

function normalizeUrl(value: string, baseUrl: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed, baseUrl);
    if (!/^https?:$/i.test(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function extractRows(xml: Record<string, unknown>): Record<string, unknown>[] {
  const rssRows = toArray(
    (xml.rss as Record<string, unknown> | undefined)?.channel
      ? ((xml.rss as Record<string, unknown>).channel as Record<string, unknown>)?.item
      : undefined
  );
  if (rssRows.length) return rssRows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"));

  const rdfRows = toArray((xml["rdf:RDF"] as Record<string, unknown> | undefined)?.item);
  if (rdfRows.length) return rdfRows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"));

  const atomRows = toArray((xml.feed as Record<string, unknown> | undefined)?.entry);
  if (atomRows.length) return atomRows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"));

  return [];
}

function toNewsArticle(feed: RssFeedSource, row: Record<string, unknown>): NewsArticle | null {
  const title = readText(row.title);
  const rawLink = extractLink(row);
  const url = normalizeUrl(rawLink, feed.url);
  if (!title || !url) return null;

  const canonicalUrl = canonicalizeUrl(url);
  const description = readText(row["content:encoded"]) || readText(row.description) || readText(row.summary) || readText(row.content);
  const snippet = stripHtml(description).slice(0, 420);
  const publishedAt = parsePublishedAt(row.pubDate || row.updated || row.published || row["dc:date"]);
  const imageUrl =
    readText(row["media:content"]) ||
    readText(row["media:thumbnail"]) ||
    readText((row.enclosure as Record<string, unknown> | undefined)?.["@_url"]);
  const domain = (() => {
    try {
      return new URL(canonicalUrl).hostname.replace(/^www\./, "");
    } catch {
      return feed.label.toLowerCase().replace(/\s+/g, "");
    }
  })();
  const detected = categorizeArticle({
    headline: title,
    snippet,
    source: feed.label,
    domain,
  });
  const category = detected.hitCount > 0 ? detected.category : feed.category;

  const article: NewsArticle = {
    id: "",
    headline: title,
    url,
    canonicalUrl,
    domain,
    source: feed.label,
    publishedAt,
    snippet,
    imageUrl: imageUrl || undefined,
    language: feed.language ?? "en",
    category,
    score: 0,
    backendSource: "rss",
    provenance: {
      headlineSource: "rss",
      coordsSource: "none",
      entitySource: "none",
      confidence: 0.72,
    },
  };
  article.id = stableArticleId(article);
  return article;
}

function matchTerms(item: NewsArticle, terms: string[]): boolean {
  if (!terms.length) return true;
  const text = `${item.headline} ${item.snippet} ${item.source} ${item.domain}`.toLowerCase();
  return terms.some((term) => text.includes(term));
}

function compareItems(a: NewsArticle, b: NewsArticle): number {
  if (a.publishedAt !== b.publishedAt) return b.publishedAt - a.publishedAt;
  if (a.score !== b.score) return b.score - a.score;
  return a.id.localeCompare(b.id);
}

// Per-feed timeout must be well under the overall budget so that
// slow/dead feeds don't block concurrency slots for too long.
// Most healthy feeds respond in <500ms; 4s is generous.
const PER_FEED_TIMEOUT_MS = 4_000;

async function fetchFeed(feed: RssFeedSource): Promise<NewsArticle[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_FEED_TIMEOUT_MS);
  try {
    const response = await fetch(feed.url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "SIGINT/0.1 (rss-ingestion)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`rss:${feed.id}:${response.status}`);
    }
    const xmlText = await response.text();
    const parsed = XML.parse(xmlText) as Record<string, unknown>;
    const rows = extractRows(parsed);
    return rows
      .map((row) => toNewsArticle(feed, row))
      .filter((item): item is NewsArticle => Boolean(item));
  } finally {
    clearTimeout(timer);
  }
}

export async function getRssArticles(params: RssParams): Promise<CachedFetchResult<RssNewsResult>> {
  const rawQ = (params.q ?? "").trim();
  let qTerms = rawQ
    .toLowerCase()
    .split(/[^\w.-]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .slice(0, 8);
  if (rawQ.length > 0 && qTerms.length === 0) {
    qTerms = [rawQ.toLowerCase()];
  }
  const maxItems = Math.max(30, Math.min(600, params.maxItems ?? 220));
  const selectedFeeds = params.cat
    ? NEWS_RSS_FEEDS.filter((feed) => feed.category === params.cat)
    : NEWS_RSS_FEEDS;
  const cacheKey = JSON.stringify({
    q: qTerms,
    cat: params.cat ?? "",
    domain: params.domain ?? "",
    maxItems,
    feeds: selectedFeeds.map((feed) => feed.id),
  });

  return cachedFetch({
    cacheKey,
    policy: POLICY,
    fallbackValue: { items: [], feedsChecked: selectedFeeds.length, degradedFeeds: [] },
    request: async () => {
      const degradedFeeds: string[] = [];
      const allItems: NewsArticle[] = [];

      // Time-budgeted concurrency pool: fetch RSS feeds with limited
      // parallelism and return whatever we have when the budget expires.
      // This prevents TCP connection saturation on Windows where 100+
      // simultaneous HTTPS connections cause mass timeouts.
      const CONCURRENCY = 16;
      const BUDGET_MS = 10_000;
      let okCount = 0;
      let completed = 0;

      await new Promise<void>((resolve) => {
        let running = 0;
        let idx = 0;
        let resolved = false;
        const budgetTimer = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            resolve();
          }
        }, BUDGET_MS);

        function done() {
          if (resolved) return;
          resolved = true;
          clearTimeout(budgetTimer);
          resolve();
        }

        function next() {
          if (resolved && running === 0) return;
          while (!resolved && running < CONCURRENCY && idx < selectedFeeds.length) {
            const feed = selectedFeeds[idx++];
            running++;
            fetchFeed(feed)
              .then((items) => {
                if (items.length > 0) {
                  okCount++;
                  allItems.push(...items);
                }
              })
              .catch(() => {
                degradedFeeds.push(feed.label);
              })
              .finally(() => {
                running--;
                completed++;
                if (idx >= selectedFeeds.length && running === 0) done();
                else if (!resolved) next();
              });
          }
          if (idx >= selectedFeeds.length && running === 0) done();
        }
        next();
      });

      if (allItems.length === 0) {
        console.warn(`[rss] 0 articles from ${completed}/${selectedFeeds.length} feeds tried (${degradedFeeds.length} failed)`);
      } else {
        console.log(`[rss] ${allItems.length} articles from ${okCount}/${completed} feeds (${selectedFeeds.length} total)`);
      }

      const domainNeedle = params.domain?.toLowerCase().trim() || "";
      const byId = new Map<string, NewsArticle>();
      for (const item of allItems) {
        if (domainNeedle && !item.domain.toLowerCase().includes(domainNeedle)) continue;
        if (!matchTerms(item, qTerms)) continue;
        if (!byId.has(item.id)) {
          byId.set(item.id, item);
        }
      }

      const items = Array.from(byId.values())
        .sort(compareItems)
        .slice(0, maxItems);
      return {
        items,
        feedsChecked: selectedFeeds.length,
        degradedFeeds,
      };
    },
  });
}
