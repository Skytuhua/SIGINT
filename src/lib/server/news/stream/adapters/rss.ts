import type { StreamItem } from "../../../../news/stream/types";
import type { NewsArticle } from "../../../../news/types";
import { getRssArticles } from "../../providers/rss";
import { articleToStreamItem } from "../normalize";

const MAX_SEEN_IDS = 10_000;
const seenIds = new Set<string>();

export async function pollRss(): Promise<{ items: StreamItem[]; healthUpdate: { ok: boolean; count: number; error?: string } }> {
  try {
    const result = await getRssArticles({
      q: "",
      maxItems: 500,
    });

    const articles: NewsArticle[] = result.data?.items ?? [];
    const streamItems: StreamItem[] = [];
    for (const article of articles) {
      const item = articleToStreamItem(article);
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      streamItems.push(item);
    }
    while (seenIds.size > MAX_SEEN_IDS) {
      const oldest = seenIds.values().next().value;
      if (oldest === undefined) break;
      seenIds.delete(oldest);
    }

    const degraded = result.degraded || (result.data?.degradedFeeds?.length ?? 0) > 0;

    return {
      items: streamItems,
      healthUpdate: { ok: !degraded, count: streamItems.length },
    };
  } catch (err) {
    return {
      items: [],
      healthUpdate: { ok: false, count: 0, error: String(err) },
    };
  }
}

export function resetRssCursor() { seenIds.clear(); }
