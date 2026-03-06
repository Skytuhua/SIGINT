import type { StreamItem } from "../../../../news/stream/types";
import { makeDuplicateGroupId } from "../normalize";

const HN_ALGOLIA_URL = "https://hn.algolia.com/api/v1/search_by_date";

interface HNHit {
  objectID: string;
  title: string;
  url: string | null;
  author: string;
  points: number | null;
  num_comments: number | null;
  created_at: string;
  created_at_i: number;
  story_text?: string;
}

interface HNResponse {
  hits: HNHit[];
  nbHits: number;
}

let lastCursor = 0;

function categorizeHNStory(title: string): { category: "tech" | "ai" | "startups" | "cyber"; tags: string[] } {
  const t = title.toLowerCase();
  if (/\bai\b|machine learning|llm|gpt|neural|openai|anthropic|deep learning/.test(t)) {
    return { category: "ai", tags: ["tech", "ai"] };
  }
  if (/startup|yc |y combinator|funding|seed round|series [a-c]|venture/.test(t)) {
    return { category: "startups", tags: ["tech", "startups"] };
  }
  if (/hack|security|vulnerability|malware|ransomware|breach|exploit|zero.?day/.test(t)) {
    return { category: "cyber", tags: ["tech", "cyber"] };
  }
  return { category: "tech", tags: ["tech"] };
}

export async function pollHackerNews(): Promise<{ items: StreamItem[]; healthUpdate: { ok: boolean; count: number; error?: string } }> {
  try {
    const params = new URLSearchParams({
      tags: "story",
      hitsPerPage: "100",
    });
    if (lastCursor > 0) {
      params.set("numericFilters", `created_at_i>${lastCursor}`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(`${HN_ALGOLIA_URL}?${params}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { items: [], healthUpdate: { ok: false, count: 0, error: `HN ${res.status}` } };
    }

    const data: HNResponse = await res.json();
    const hits = data.hits || [];

    if (hits.length > 0) {
      lastCursor = Math.max(lastCursor, ...hits.map((h) => h.created_at_i));
    }

    const items: StreamItem[] = hits
      .filter((h) => h.title)
      .map((hit) => {
        const ts = hit.created_at_i * 1000;
        const url = hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`;
        const { category, tags } = categorizeHNStory(hit.title);
        const points = hit.points ?? 0;
        const comments = hit.num_comments ?? 0;
        const domain = hit.url ? extractDomain(hit.url) : "news.ycombinator.com";

        const item: StreamItem = {
          id: `hn-${hit.objectID}`,
          timestamp: ts,
          sourceName: "Hacker News",
          sourceUrl: url,
          sourceDomain: domain,
          category,
          tags: [...tags, points > 100 ? "popular" : "", comments > 50 ? "discussed" : ""].filter(Boolean),
          headline: hit.title,
          summary: hit.story_text ? hit.story_text.slice(0, 200) : undefined,
          entities: [],
          tickers: [],
          confidence: 70,
          importance: 0,
          duplicateCount: 1,
          sources: ["Hacker News"],
          duplicateGroupId: makeDuplicateGroupId({
            url,
            canonicalUrl: url,
            headline: hit.title,
            publishedAt: ts,
          }),
          backendSource: "hn",
          language: "en",
        };
        return item;
      });

    return {
      items,
      healthUpdate: { ok: true, count: items.length },
    };
  } catch (err) {
    return {
      items: [],
      healthUpdate: { ok: false, count: 0, error: String(err) },
    };
  }
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname; } catch { return "unknown"; }
}

export function resetHNCursor() { lastCursor = 0; }
