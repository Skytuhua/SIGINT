import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("../shared/Term", () => ({ default: ({ children }: any) => React.createElement(React.Fragment, null, children) }));
import MarketHeatmapPanel from "../MarketHeatmapPanel";
import { SCREENER_UNIVERSE } from "../shared/screenerData";
let tree: ReactTestRenderer | undefined;
let missing = "";
let requests: string[][];
beforeEach(() => {
  missing = ""; requests = []; vi.useFakeTimers();
  vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const symbols = new URL(url, "http://localhost").searchParams.get("symbols")!.split(","); requests.push(symbols);
    return { ok: true, json: async () => ({ degraded: false, quotes: Object.fromEntries(symbols.slice(0, 50).filter(s => s !== missing).map(symbol => [symbol, { symbol, changePercent: 6.66 }])) }) };
  }));
});
afterEach(() => { if (tree) act(() => tree!.unmount()); tree = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });
async function mount() { await act(async () => { tree = create(React.createElement(MarketHeatmapPanel)); }); }
it("covers every screener stock in batches of at most fifty and uses returned values beyond the first batch", async () => {
  await mount(); expect(requests.length).toBe(4); expect(requests.every(r => r.length <= 50)).toBe(true);
  expect(new Set(requests.flat())).toEqual(new Set(SCREENER_UNIVERSE.map(s => s.sym)));
  expect(tree!.root.findAllByType("title").map(n => n.children.join(""))).toContain("ABT: +6.66%");
});
it("renders missing stock quotes unavailable instead of fixture changes under live", async () => {
  missing = "AAPL"; await mount(); const out = JSON.stringify(tree!.toJSON()); expect(tree!.root.findAllByType("title").map(n => n.children.join(""))).toContain("AAPL: Unavailable"); expect(out).not.toContain('"LIVE"');
});
it("stays well under the route quota with four requests per minute", async () => {
  await mount(); const initial = requests.length; await act(async () => { await vi.advanceTimersByTimeAsync(59_999); }); expect(requests.length).toBe(initial);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); }); expect(requests.length).toBe(initial * 2);
});
it("honors a quotes Retry-After before starting the next batch", async () => {
  const fetcher = vi.fn(async () => ({ ok: false, status: 429, headers: new Headers({ "Retry-After": "120" }) })); vi.stubGlobal("fetch", fetcher);
  await mount(); const initial = fetcher.mock.calls.length; await act(async () => { await vi.advanceTimersByTimeAsync(119_999); }); expect(fetcher).toHaveBeenCalledTimes(initial);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); }); expect(fetcher).toHaveBeenCalledTimes(initial * 2);
});
