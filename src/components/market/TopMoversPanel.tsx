"use client";

import { useState } from "react";
import React from "react";

interface MoverRow {
  sym: string;
  name: string;
  pct: number;
  price: string;
  volMult: string;
  reason: string;
}

const EQUITY_GAINERS: MoverRow[] = [
  { sym: "NVDA", name: "NVIDIA",       pct:  8.43, price: "$847.20",  volMult: "4.2x", reason: "Earnings beat, guidance raised" },
  { sym: "MU",   name: "Micron",       pct:  5.12, price: "$98.34",   volMult: "2.8x", reason: "Memory demand recovery signals" },
  { sym: "AMD",  name: "AMD",          pct:  4.71, price: "$168.55",  volMult: "3.1x", reason: "AI chip orders surge" },
  { sym: "SMCI", name: "Super Micro",  pct:  3.98, price: "$832.10",  volMult: "5.6x", reason: "Server demand upgrade" },
  { sym: "PLTR", name: "Palantir",     pct:  3.44, price: "$24.82",   volMult: "2.2x", reason: "Govt contract win" },
  { sym: "ARM",  name: "ARM Holdings", pct:  2.87, price: "$128.40",  volMult: "1.9x", reason: "AI compute exposure" },
  { sym: "MRVL", name: "Marvell Tech", pct:  2.51, price: "$74.30",   volMult: "1.7x", reason: "Custom ASIC pipeline" },
  { sym: "ANET", name: "Arista Nets",  pct:  2.18, price: "$284.10",  volMult: "1.4x", reason: "Data center buildout" },
];

const EQUITY_LOSERS: MoverRow[] = [
  { sym: "CL=F", name: "Crude Oil",    pct: -3.18, price: "$79.85",   volMult: "2.1x", reason: "EIA inventory build surprise" },
  { sym: "XOM",  name: "ExxonMobil",   pct: -2.44, price: "$112.20",  volMult: "1.8x", reason: "Oil price decline" },
  { sym: "CVX",  name: "Chevron",      pct: -2.11, price: "$155.40",  volMult: "1.6x", reason: "Permian output cut" },
  { sym: "SLB",  name: "SLB",          pct: -1.88, price: "$46.70",   volMult: "1.4x", reason: "Capex concerns" },
  { sym: "HAL",  name: "Halliburton",  pct: -1.72, price: "$33.50",   volMult: "1.3x", reason: "Activity slowdown" },
  { sym: "MPC",  name: "Marathon Pet", pct: -1.58, price: "$171.20",  volMult: "1.2x", reason: "Refining margin squeeze" },
  { sym: "DVN",  name: "Devon Energy", pct: -1.44, price: "$42.80",   volMult: "1.1x", reason: "Nat gas price weakness" },
  { sym: "APA",  name: "APA Corp",     pct: -1.31, price: "$21.90",   volMult: "1.0x", reason: "Hedge ratio unwind" },
];

const FX_GAINERS: MoverRow[] = [
  { sym: "JPY",  name: "Japanese Yen", pct:  0.58, price: "148.92",   volMult: "—", reason: "BOJ hawkish signal" },
  { sym: "CHF",  name: "Swiss Franc",  pct:  0.41, price: "0.8842",   volMult: "—", reason: "Risk-off safe haven flow" },
  { sym: "GBP",  name: "Pound",        pct:  0.22, price: "1.2648",   volMult: "—", reason: "UK services PMI beat" },
  { sym: "AUD",  name: "Aussie Dollar",pct:  0.14, price: "0.6521",   volMult: "—", reason: "China stimulus optimism" },
];

const FX_LOSERS: MoverRow[] = [
  { sym: "TRY",  name: "Turkish Lira", pct: -1.24, price: "32.14",    volMult: "—", reason: "CBRT rate hold surprise" },
  { sym: "BRL",  name: "Brazilian R$", pct: -0.88, price: "4.98",     volMult: "—", reason: "Fiscal concerns" },
  { sym: "ZAR",  name: "S African Rand",pct:-0.62, price: "18.92",    volMult: "—", reason: "Commodity drag" },
  { sym: "MXN",  name: "Mexican Peso", pct: -0.44, price: "17.14",    volMult: "—", reason: "Nearshoring uncertainty" },
];

type TabType = "GAINERS" | "LOSERS";

interface Props {
  filter?: "equity" | "fx" | "all";
  style?: React.CSSProperties;
  onTickerClick?: (sym: string) => void;
}

export default function TopMoversPanel({ filter = "equity", style, onTickerClick }: Props) {
  const [tab, setTab] = useState<TabType>("GAINERS");
  const gainers = filter === "fx" ? FX_GAINERS : EQUITY_GAINERS;
  const losers  = filter === "fx" ? FX_LOSERS  : EQUITY_LOSERS;
  const rows = tab === "GAINERS" ? gainers : losers;

  return (
    <div className="wv-market-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">Top Movers</span>
        <div className="wv-market-movers-tabs">
          {(["GAINERS", "LOSERS"] as TabType[]).map((t) => (
            <button
              key={t}
              className={`wv-market-movers-tab${tab === t ? " is-active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="wv-market-panel-body" style={{ padding: 0 }}>
        <div className="wv-market-movers-col-header">
          <span>SYM</span>
          <span>NAME</span>
          <span style={{ textAlign: "right" }}>CHG%</span>
          {filter !== "fx" && <span style={{ textAlign: "right" }}>VOL</span>}
        </div>
        {rows.map((row) => {
          const chgClass = row.pct > 0 ? "is-up" : "is-down";
          const sign = row.pct > 0 ? "+" : "";
          return (
            <div key={row.sym} className="wv-market-movers-row" title={row.reason} style={{ cursor: onTickerClick ? "pointer" : "default" }} onClick={() => onTickerClick?.(row.sym)}>
              <span className="wv-market-movers-sym">{row.sym}</span>
              <span className="wv-market-movers-name" title={row.name}>{row.name}</span>
              <span className={`wv-market-movers-pct ${chgClass}`}>{sign}{row.pct.toFixed(2)}%</span>
              {filter !== "fx" && <span className="wv-market-movers-vol">{row.volMult}</span>}
            </div>
          );
        })}
      </div>
      <div className="wv-market-panel-footer">placeholder data · hover for context</div>
    </div>
  );
}
