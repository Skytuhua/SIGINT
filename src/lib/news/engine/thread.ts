import type { NewsArticle, NewsThread } from "../types";

function normalizeHeadline(headline: string): string {
  return headline
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keyForThread(item: NewsArticle): string {
  const domain = item.domain.replace(/^www\./, "");
  const head = normalizeHeadline(item.headline).split(" ").slice(0, 8).join(" ");
  const hour = Math.floor(item.publishedAt / 3_600_000);
  return `${head}|${hour}|${item.entity ?? ""}|${domain.slice(0, 14)}`;
}

export function threadArticles(items: NewsArticle[]): { items: NewsArticle[]; threads: NewsThread[] } {
  const groups = new Map<string, NewsArticle[]>();
  for (const item of items) {
    const key = keyForThread(item);
    const arr = groups.get(key) ?? [];
    arr.push(item);
    groups.set(key, arr);
  }

  const threads: NewsThread[] = [];
  const nextItems: NewsArticle[] = [];
  let idx = 0;

  for (const group of Array.from(groups.values())) {
    group.sort((a, b) => b.score - a.score || b.publishedAt - a.publishedAt);
    const threadId = `thread-${idx++}`;
    const head = group[0];

    for (let i = 0; i < group.length; i += 1) {
      const item = group[i];
      item.threadId = threadId;
      item.isThreadHead = i === 0;
      item.threadCount = group.length;
      nextItems.push(item);
    }

    threads.push({
      id: threadId,
      headId: head.id,
      headline: head.headline,
      itemIds: group.map((item) => item.id),
      sourceCount: new Set(group.map((item) => item.domain)).size,
      firstSeenAt: Math.min(...group.map((item) => item.publishedAt)),
      lastSeenAt: Math.max(...group.map((item) => item.publishedAt)),
      topScore: head.score,
    });
  }

  nextItems.sort((a, b) => b.score - a.score || b.publishedAt - a.publishedAt);
  threads.sort((a, b) => b.topScore - a.topScore || b.lastSeenAt - a.lastSeenAt);

  return { items: nextItems, threads };
}
