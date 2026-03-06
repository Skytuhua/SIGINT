import type { StreamItem } from "../../../../news/stream/types";
import { searchSecFilings } from "../../providers/sec";
import { canonicalizeUrl } from "../../../../news/engine/dedupe";
import { makeDuplicateGroupId } from "../normalize";

let lastPollTimestamp = 0;

export async function pollSec(): Promise<{ items: StreamItem[]; healthUpdate: { ok: boolean; count: number; error?: string } }> {
  try {
    const result = await searchSecFilings({ q: "", from: undefined, to: undefined, form: undefined });
    const filings = result.data || [];

    const items: StreamItem[] = filings
      .filter((f) => lastPollTimestamp === 0 || f.publishedAt > lastPollTimestamp)
      .map((f) => {
        const item: StreamItem = {
          id: f.id || `sec-${simpleHash(f.url)}`,
          timestamp: f.publishedAt,
          sourceName: f.source || "SEC EDGAR",
          sourceUrl: f.url,
          sourceDomain: f.domain || "sec.gov",
          category: "filings",
          tags: ["filings", f.formType ? `form:${f.formType}` : ""].filter(Boolean),
          headline: f.headline,
          summary: f.snippet || undefined,
          entities: f.entity
            ? [{ name: f.entity, type: "company" as const }]
            : f.companyName
              ? [{ name: f.companyName, type: "company" as const }]
              : [],
          tickers: [],
          confidence: 95,
          importance: 0,
          duplicateCount: 1,
          sources: ["SEC EDGAR"],
          duplicateGroupId: makeDuplicateGroupId({
            url: f.url,
            canonicalUrl: canonicalizeUrl(f.url),
            headline: f.headline,
            publishedAt: f.publishedAt,
          }),
          backendSource: "sec",
          language: "en",
        };
        return item;
      });

    if (filings.length > 0) {
      lastPollTimestamp = Math.max(lastPollTimestamp, ...filings.map((f) => f.publishedAt));
    }

    return {
      items,
      healthUpdate: { ok: !result.degraded, count: items.length },
    };
  } catch (err) {
    return {
      items: [],
      healthUpdate: { ok: false, count: 0, error: String(err) },
    };
  }
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

export function resetSecCursor() { lastPollTimestamp = 0; }
