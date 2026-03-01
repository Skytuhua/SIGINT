import type { NewsArticle } from "../types";

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(value: string): Set<string> {
  const s = normalizeText(value);
  const set = new Set<string>();
  if (s.length < 2) {
    if (s) set.add(s);
    return set;
  }
  for (let i = 0; i < s.length - 1; i += 1) {
    set.add(s.slice(i, i + 2));
  }
  return set;
}

function diceSimilarity(a: string, b: string): number {
  const aa = bigrams(a);
  const bb = bigrams(b);
  if (!aa.size || !bb.size) return 0;
  let overlap = 0;
  aa.forEach((token) => {
    if (bb.has(token)) overlap += 1;
  });
  return (2 * overlap) / (aa.size + bb.size);
}

function stableHash(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return String(hash >>> 0);
}

export function canonicalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const drop = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"];
    for (const key of drop) {
      parsed.searchParams.delete(key);
    }
    return `${parsed.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

export function stableArticleId(
  source: Pick<NewsArticle, "backendSource" | "canonicalUrl" | "url" | "headline">
): string {
  const canonical = canonicalizeUrl(source.canonicalUrl || source.url || source.headline || "unknown");
  return `${source.backendSource}-${stableHash(`${source.backendSource}|${canonical}`)}`;
}

function compareItems(a: NewsArticle, b: NewsArticle): number {
  if (a.publishedAt !== b.publishedAt) return b.publishedAt - a.publishedAt;
  if (a.score !== b.score) return b.score - a.score;
  return a.id.localeCompare(b.id);
}

export function dedupeArticles(items: NewsArticle[], threshold = 0.9): NewsArticle[] {
  const normalized = items.map((item) => {
    item.canonicalUrl = canonicalizeUrl(item.url || item.canonicalUrl);
    return item;
  });
  const sorted = [...normalized].sort(compareItems);
  const seenUrl = new Set<string>();
  const output: NewsArticle[] = [];

  for (const item of sorted) {
    if (!item.canonicalUrl) continue;
    if (seenUrl.has(item.canonicalUrl)) continue;

    const duplicate = output.some((existing) => {
      if (existing.canonicalUrl === item.canonicalUrl) return true;
      if (existing.domain !== item.domain) return false;
      if (Math.abs(existing.publishedAt - item.publishedAt) > 6 * 60 * 60_000) return false;
      return diceSimilarity(existing.headline, item.headline) >= threshold;
    });
    if (duplicate) continue;

    seenUrl.add(item.canonicalUrl);
    output.push(item);
  }

  return output.sort(compareItems);
}

export function makeFingerprint(item: Pick<NewsArticle, "canonicalUrl" | "headline" | "publishedAt">): string {
  const base = `${item.canonicalUrl}|${normalizeText(item.headline)}|${Math.floor(item.publishedAt / 60000)}`;
  return stableHash(base);
}
