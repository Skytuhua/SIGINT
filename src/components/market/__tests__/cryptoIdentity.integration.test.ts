import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("../../../hooks/useIsMobile", () => ({ useIsMobile: () => false }));
vi.mock("../shared/Term", () => ({ default: ({ children }: any) => React.createElement(React.Fragment, null, children) }));
vi.mock("../shared/TradingViewWidget", () => ({ default: ({ config }: any) => React.createElement("div", { "data-chart-symbol": config.symbol }) }));
vi.mock("../MarketTickerBar", () => ({ default: () => null }));
vi.mock("../DailyLineupModal", () => ({ default: () => null }));
vi.mock("../GlossaryPanel", () => ({ default: () => null }));
// Isolate surrounding layout while preserving the real crypto row -> workspace -> overlay -> ticket path.
vi.mock("../tabs/MarketOverviewTab", async () => {
  const { default: Panel } = await import("../CryptoMarketPanel");
  return { default: ({ onTickerClick }: any) => React.createElement(Panel, { onTickerClick }) };
});
vi.mock("../tabs/MarketEquitiesTab", () => ({ default: ({ onTickerClick }: any) => React.createElement("button", { onClick: () => onTickerClick("BCH") }, "Open BCH stock") }));
vi.mock("../tabs/MarketRatesTab", () => ({ default: () => null }));
vi.mock("../tabs/MarketFxTab", () => ({ default: () => null }));
vi.mock("../tabs/MarketCommoditiesTab", () => ({ default: () => null }));
vi.mock("../tabs/MarketCryptoTab", () => ({ default: () => null }));
vi.mock("../tabs/MarketScreenerTab", () => ({ default: () => null }));
import MarketWorkspace from "../MarketWorkspace";

let tree: ReactTestRenderer | undefined;
let coin: { id: string; symbol: string; price: number };
let quotesRequested: string[];
let cryptoVisible: boolean;
function click(label: string) { act(() => tree!.root.findAllByType("button").find(button => button.children.join("") === label)!.props.onClick()); }
function rows() { return tree!.root.findAllByProps({ className: "si-order-blotter-row" }); }
function status() { return rows()[0].findByProps({ className: "si-order-filled-badge" }).children.join(""); }
async function mount() { await act(async () => { tree = create(React.createElement(MarketWorkspace)); }); }
async function openCoin() { await mount(); await act(async () => tree!.root.findByProps({ className: "si-crypto-row" }).props.onClick()); click("ORDER"); }
beforeEach(() => {
  coin = { id: "bitcoin-cash", symbol: "bch", price: 600 }; quotesRequested = []; cryptoVisible = true;
  vi.useFakeTimers(); vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {}, localStorage: { getItem: () => "true" } });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.startsWith("/api/news/coingecko")) return { ok: true, json: async () => ({ degraded: false, markets: cryptoVisible ? [{ id: coin.id, symbol: coin.symbol, name: coin.id, currentPrice: coin.price, marketCap: 1e9, volume24h: 1e6, priceChangePercent24h: 0 }] : [] }) };
    const symbols = new URL(url, "http://localhost").searchParams.get("symbols")!.split(","); quotesRequested.push(...symbols);
    return { ok: true, json: async () => ({ degraded: false, timestamp: new Date().toISOString(), quotes: Object.fromEntries(symbols.map(symbol => [symbol, { symbol, price: 500, changePercent: 0 }])) }) };
  }));
});
afterEach(() => { if (tree) act(() => tree!.unmount()); tree = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });
it.each([ ["bitcoin-cash", "bch"], ["unmapped-coin-id", "xyz"] ])("keeps the CoinGecko identity for %s through the real workspace selection", async (id, symbol) => {
  coin = { id, symbol, price: 600 }; await openCoin(); click("SEND BUY ORDER");
  expect(quotesRequested).not.toContain(symbol.toUpperCase()); expect(status()).toBe("FILLED");
  expect(rows()[0].findAllByType("span").some(span => span.children.join("") === "$600.00")).toBe(true);
});
it("keeps a normal stock selection on Yahoo even when its display ticker overlaps crypto", async () => {
  await mount(); click("EQUITIES"); await act(async () => click("Open BCH stock")); click("ORDER"); click("SEND BUY ORDER");
  expect(quotesRequested).toContain("BCH"); expect(status()).toBe("FILLED");
  expect(rows()[0].findAllByType("span").some(span => span.children.join("") === "$500.00")).toBe(true);
});
it("pauses a selected crypto order when that exact coin leaves the returned market list", async () => {
  coin.price = 100; await openCoin(); click("STOP");
  act(() => tree!.root.findAllByType("input")[1].props.onChange({ target: { value: "110" } })); click("SEND BUY ORDER"); expect(status()).toBe("PENDING");
  cryptoVisible = false; await act(async () => { await vi.advanceTimersByTimeAsync(120_000); }); expect(status()).toBe("PENDING");
  expect(quotesRequested).not.toContain("BCH");
  expect(tree!.root.findAllByType("button").find(button => button.children.join("") === "SEND BUY ORDER")!.props.disabled).toBe(true);
});
