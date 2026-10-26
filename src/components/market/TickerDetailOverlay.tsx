"use client";

import { useState, useEffect } from "react";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useMarketData } from "../../hooks/useMarketData";
import type { QuotesResponse } from "../../lib/server/news/providers/marketTypes";
import FundamentalsPanel from "./FundamentalsPanel";
import OptionsChainPanel from "./OptionsChainPanel";
import OrderTicketPanel from "./OrderTicketPanel";
import { getFundamentals } from "./shared/staticFundamentals";
import TradingViewWidget from "./shared/TradingViewWidget";
import type { MarketAssetContext } from "./shared/assetIdentity";

// Undated reference prices retained only for the explicitly simulated options model.
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
  // Commodities (per unit)
  GC: 2328.0, WTI: 79.42, NG: 2.18,
};

/** Map internal symbols to TradingView symbols */
const TV_SYMBOL_MAP: Record<string, string> = {
  SPY: "AMEX:SPY", QQQ: "NASDAQ:QQQ", DIA: "AMEX:DIA", IWM: "AMEX:IWM",
  GLD: "AMEX:GLD",
  GC: "COMEX:GC1!", WTI: "NYMEX:CL1!", NG: "NYMEX:NG1!",
  VIX: "TVC:VIX", DXY: "TVC:DXY", TNX: "TVC:US10Y",
  ES: "CME_MINI:ES1!", NQ: "CME_MINI:NQ1!", RTY: "CME_MINI:RTY1!",
  // US03MY is the 3-month yield: everget/tradingview-pinescript-indicators
  // 8385cc421888bbf31f36407195796bc0eabafb19/statistics/us_treasury_yields.pine ("3M, %").
  "3M": "TVC:US03MY", "2Y": "TVC:US02Y", "5Y": "TVC:US05Y", "10Y": "TVC:US10Y", "30Y": "TVC:US30Y",
  EUR: "FX:EURUSD", USD: "FX:USDJPY", GBP: "FX:GBPUSD",
  XAU: "COMEX:GC1!", XAG: "COMEX:SI1!", HG: "COMEX:HG1!",
  BRT: "NYMEX:BB1!", SI: "COMEX:SI1!", PL: "NYMEX:PL1!",
  ZC: "CBOT:ZC1!", ZW: "CBOT:ZW1!", ZS: "CBOT:ZS1!", KC: "NYMEX:KC1!",
  RB: "NYMEX:RB1!",
  "CL=F": "NYMEX:CL1!", "GC=F": "COMEX:GC1!", "SI=F": "COMEX:SI1!",
  // Sector ETFs (AMEX)
  XLK: "AMEX:XLK", XLC: "AMEX:XLC", XLF: "AMEX:XLF", XLI: "AMEX:XLI",
  XLV: "AMEX:XLV", XLY: "AMEX:XLY", XLP: "AMEX:XLP", XLB: "AMEX:XLB",
  XLRE: "AMEX:XLRE", XLU: "AMEX:XLU", XLE: "AMEX:XLE",
  // Other common ETFs (AMEX)
  SLV: "AMEX:SLV", TLT: "AMEX:TLT", HYG: "AMEX:HYG", EEM: "AMEX:EEM",
  EFA: "AMEX:EFA", VTI: "AMEX:VTI", VOO: "AMEX:VOO", AGG: "AMEX:AGG",
};

/** Internal display aliases must not be sent as similarly named Yahoo equities. */
const QUOTE_SYMBOL_MAP: Record<string, string> = {
  BRK: "BRK-B", ES: "ES=F", NQ: "NQ=F", RTY: "RTY=F", DAX: "^GDAXI", N225: "^N225",
  VIX: "^VIX", DXY: "DX-Y.NYB", TNX: "^TNX", "3M": "^IRX", "5Y": "^FVX", "10Y": "^TNX", "30Y": "^TYX",
  EUR: "EURUSD=X", USD: "JPY=X", GBP: "GBPUSD=X",
  XAU: "GC=F", XAG: "SI=F", GC: "GC=F", WTI: "CL=F", NG: "NG=F", HG: "HG=F",
  BRT: "BZ=F", SI: "SI=F", PL: "PL=F", ZC: "ZC=F", ZW: "ZW=F", ZS: "ZS=F", KC: "KC=F", RB: "RB=F",
};
interface SpotResponse extends Partial<QuotesResponse> {
  markets?: { id: string; symbol: string; currentPrice: number }[];
}
const EMPTY_QUOTES: SpotResponse = { quotes: {}, markets: [], degraded: true, timestamp: "" };
const CRYPTO_CHARTS: Record<string, string> = { bitcoin: "BITSTAMP:BTCUSD", ethereum: "BITSTAMP:ETHUSD" };
const CRYPTO_REFERENCE_PRICES: Record<string, number> = { bitcoin: 67420, ethereum: 3521 };

function getTvSymbol(sym: string): string {
  if (TV_SYMBOL_MAP[sym]) return TV_SYMBOL_MAP[sym];
  // Let TradingView resolve the exchange automatically
  return sym;
}

type OverlayTab = "CHART" | "FUNDAMENTALS" | "OPTIONS" | "ORDER";
const OVERLAY_TABS: OverlayTab[] = ["CHART", "FUNDAMENTALS", "OPTIONS", "ORDER"];

interface Props {
  sym: string;
  assetContext?: MarketAssetContext;
  onClose: () => void;
}

export default function TickerDetailOverlay({ sym, assetContext, onClose }: Props) {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<OverlayTab>("CHART");

  // ESC to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isCrypto = assetContext?.kind === "crypto";
  const quoteSymbol = QUOTE_SYMBOL_MAP[sym] ?? sym;
  const { data, isLive } = useMarketData<SpotResponse>(
    isCrypto ? "/api/news/coingecko?mode=markets&limit=15" : `/api/market/quotes?symbols=${encodeURIComponent(quoteSymbol)}`,
    isCrypto ? 120_000 : 60_000, EMPTY_QUOTES,
  );
  const cryptoQuote = isCrypto ? data.markets?.find(coin => coin.id === assetContext.coinId && coin.symbol.toUpperCase() === sym.toUpperCase()) : undefined;
  const quote = data.quotes?.[quoteSymbol];
  const observedPrice = isCrypto ? cryptoQuote?.currentPrice : quote?.symbol === quoteSymbol ? quote.price : undefined;
  const spotPrice = isLive && data.degraded !== true && observedPrice != null && Number.isFinite(observedPrice) && observedPrice > 0
    ? observedPrice : null;
  const spotSource = isCrypto ? `CoinGecko (${assetContext.coinId}) · 2min refresh` : `Yahoo Finance (${quoteSymbol}) · 60s refresh`;
  const assetKey = isCrypto ? `crypto:${assetContext.coinId}` : `security:${sym}`;
  const referencePrice = isCrypto ? CRYPTO_REFERENCE_PRICES[assetContext.coinId] : TICKER_PRICES[sym];
  const optionBasePrice = spotPrice ?? referencePrice;
  const fund = isCrypto ? null : getFundamentals(sym);
  const displayName = isCrypto ? assetContext.coinId : fund?.name ?? sym;

  const tvSymbol = isCrypto ? CRYPTO_CHARTS[assetContext.coinId] : getTvSymbol(sym);

  return (
    <div className="si-ticker-overlay">
      {/* Header */}
      <div className="si-ticker-overlay-header">
        <button className="si-ticker-overlay-back" onClick={onClose}>
          ◀ BACK
        </button>
        <div className="si-ticker-overlay-sym-block">
          <span className="si-ticker-overlay-sym">{sym}</span>
          <span className="si-ticker-overlay-name">{displayName}</span>
        </div>
        <button className="si-ticker-overlay-close" onClick={onClose} title="Close (Esc)">
          ✕
        </button>
      </div>

      {/* Sub-tab bar */}
      <div className="si-ticker-overlay-tabs">
        {OVERLAY_TABS.map((t) => (
          <button
            key={t}
            className={`si-ticker-overlay-tab${tab === t ? " is-active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="si-ticker-overlay-content">
        {tab === "CHART" && (tvSymbol ? (
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
              hide_side_toolbar: isMobile,
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
        ) : <div style={{ padding: 14 }}>Chart unavailable for this crypto asset</div>)}
        {tab === "FUNDAMENTALS" && (isCrypto ? <div style={{ padding: 14 }}>Company fundamentals unavailable for this crypto asset</div> : <FundamentalsPanel sym={sym} />)}
        {tab === "OPTIONS" && (optionBasePrice != null ? (
          <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <div role="note" style={{ padding: "4px 14px", fontSize: 10, color: "var(--si-text-muted)" }}>
              Simulated options model · {spotPrice == null ? "reference spot, as-of unknown" : `spot via ${spotSource}`}
            </div>
            <div style={{ flex: 1, minHeight: 0 }}><OptionsChainPanel sym={sym} spotPrice={optionBasePrice} /></div>
          </div>
        ) : <div style={{ padding: 14 }}>Options model unavailable · no spot price</div>)}
        {/* Keep pending orders evaluating while the user reads another detail tab. */}
        <div hidden={tab !== "ORDER"} style={{ height: "100%" }}>
          <OrderTicketPanel key={assetKey} sym={sym} spotPrice={spotPrice} spotSource={spotSource} />
        </div>
      </div>
    </div>
  );
}
