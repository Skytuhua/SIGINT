import type { StreamItem } from "../../../../news/stream/types";
import type { NewsArticle } from "../../../../news/types";
import { getRssArticles } from "../../providers/rss";
import { articleToStreamItem } from "../normalize";

let lastPollTimestamp = 0;

export async function pollRss(): Promise<{ items: StreamItem[]; healthUpdate: { ok: boolean; count: number; error?: string } }> {
  try {
    const result = await getRssArticles({
      q: "",
      maxItems: 500,
    });

    const articles: NewsArticle[] = result.data?.items ?? [];
    const newArticles = lastPollTimestamp > 0
      ? articles.filter((a) => a.publishedAt > lastPollTimestamp)
      : articles;

    if (articles.length > 0) {
      lastPollTimestamp = Math.max(lastPollTimestamp, ...articles.map((a) => a.publishedAt));
    }

    const streamItems = newArticles.map(articleToStreamItem);
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

export function resetRssCursor() { lastPollTimestamp = 0; }
