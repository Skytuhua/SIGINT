import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ data: {} as any, isLive: true, feedItems: [] as any[] }));
vi.mock("../../../hooks/useMarketData", () => ({ useMarketData: () => ({ data: state.data, isLive: state.isLive }) }));
vi.mock("../../../hooks/useIsMobile", () => ({ useIsMobile: () => false }));
vi.mock("../../../store", () => ({ useSIGINTStore: (fn: any) => fn({ news: { feedItems: state.feedItems } }) }));
vi.mock("../shared/Term", () => ({ default: ({ children }: any) => React.createElement(React.Fragment, null, children) }));
import CommoditiesBoard from "../CommoditiesBoard";
import FundamentalsPanel from "../FundamentalsPanel";
import GlobalSnapshotPanel from "../GlobalSnapshotPanel";
import CryptoMarketPanel from "../CryptoMarketPanel";
import MarketTickerBar from "../MarketTickerBar";
import DailyLineupModal from "../DailyLineupModal";
import MarketRegimePanel from "../MarketRegimePanel";
import MarketBreadthPanel from "../MarketBreadthPanel";
import CurrencyConverterPanel from "../CurrencyConverterPanel";
import OrderTicketPanel from "../OrderTicketPanel";
import EarningsTracker from "../EarningsTracker";
import StockComparisonPanel from "../StockComparisonPanel";
import { MiniSparkline } from "../shared/MiniSparkline";

let trees: ReactTestRenderer[] = [];
function render(component: React.ReactElement) { let tree!: ReactTestRenderer; act(() => { tree = create(component); }); trees.push(tree); return tree; }
function text(tree: ReactTestRenderer) { return JSON.stringify(tree.toJSON()); }
function click(tree: ReactTestRenderer, label: string) { act(() => tree.root.findAllByType("button").find(b => b.children.join("") === label)!.props.onClick()); }
beforeEach(() => { state.data = { quotes: {}, markets: [], upcoming: [], recent: [] }; state.isLive = true; state.feedItems = []; vi.stubGlobal("document", { addEventListener() {}, removeEventListener() {} }); vi.stubGlobal("localStorage", { setItem() {}, getItem: () => null }); });
afterEach(() => { trees.forEach(t => act(() => t.unmount())); trees = []; vi.unstubAllGlobals(); });

describe("market audit regressions", () => {
  it("uses cents for commodity prices and every range", () => {
    state.data.quotes = { "ZC=F": { price: 450, changePercent: 1, dayLow: 440, dayHigh: 460, fiftyTwoWeekLow: 400, fiftyTwoWeekHigh: 500 } };
    const out = text(render(React.createElement(CommoditiesBoard)));
    expect(out).toContain("450¢"); expect(out).toContain("440¢"); expect(out).toContain("500¢"); expect(out).not.toContain("$450");
  });
  it("renders diluted EPS with per-share precision", () => {
    const tree = render(React.createElement(FundamentalsPanel, { sym: "AAPL" })); click(tree, "INCOME");
    expect(text(tree)).toContain("$5.61"); expect(text(tree)).toContain("$6.57"); expect(text(tree)).toContain("except EPS");
  });
  it("labels the IRX observation as a three-month bill", () => {
    state.data.quotes = { "^IRX": { price: 5.2, changePercent: 0 } };
    const out = text(render(React.createElement(GlobalSnapshotPanel))); expect(out).toContain("3M Treasury Bill"); expect(out).not.toContain("US 2Y Treasury");
  });
  function crypto() { const samples = Array(167).fill(100).concat(200); state.data.markets = [ { id: "ethereum", symbol: "eth", name: "Ethereum", currentPrice: 100, marketCap: 5e11, volume24h: 1e9, priceChangePercent24h: 1, sparkline7d: samples }, { id: "bitcoin", symbol: "btc", name: "Bitcoin", currentPrice: 200, marketCap: 1e12, volume24h: 1e9, priceChangePercent24h: 1, sparkline7d: samples } ]; return render(React.createElement(CryptoMarketPanel)); }
  it("computes crypto seven-day change from the raw endpoints and preserves the last chart value", () => {
    const tree = crypto(); expect(text(tree)).toContain("+100.0%"); expect(tree.root.findAllByType(MiniSparkline)[0].props.prices.at(-1)).toBe(200);
  });
  it("leaves unsupported crypto returns, valuations and historical charts unavailable", () => {
    const tree = crypto(); const row = tree.root.findAll(n => n.props.className === "si-crypto-row")[1];
    expect(row.findAllByType("span")[5].children).toEqual(["—"]); expect(row.findAllByType("span")[8].children).toEqual(["—"]);
    expect(tree.root.findAllByType(MiniSparkline).every(s => s.props.prices.length >= 2)).toBe(true);
    expect(tree.root.findAllByType(MiniSparkline)).toHaveLength(2); expect(text(tree)).toContain("1H, 30D, FDV, ATH and longer histories unavailable");
  });
  it("labels crypto cap and bitcoin share as returned assets and locates bitcoin explicitly", () => {
    const out = text(crypto()); expect(out).toContain("Shown assets total"); expect(out).toContain("BTC share of shown"); expect(out).toContain("66.7"); expect(out).not.toContain("BTC Dom:");
  });
  it("labels the constant desktop ticker as a simulated snapshot with unknown as-of", () => {
    const out = text(render(React.createElement(MarketTickerBar))); expect(out).not.toContain('"LIVE"'); expect(out).toContain("SIMULATED"); expect(out).toContain("as-of unknown");
  });
  it("never substitutes invented news or stamps the fixture briefing with today's date", () => {
    const out = text(render(React.createElement(DailyLineupModal, { onClose() {} })));
    expect(out).not.toContain("drone swarm"); expect(out).toContain("No headlines available"); expect(out).toContain("SIMULATED"); expect(out).toContain("as-of unknown"); expect(out).not.toContain(new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).toUpperCase());
  });
  it("still closes the briefing when saving the disabled preference fails", () => {
    vi.stubGlobal("localStorage", { setItem() { throw new Error("blocked"); } }); const onClose = vi.fn(); const tree = render(React.createElement(DailyLineupModal, { onClose }));
    act(() => tree.root.findByType("input").props.onChange({ target: { checked: true } })); click(tree, "Close Daily Lineup"); expect(onClose).toHaveBeenCalledOnce();
  });
  it("does not manufacture a neutral regime from missing quotes", () => {
    const out = text(render(React.createElement(MarketRegimePanel))); expect(out).toContain("INSUFFICIENT DATA"); expect(out).not.toContain('"Normal"'); expect(out).not.toContain('"Flat"');
  });
  it("does not infer breadth or momentum when SPY is absent", () => {
    state.data.quotes = { RSP: { changePercent: 1 }, "^VIX": { price: 14 }, "^VIX9D": { price: 13 } };
    const out = text(render(React.createElement(MarketRegimePanel))); expect(out).toContain("INSUFFICIENT DATA"); expect(out).not.toContain("Broad Rally"); expect(out).toContain("Unavailable");
    const breadth = text(render(React.createElement(MarketBreadthPanel))); expect(breadth).toContain("Insufficient quote coverage"); expect(breadth).not.toContain("BULLISH BREADTH");
  });
  it("does not convert an absent FX leg or label it live", () => {
    state.data.quotes = { "GBPUSD=X": { price: 1.27 } }; const tree = render(React.createElement(CurrencyConverterPanel));
    expect(text(tree)).toContain("Rate unavailable"); expect(text(tree)).not.toContain('"LIVE"');
    act(() => tree.root.findAllByType("select")[1].props.onChange({ target: { value: "GBP" } })); expect(text(tree)).toContain('"LIVE"'); expect(text(tree)).toContain("787.40");
  });
  it("keeps a buy stop pending until the threshold then fills at simulated spot", () => {
    const tree = render(React.createElement(OrderTicketPanel, { sym: "AAPL", spotPrice: 100 })); click(tree, "STOP");
    act(() => tree.root.findAllByType("input")[1].props.onChange({ target: { value: "110" } })); click(tree, "SEND BUY ORDER");
    expect(text(tree)).toContain("PENDING"); expect(text(tree)).not.toContain('"FILLED"');
    act(() => tree.update(React.createElement(OrderTicketPanel, { sym: "AAPL", spotPrice: 112 })));
    expect(text(tree)).toContain('"FILLED"'); expect(text(tree)).toContain("112.00");
  });
  it("shows upcoming earnings calendar dates alongside their session", () => {
    state.data.upcoming = [{ sym: "AAPL", company: "Apple", time: "AMC", date: "2026-11-01", epsEst: "1.25" }]; expect(text(render(React.createElement(EarningsTracker)))).toContain("2026-11-01");
  });
  it("offers native keyboard-operable comparison suggestions that survive focus moving inside", () => {
    const tree = render(React.createElement(StockComparisonPanel)); const input = tree.root.findByType("input");
    act(() => input.props.onChange({ target: { value: "NVDA" } })); const suggestion = tree.root.findAllByType("button").find(b => b.props["aria-label"] === "Add NVDA")!;
    expect(suggestion).toBeDefined(); act(() => suggestion.props.onClick()); expect(tree.root.findAllByType("span").some(n => n.children.join("") === "1/3 SELECTED")).toBe(true);
  });
});

it("latches a stop-limit trigger, then waits for the limit even if spot recedes below the stop", () => {
  const tree = render(React.createElement(OrderTicketPanel, { sym: "AAPL", spotPrice: 100 })); click(tree, "STOP-LIMIT");
  act(() => { tree.root.findAllByType("input")[1].props.onChange({ target: { value: "110" } }); tree.root.findAllByType("input")[2].props.onChange({ target: { value: "105" } }); }); click(tree, "SEND BUY ORDER");
  act(() => tree.update(React.createElement(OrderTicketPanel, { sym: "AAPL", spotPrice: 112 }))); expect(text(tree)).toContain("PENDING");
  act(() => tree.update(React.createElement(OrderTicketPanel, { sym: "AAPL", spotPrice: 104 }))); expect(text(tree)).toContain('"FILLED"');
  const row = tree.root.findByProps({ className: "si-order-blotter-row" }); expect(row.findAllByType("span").some(n => n.children.join("") === "$104.00")).toBe(true);
});
it("uses the inverse stop condition for sells and ignores unrelated symbols", () => {
  const tree = render(React.createElement(OrderTicketPanel, { sym: "AAPL", spotPrice: 100 })); click(tree, "SELL"); click(tree, "STOP");
  act(() => tree.root.findAllByType("input")[1].props.onChange({ target: { value: "90" } })); click(tree, "SEND SELL ORDER"); expect(text(tree)).toContain("PENDING");
  act(() => tree.update(React.createElement(OrderTicketPanel, { sym: "MSFT", spotPrice: 80 }))); expect(text(tree)).toContain("PENDING");
  act(() => tree.update(React.createElement(OrderTicketPanel, { sym: "AAPL", spotPrice: 89 }))); expect(text(tree)).toContain('"FILLED"');
});
it("rejects invalid stop input and does not replace it with spot", () => {
  const tree = render(React.createElement(OrderTicketPanel, { sym: "AAPL", spotPrice: 100 })); click(tree, "STOP");
  act(() => tree.root.findAllByType("input")[1].props.onChange({ target: { value: "" } }));
  const send = tree.root.findAllByType("button").find(b => b.children.join("") === "SEND BUY ORDER")!; expect(send.props.disabled).toBe(true); act(() => send.props.onClick()); expect(text(tree)).toContain("No orders this session");
});
it("retains a valid neutral zero SPY return when all regime inputs are present", () => {
  state.data.quotes = { RSP: { changePercent: 0 }, SPY: { changePercent: 0 }, "^VIX": { price: 23 }, "^VIX9D": { price: 23 } };
  const out = text(render(React.createElement(MarketRegimePanel))); expect(out).not.toContain("INSUFFICIENT DATA"); expect(out).toContain('"0.00%"'); expect(out).toContain('"LIVE"');
});
it("does not invent crypto history when a successful response has no sparkline", () => {
  state.data.markets = [{ id: "bitcoin", symbol: "btc", name: "Bitcoin", currentPrice: 200, marketCap: 1e12, volume24h: 1e9, priceChangePercent24h: 1 }];
  const tree = render(React.createElement(CryptoMarketPanel)); expect(tree.root.findAllByType(MiniSparkline)).toHaveLength(0);
});
it("keeps suggestions mounted while tabbing within the selector and closes when focus leaves", () => {
  const tree = render(React.createElement(StockComparisonPanel)); act(() => tree.root.findByType("input").props.onChange({ target: { value: "NVDA" } }));
  const holder = tree.root.findAll(n => n.type === "div" && n.props.onBlur)[0];
  act(() => holder.props.onBlur({ currentTarget: { contains: () => true }, relatedTarget: {} })); expect(tree.root.findAllByProps({ "aria-label": "Add NVDA" })).toHaveLength(1);
  act(() => holder.props.onBlur({ currentTarget: { contains: () => false }, relatedTarget: null })); expect(tree.root.findAllByProps({ "aria-label": "Add NVDA" })).toHaveLength(0);
});
