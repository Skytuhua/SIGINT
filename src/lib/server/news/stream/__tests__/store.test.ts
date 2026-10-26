import { describe, expect, it } from "vitest";
import type { StreamItem } from "../../../../news/stream/types";
import { StreamStore } from "../store";

function item(id: string, headline: string): StreamItem {
  return {
    id,
    headline,
    timestamp: 1_800_000_000_000,
    sourceName: id,
    sourceUrl: `https://${id}.example/news`,
    sourceDomain: `${id}.example`,
    category: "world",
    tags: [],
    entities: [],
    tickers: [],
    confidence: 50,
    importance: 50,
    duplicateCount: 1,
    sources: [id],
    backendSource: "rss",
  };
}

describe("StreamStore title deduplication", () => {
  it.each([
    ["臺北藝術展覽正式開幕", "臺北藝術展覽正式開幕"],
    ["世界の美術展が開幕しました", "世界の美術展が開幕しました"],
    ["افتتاح معرض الفنون العالمي", "افتتاح معرض الفنون العالمي"],
    ["Открылась выставка искусства", "Открылась выставка искусства"],
    ["CAFÉ: arts festival opens!", "cafe\u0301 arts festival opens"],
    ["Markets: Energy Prices Rise!", "markets energy prices rise"],
  ])("collapses equivalent headlines: %s", (first, second) => {
    const store = new StreamStore();
    store.ingest("rss", [item("first", first)]);
    const result = store.ingest("rss", [item("second", second)]);
    expect(result.inserted).toHaveLength(0);
    expect(result.updated).toHaveLength(1);
    expect(store.size).toBe(1);
    expect(store.getItem("first")?.sources).toEqual(["first", "second"]);
  });

  it("keeps equivalent titles outside the six-hour matching window", () => {
    const store = new StreamStore();
    const first = item("first", "臺北藝術展覽正式開幕");
    const second = item("second", first.headline);
    second.timestamp += 6 * 60 * 60_000 + 1;
    store.ingest("rss", [first, second]);
    expect(store.size).toBe(2);
  });

  it("does not merge punctuation-only titles", () => {
    const store = new StreamStore();
    store.ingest("rss", [item("first", "!!!"), item("second", "???")]);
    expect(store.size).toBe(2);
  });

  it("keeps unrelated Chinese headlines that share a year", () => {
    const store = new StreamStore();
    store.ingest("rss", [item("first", "2026 臺北藝術展覽開幕")]);
    const result = store.ingest("rss", [item("second", "2026 全球能源價格上漲")]);
    expect(result.inserted).toHaveLength(1);
    expect(result.updated).toHaveLength(0);
    expect(store.size).toBe(2);
  });
});
