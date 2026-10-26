import React, { useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("../../../hooks/useIsMobile", () => ({ useIsMobile: () => false }));
vi.mock("../shared/Term", () => ({ default: ({ children }: any) => React.createElement(React.Fragment, null, children) }));
vi.mock("../shared/TradingViewWidget", () => ({ default: ({ config }: any) => React.createElement("div", { "data-chart-symbol": config.symbol }) }));
import TickerDetailOverlay from "../TickerDetailOverlay";
import OrderTicketPanel from "../OrderTicketPanel";
import GlobalSnapshotPanel from "../GlobalSnapshotPanel";
import type { MarketAssetContext } from "../shared/assetIdentity";

let tree: ReactTestRenderer | undefined;
let observations: Record<string, number>;
let degraded: boolean;
let requestedSymbols: string[][];
const node = React.createElement;
function click(label: string) { act(() => tree!.root.findAllByType("button").find(button => button.children.join("") === label)!.props.onClick()); }
async function open(sym: string, assetContext?: MarketAssetContext) { await act(async () => { tree = create(node(TickerDetailOverlay, { sym, assetContext, onClose() {} })); }); click("ORDER"); }
function blotter() { return tree!.root.findAllByProps({ className: "si-order-blotter-row" }); }
function status() { return blotter()[0].findByProps({ className: "si-order-filled-badge" }).children.join(""); }
function changeInput(index: number, value: string) { act(() => tree!.root.findAllByType("input")[index].props.onChange({ target: { value } })); }
async function poll() { await act(async () => { await vi.advanceTimersByTimeAsync(60_000); }); }

beforeEach(() => {
  observations = { AAPL: 100, "BTC-USD": 70_000, "^IRX": 4.2 }; degraded = false; requestedSymbols = [];
  vi.useFakeTimers(); vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.startsWith("/api/news/coingecko")) return { ok: true, json: async () => ({ degraded, markets: [{ id: "bitcoin", symbol: "btc", currentPrice: observations["BTC-USD"] }] }) };
    const symbols = new URL(url, "http://localhost").searchParams.get("symbols")!.split(","); requestedSymbols.push(symbols);
    return { ok: true, json: async () => ({ quotes: Object.fromEntries(symbols.filter(symbol => observations[symbol] != null).map(symbol => [symbol, { symbol, price: observations[symbol], changePercent: 0 }])), degraded, timestamp: new Date().toISOString() }) };
  }));
});
afterEach(() => { if (tree) act(() => tree!.unmount()); tree = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });

it("advances a pending buy stop from the real overlay quote poll", async () => {
  await open("AAPL"); expect(requestedSymbols).toContainEqual(["AAPL"]);
  click("STOP"); changeInput(1, "110"); click("SEND BUY ORDER"); expect(status()).toBe("PENDING");
  observations.AAPL = 112; await poll(); expect(status()).toBe("FILLED");
  expect(blotter()[0].findAllByType("span").some(span => span.children.join("") === "$112.00")).toBe(true);
});
it("preserves and evaluates a pending stop-limit while another overlay tab is active", async () => {
  await open("AAPL"); click("STOP-LIMIT"); changeInput(1, "110"); changeInput(2, "105"); click("SEND BUY ORDER"); expect(status()).toBe("PENDING");
  const originalTicket = tree!.root.findByType(OrderTicketPanel); click("CHART");
  expect(tree!.root.findByType(OrderTicketPanel)).toBe(originalTicket);
  observations.AAPL = 112; await poll(); observations.AAPL = 104; await poll(); click("ORDER");
  expect(blotter()).toHaveLength(1); expect(status()).toBe("FILLED");
});
it("uses the actual crypto quote identity rather than a similarly named stock", async () => {
  await open("BTC", { kind: "crypto", coinId: "bitcoin" }); expect(requestedSymbols).toHaveLength(0);
  click("SEND BUY ORDER"); expect(status()).toBe("FILLED");
  expect(blotter()[0].findAllByType("span").some(span => span.children.join("") === "$70000.00")).toBe(true);
});
it("does not use a generic100 execution price for an unknown symbol", async () => {
  await open("UNKNOWN_TICKER"); const send = tree!.root.findAllByType("button").find(button => button.children.join("") === "SEND BUY ORDER")!;
  expect(send.props.disabled).toBe(true); act(() => send.props.onClick()); expect(blotter()).toHaveLength(0);
  expect(JSON.stringify(tree!.toJSON())).toContain("Spot unavailable");
});
it("clears the simulated ticket when the selected instrument changes and waits for its quote", async () => {
  await open("AAPL"); click("STOP"); changeInput(1, "110"); click("SEND BUY ORDER");
  await act(async () => { tree!.update(node(TickerDetailOverlay, { sym: "MSFT", onClose() {} })); });
  expect(blotter()).toHaveLength(0);
  expect(tree!.root.findAllByType("button").find(button => button.children.join("") === "SEND BUY ORDER")!.props.disabled).toBe(true);
});
it("does not execute against degraded last-known quotes", async () => {
  await open("AAPL"); click("STOP"); changeInput(1, "110"); click("SEND BUY ORDER");
  observations.AAPL = 112; degraded = true; await poll(); expect(status()).toBe("PENDING");
  degraded = false; await poll(); expect(status()).toBe("FILLED");
});
it("carries a real3M snapshot click into the explicitly qualified three-month Treasury chart", async () => {
  function SnapshotWithDetail() {
    const [selected, select] = useState<string | null>(null);
    return node(React.Fragment, null, node(GlobalSnapshotPanel, { onTickerClick: select }), selected && node(TickerDetailOverlay, { sym: selected, onClose() {} }));
  }
  await act(async () => { tree = create(node(SnapshotWithDetail)); });
  const row = tree!.root.findAllByProps({ className: "si-market-snap-row" }).find(row => row.findAllByProps({ title: "US 3M Treasury Bill" }).length)!;
  await act(async () => row.props.onClick());
  expect(tree!.root.findByType(TickerDetailOverlay).props.sym).toBe("3M");
  expect(tree!.root.findByProps({ "data-chart-symbol": "TVC:US03MY" })).toBeDefined();
});
