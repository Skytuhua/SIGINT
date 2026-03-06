"use client";

import { useState, useEffect } from "react";
import InteractiveChart from "./InteractiveChart";
import FundamentalsPanel from "./FundamentalsPanel";
import OptionsChainPanel from "./OptionsChainPanel";
import OrderTicketPanel from "./OrderTicketPanel";
import { getFundamentals } from "./shared/staticFundamentals";

// Reference spot prices (used as base for chart generation + order ticket)
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

  const prevClose = basePrice * 0.9972; // tiny synthetic prev close
  const chg = basePrice - prevClose;
  const chgPct = (chg / prevClose) * 100;

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
          <span className="wv-ticker-overlay-price">
            ${basePrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span
            className="wv-ticker-overlay-chg"
            style={{ color: chg >= 0 ? "#36b37e" : "#ff5a5f" }}
          >
            {chg >= 0 ? "▲" : "▼"} {Math.abs(chgPct).toFixed(2)}%
          </span>
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
        {tab === "CHART" && <InteractiveChart sym={sym} basePrice={basePrice} />}
        {tab === "FUNDAMENTALS" && <FundamentalsPanel sym={sym} />}
        {tab === "OPTIONS" && <OptionsChainPanel sym={sym} spotPrice={basePrice} />}
        {tab === "ORDER" && <OrderTicketPanel sym={sym} spotPrice={basePrice} />}
      </div>
    </div>
  );
}
