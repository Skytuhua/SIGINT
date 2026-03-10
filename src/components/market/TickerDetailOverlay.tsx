"use client";

import { useState, useEffect } from "react";
import FundamentalsPanel from "./FundamentalsPanel";
import OptionsChainPanel from "./OptionsChainPanel";
import OrderTicketPanel from "./OrderTicketPanel";
import { getFundamentals } from "./shared/staticFundamentals";
import TradingViewWidget from "./shared/TradingViewWidget";

// Reference spot prices (used as base for options + order ticket)
export const TICKER_PRICES: Record<string, number> = {
  // Equities
  AAPL: 182.44, MSFT: 378.91, NVDA: 721.28, GOOGL: 140.52, META: 502.33,
  AMZN: 178.25, TSLA: 248.42, JPM: 198.17, XOM: 112.38, JNJ: 152.46,
  BRK: 362.10, V: 268.54, UNH: 521.30, WMT: 167.22, PG: 162.88,
  HD: 356.14, MA: 448.72, ORCL: 131.47, CSCO: 52.39, INTC: 28.65,
  AMD: 168.52, CRM: 278.41, NFLX: 628.33, ADBE: 558.21, PYPL: 59.12,
  DIS: 104.76, BA: 189.44, GS: 432.18, MS: 98.32, BAC: 38.72,
  C: 63.21, WFC: 57.44, AXP: 228.61, BLK: 823.45, SCHW: 72.19,
  T: 17.82, VZ: 40.28, TMUS: 162.41, CVX: 156.77, COP: 118.33,
  MRK: 128.47, PFE: 27.19, ABBV: 171.82, LLY: 754.28, TMO: 562.14,
  KO: 61.44, PEP: 172.33, MCD: 298.14, SBUX: 92.56, NKE: 92.17,
  // Indices / ETFs
  SPY: 482.50, QQQ: 408.22, DIA: 385.44, IWM: 196.78, GLD: 188.14,
  // Crypto
  BTC: 67420.0, ETH: 3521.0,
  // Commodities (per unit)
  GC: 2328.0, WTI: 79.42, NG: 2.18,
};

/** Map internal symbols to TradingView symbols */
const TV_SYMBOL_MAP: Record<string, string> = {
  SPY: "AMEX:SPY", QQQ: "NASDAQ:QQQ", DIA: "AMEX:DIA", IWM: "AMEX:IWM",
  GLD: "AMEX:GLD", BTC: "BITSTAMP:BTCUSD", ETH: "BITSTAMP:ETHUSD",
  GC: "COMEX:GC1!", WTI: "NYMEX:CL1!", NG: "NYMEX:NG1!",
  VIX: "TVC:VIX", DXY: "TVC:DXY", TNX: "TVC:US10Y",
  ES: "CME_MINI:ES1!", NQ: "CME_MINI:NQ1!", RTY: "CME_MINI:RTY1!",
  "2Y": "TVC:US02Y", "5Y": "TVC:US05Y", "10Y": "TVC:US10Y", "30Y": "TVC:US30Y",
  EUR: "FX:EURUSD", USD: "FX:USDJPY", GBP: "FX:GBPUSD",
  XAU: "COMEX:GC1!", XAG: "COMEX:SI1!", HG: "COMEX:HG1!",
  BRT: "NYMEX:BB1!", SI: "COMEX:SI1!", PL: "NYMEX:PL1!",
  ZC: "CBOT:ZC1!", ZW: "CBOT:ZW1!", ZS: "CBOT:ZS1!", KC: "NYMEX:KC1!",
  RB: "NYMEX:RB1!",
  "CL=F": "NYMEX:CL1!", "GC=F": "COMEX:GC1!", "SI=F": "COMEX:SI1!",
};

function getTvSymbol(sym: string): string {
  if (TV_SYMBOL_MAP[sym]) return TV_SYMBOL_MAP[sym];
  // Assume NASDAQ for most stocks
  return `NASDAQ:${sym}`;
}

type OverlayTab = "CHART" | "FUNDAMENTALS" | "OPTIONS" | "ORDER";
const OVERLAY_TABS: OverlayTab[] = ["CHART", "FUNDAMENTALS", "OPTIONS", "ORDER"];

interface Props {
  sym: string;
  onClose: () => void;
}

export default function TickerDetailOverlay({ sym, onClose }: Props) {
  const [tab, setTab] = useState<OverlayTab>("CHART");

  // ESC to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const basePrice = TICKER_PRICES[sym] ?? 100;
  const fund = getFundamentals(sym);
  const displayName = fund?.name ?? sym;

  const tvSymbol = getTvSymbol(sym);

  return (
    <div className="wv-ticker-overlay">
      {/* Header */}
      <div className="wv-ticker-overlay-header">
        <button className="wv-ticker-overlay-back" onClick={onClose}>
          ◀ BACK
        </button>
        <div className="wv-ticker-overlay-sym-block">
          <span className="wv-ticker-overlay-sym">{sym}</span>
          <span className="wv-ticker-overlay-name">{displayName}</span>
        </div>
        <button className="wv-ticker-overlay-close" onClick={onClose} title="Close (Esc)">
          ✕
        </button>
      </div>

      {/* Sub-tab bar */}
      <div className="wv-ticker-overlay-tabs">
        {OVERLAY_TABS.map((t) => (
          <button
            key={t}
            className={`wv-ticker-overlay-tab${tab === t ? " is-active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="wv-ticker-overlay-content">
        {tab === "CHART" && (
          <TradingViewWidget
            scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"
            config={{
              symbol: tvSymbol,
              interval: "D",
              timezone: "Etc/UTC",
              style: "1",
              theme: "dark",
              backgroundColor: "rgba(10, 14, 20, 1)",
              gridColor: "rgba(30, 42, 56, 0.5)",
              withdateranges: true,
              hide_side_toolbar: false,
              allow_symbol_change: true,
              save_image: false,
              details: true,
              hotlist: true,
              calendar: false,
              studies: ["STD;Supertrend", "STD;RSI", "STD;MACD"],
              support_host: "https://www.tradingview.com",
            }}
            height="100%"
            width="100%"
            style={{ minHeight: 500 }}
          />
        )}
        {tab === "FUNDAMENTALS" && <FundamentalsPanel sym={sym} />}
        {tab === "OPTIONS" && <OptionsChainPanel sym={sym} spotPrice={basePrice} />}
        {tab === "ORDER" && <OrderTicketPanel sym={sym} spotPrice={basePrice} />}
      </div>
    </div>
  );
}
