import type { NewsArticle } from "../../../news/types";
import type { StreamEntity, StreamGeo, StreamItem } from "../../../news/stream/types";
import { canonicalizeUrl, makeFingerprint } from "../../../news/engine/dedupe";

/**
 * Convert an existing NewsArticle into a StreamItem.
 * Pure mapping — no side effects.
 */
export function articleToStreamItem(article: NewsArticle): StreamItem {
  const entities: StreamEntity[] = [];
  if (article.entity) {
    entities.push({
      name: article.entity,
      type: mapEntityType(article.entityType),
      ticker: article.entityType === "ticker" ? article.entity : undefined,
    });
  }
  if (article.aliases) {
    for (const alias of article.aliases) {
      if (alias && !entities.some((e) => e.name === alias)) {
        entities.push({ name: alias, type: "topic" });
      }
    }
  }

  const tickers: string[] = entities
    .filter((e) => e.type === "ticker" && e.ticker)
    .map((e) => e.ticker!);

  let geo: StreamGeo | undefined;
  if (Number.isFinite(article.lat) && Number.isFinite(article.lon)) {
    geo = {
      lat: article.lat!,
      lon: article.lon!,
      placeName: article.placeName,
      countryCode: article.country,
    };
  }

  const tags: string[] = [article.category];
  if (article.marketMoving) tags.push("market-moving");
  if (article.language && article.language !== "unknown") tags.push(`lang:${article.language}`);

  return {
    id: article.id || makeStreamId(article),
    timestamp: article.publishedAt,
    sourceName: article.source,
    sourceUrl: article.url,
    sourceDomain: article.domain,
    category: article.category,
    tags,
    headline: article.headline,
    summary: article.snippet || undefined,
    entities,
    tickers,
    geo,
    confidence: Math.round((article.provenance?.confidence ?? 0.5) * 100),
    importance: 0, // computed later by TOP scorer
    duplicateCount: 1,
    sources: [article.source],
    duplicateGroupId: makeDuplicateGroupId(article),
    threadId: article.threadId,
    backendSource: article.backendSource,
    coordSource: article.coordSource,
    language: article.language,
    imageUrl: article.imageUrl,
  };
}

function mapEntityType(
  t?: "ticker" | "company" | "person" | "location" | "topic"
): StreamEntity["type"] {
  if (!t) return "topic";
  if (t === "ticker") return "ticker";
  if (t === "company") return "company";
  if (t === "person") return "person";
  if (t === "location") return "location";
  return "topic";
}

function makeStreamId(article: NewsArticle): string {
  return `stream-${makeFingerprint({
    canonicalUrl: canonicalizeUrl(article.url),
    headline: article.headline,
    publishedAt: article.publishedAt,
  })}`;
}

/**
 * Produces a group id for duplicate collapsing.
 * Items with the same group id are considered duplicates.
 */
export function makeDuplicateGroupId(
  item: Pick<NewsArticle, "url" | "canonicalUrl" | "headline" | "publishedAt">
): string {
  const canon = canonicalizeUrl(item.canonicalUrl || item.url);
  const normTitle = item.headline
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  const timeWindow = Math.floor(item.publishedAt / (6 * 60 * 60_000));
  return `dg-${simpleHash(`${canon}|${normTitle}|${timeWindow}`)}`;
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return String(h >>> 0);
}
