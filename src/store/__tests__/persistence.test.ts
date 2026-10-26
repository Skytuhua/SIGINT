import { afterEach, describe, expect, it, vi } from "vitest";
import type { AlertRuleState, NewsWatchlist, SavedSearch } from "../../lib/news/types";

const news = {
  watchlist: {
    tickers: ["ACME"], topics: ["energy"], regions: ["US"], sources: ["reuters"],
  } satisfies NewsWatchlist,
  savedSearches: [{
    id: "saved", name: "Energy", query: "energy", createdAt: 1, alertEnabled: true,
  }] satisfies SavedSearch[],
  alerts: [{
    id: "rule", name: "Energy", query: "energy", threshold: 5,
    soundEnabled: false, enabled: true, lastChecked: 0, hitCount: 0,
    unreadCount: 0, seenFingerprints: [],
  }] satisfies AlertRuleState[],
  mutedSources: ["example.test"],
  layoutPreset: "split",
};

async function hydrate(version: number, state: object) {
  const data = new Map([["sigint-store-v2", JSON.stringify({ version, state })]]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
  const { useSIGINTStore: store } = await import("../index");
  expect(store.persist.hasHydrated()).toBe(true);
  return { store, data };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("persisted news migration", () => {
  it.each([12, 13, 14, 15])("preserves curated news when hydrating version %s", async (version) => {
    const { store, data } = await hydrate(version, { news });
    expect(store.getState().news).toMatchObject(news);
    expect(typeof store.getState().setNewsQuery).toBe("function");
    const saved = JSON.parse(data.get("sigint-store-v2")!);
    expect(saved.version).toBe(15);
    expect(saved.state.news).toMatchObject(news);
    await store.persist.rehydrate();
    expect(store.getState().news).toMatchObject(news);
  });

  it.each([0, 11])("retains the one-time pre-v12 reset for version %s", async (version) => {
    const { store } = await hydrate(version, { news, layers: { flights: false } });
    expect(store.getState().news.watchlist.tickers).toEqual([]);
    expect(store.getState().news.savedSearches).toEqual([]);
    expect(store.getState().news.alerts).toEqual([]);
    expect(store.getState().layers.flights).toBe(false);
  });

  it("fills missing news defaults and discards transient feed data", async () => {
    const { store } = await hydrate(14, { news: { feedItems: [{ id: "stale" }] } });
    expect(store.getState().news.watchlist.tickers).toEqual([]);
    expect(store.getState().news.savedSearches).toEqual([]);
    expect(store.getState().news.feedItems).toEqual([]);
  });
});
