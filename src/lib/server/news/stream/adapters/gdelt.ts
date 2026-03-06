import type { StreamItem } from "../../../../news/stream/types";
import type { NewsArticle } from "../../../../news/types";
import { getGdeltArticles } from "../../providers/gdelt";
import { categorizeArticle } from "../../../../news/engine/categorize";
import { canonicalizeUrl, stableArticleId } from "../../../../news/engine/dedupe";
import { articleToStreamItem } from "../normalize";

interface GdeltCursor {
  lastMaxTimestamp: number;
}

function parseGdeltDate(value: string): number {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!m) return Date.now();
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
  const ts = Date.parse(iso);
  return Number.isFinite(ts) ? ts : Date.now();
}

function gdeltToArticle(raw: {
  url: string;
  title: string;
  seendate: string;
  socialimage?: string;
  domain: string;
  language: string;
  sourcecountry: string;
}): NewsArticle {
  const publishedAt = parseGdeltDate(raw.seendate);
  const cat = categorizeArticle({
    headline: raw.title,
    snippet: "",
    source: raw.domain,
    domain: raw.domain,
  });
  const item: NewsArticle = {
    id: "",
    headline: raw.title || raw.url,
    url: raw.url,
    canonicalUrl: canonicalizeUrl(raw.url),
    domain: raw.domain || "unknown",
    source: raw.domain || "GDELT",
    publishedAt,
    snippet: "",
    imageUrl: raw.socialimage,
    language: raw.language || "unknown",
    country: raw.sourcecountry || undefined,
    category: cat.category,
    score: 0,
    backendSource: "gdelt",
    provenance: {
      headlineSource: "gdelt",
      coordsSource: "none",
      entitySource: "none",
      confidence: 0.8,
    },
  };
  item.id = stableArticleId(item);
  return item;
}

let cursor: GdeltCursor = { lastMaxTimestamp: 0 };
let initialBackfillDone = false;

export async function pollGdelt(): Promise<{ items: StreamItem[]; healthUpdate: { ok: boolean; count: number; error?: string } }> {
  try {
    const result = await getGdeltArticles({
      q: "",
      timespan: "15min",
      maxrecords: 250,
    });

    const articles = (result.data || []).map(gdeltToArticle);
    const newArticles = cursor.lastMaxTimestamp > 0
      ? articles.filter((a) => a.publishedAt > cursor.lastMaxTimestamp)
      : articles;

    if (articles.length > 0) {
      cursor.lastMaxTimestamp = Math.max(
        cursor.lastMaxTimestamp,
        ...articles.map((a) => a.publishedAt)
      );
    }

    let allNewArticles = [...newArticles];

    // Cold-start backfill: on very first poll, fetch last 2 days to seed the store
    if (!initialBackfillDone) {
      initialBackfillDone = true;
      try {
        const backfill = await getGdeltArticles({
          q: "",
          timespan: "2d",
          maxrecords: 250,
        });
        const backfillArticles = (backfill.data || []).map(gdeltToArticle);
        const seenUrls = new Set(allNewArticles.map((a) => a.canonicalUrl || a.url));
        for (const a of backfillArticles) {
          const key = a.canonicalUrl || a.url;
          if (!seenUrls.has(key)) {
            allNewArticles.push(a);
            seenUrls.add(key);
          }
        }
      } catch {
        // backfill failure is non-fatal
      }
    }

    const streamItems = allNewArticles.map(articleToStreamItem);

    return {
      items: streamItems,
      healthUpdate: { ok: !result.degraded, count: streamItems.length },
    };
  } catch (err) {
    return {
      items: [],
      healthUpdate: { ok: false, count: 0, error: String(err) },
    };
  }
}

export function resetGdeltCursor() {
  cursor = { lastMaxTimestamp: 0 };
  initialBackfillDone = false;
}
