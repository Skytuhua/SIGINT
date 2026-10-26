import { afterEach, describe, expect, it, vi } from "vitest";

async function hydrate(state: object) {
  const data = new Map([["sigint-store-v2", JSON.stringify({ version: 15, state })]]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
  const { useSIGINTStore: store } = await import("../index");
  expect(store.persist.hasHydrated()).toBe(true);
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("persisted root preferences", () => {
  it("round-trips every explicitly restored root preference", async () => {
    const initial = await hydrate({});
    const snapshot = initial.persist.getOptions().partialize!(initial.getState()) as Pick<
      ReturnType<typeof initial.getState>,
      "filters" | "ui" | "savedScenes" | "cctv" | "tradeRouteSelection" | "layers"
    >;
    snapshot.layers.flights = false;
    vi.resetModules();
    const restored = await hydrate(snapshot);
    for (const key of ["filters", "ui", "savedScenes", "cctv", "tradeRouteSelection", "layers"] as const) {
      expect(restored.getState()[key]).toEqual(snapshot[key]);
    }
  });

  it("keeps defaults when saved preference roots are absent", async () => {
    const store = await hydrate({});
    expect(store.getState().savedScenes).toEqual([]);
    expect(store.getState().filters).toBeDefined();
    expect(store.getState().ui).toBeDefined();
    expect(store.getState().cctv).toBeDefined();
    expect(store.getState().tradeRouteSelection).toBeDefined();
  });

  it("does not hydrate actions, transient state or unknown root fields", async () => {
    const store = await hydrate({ setNewsQuery: null, activePopup: { id: "stale" }, retiredPreference: true });
    expect(typeof store.getState().setNewsQuery).toBe("function");
    expect(store.getState().activePopup).toBeNull();
    expect(store.getState()).not.toHaveProperty("retiredPreference");
    store.getState().setNewsQuery("energy");
    expect(store.getState().news.query).toBe("energy");
  });
});
