import type { NewsArticle, SuggestionItem } from "../types";

interface IndexedRecord {
  id: string;
  text: string;
  tokens: string[];
  item: NewsArticle;
}

export class InMemoryNewsIndex {
  private records: IndexedRecord[] = [];

  private maxRecords: number;

  constructor(maxRecords = 4000) {
    this.maxRecords = maxRecords;
  }

  clear(): void {
    this.records = [];
  }

  upsert(items: NewsArticle[]): void {
    const byId = new Map(this.records.map((record) => [record.id, record]));
    for (const item of items) {
      const text = `${item.headline} ${item.snippet} ${item.entity ?? ""} ${item.placeName ?? ""} ${item.source} ${item.category}`.toLowerCase();
      const tokens = Array.from(
        new Set(
          text
            .split(/[^\w.:-]+/g)
            .map((part) => part.trim())
            .filter((part) => part.length > 1)
        )
      );
      byId.set(item.id, {
        id: item.id,
        text,
        tokens,
        item,
      });
    }
    this.records = Array.from(byId.values())
      .sort((a, b) => b.item.publishedAt - a.item.publishedAt)
      .slice(0, this.maxRecords);
  }

  search(query: string, limit = 100): NewsArticle[] {
    const q = query.toLowerCase().trim();
    if (!q) {
      return this.records.slice(0, limit).map((record) => record.item);
    }
    return this.records
      .filter((record) => record.text.includes(q))
      .sort((a, b) => b.item.score - a.item.score || b.item.publishedAt - a.item.publishedAt)
      .slice(0, limit)
      .map((record) => record.item);
  }

  suggest(query: string, limit = 8): SuggestionItem[] {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    const scoreByToken = new Map<string, number>();
    for (const record of this.records.slice(0, 1200)) {
      for (const token of record.tokens) {
        if (!token.startsWith(q)) continue;
        scoreByToken.set(token, (scoreByToken.get(token) ?? 0) + 1);
      }
    }

    return Array.from(scoreByToken.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([token, score]) => ({
        label: token,
        value: token,
        type: "topic",
        confidence: Math.max(0.2, Math.min(0.95, score / 15)),
      }));
  }
}

