"use client";

import React from "react";
import { useMarketData } from "../../hooks/useMarketData";
import type { QuotesResponse } from "../../lib/server/news/providers/marketTypes";
import { SCREENER_UNIVERSE } from "./shared/screenerData";

interface SectorDef {
  sector: string;
  etf: string;
  w1: number;
  m1: number;
  m3: number;
  ytd: number;
}

// Static baseline for longer timeframes; 1D is fetched live
const SECTOR_DEFS: SectorDef[] = [
  { sector: "Technology",       etf: "XLK",  w1:  2.41, m1:  6.80, m3: 12.40, ytd: 18.60 },
  { sector: "Comm Services",    etf: "XLC",  w1:  3.10, m1:  5.20, m3:  9.80, ytd: 22.30 },
  { sector: "Financials",       etf: "XLF",  w1:  1.20, m1:  3.40, m3:  8.10, ytd: 14.20 },
  { sector: "Industrials",      etf: "XLI",  w1:  0.90, m1:  2.10, m3:  5.60, ytd: 10.40 },
  { sector: "Health Care",      etf: "XLV",  w1:  0.40, m1:  1.80, m3:  2.30, ytd:  4.10 },
  { sector: "Cons Discretion",  etf: "XLY",  w1: -0.80, m1:  0.60, m3:  3.20, ytd:  8.60 },
  { sector: "Cons Staples",     etf: "XLP",  w1: -0.30, m1: -0.80, m3: -1.20, ytd:  0.80 },
  { sector: "Materials",        etf: "XLB",  w1:  0.20, m1: -1.40, m3: -2.80, ytd: -1.20 },
  { sector: "Real Estate",      etf: "XLRE", w1: -1.20, m1: -3.40, m3: -5.60, ytd: -6.80 },
  { sector: "Utilities",        etf: "XLU",  w1: -0.60, m1: -2.20, m3: -4.10, ytd: -3.40 },
  { sector: "Energy",           etf: "XLE",  w1: -3.40, m1: -5.10, m3: -8.20, ytd:-12.40 },
];

// Map panel sector names → screener sector names
const SECTOR_MAP: Record<string, string> = {
  "Technology": "Technology",
  "Comm Services": "Comm Services",
  "Financials": "Financials",
  "Industrials": "Industrials",
  "Health Care": "Healthcare",
  "Cons Discretion": "Consumer Cyclical",
  "Cons Staples": "Consumer Staples",
  "Materials": "Materials",
  "Real Estate": "Real Estate",
  "Utilities": "Utilities",
  "Energy": "Energy",
};

// Precompute sector fundamentals from screener universe
const SECTOR_FUNDAMENTALS: Record<string, { avgPE: number; avgBeta: number; avgDiv: number; mktCapB: number; avgROE: number; avgNetMgn: number }> = {};
for (const def of SECTOR_DEFS) {
  const screenerSector = SECTOR_MAP[def.sector];
  const stocks = SCREENER_UNIVERSE.filter((s) => s.sector === screenerSector);
  const withPE = stocks.filter((s) => s.pe !== null && s.pe > 0);
  SECTOR_FUNDAMENTALS[def.etf] = {
    avgPE: withPE.length ? withPE.reduce((a, s) => a + (s.pe ?? 0), 0) / withPE.length : 0,
    avgBeta: stocks.length ? stocks.reduce((a, s) => a + s.beta, 0) / stocks.length : 0,
    avgDiv: stocks.length ? stocks.reduce((a, s) => a + s.divYield, 0) / stocks.length : 0,
    mktCapB: stocks.reduce((a, s) => a + s.marketCapB, 0),
    avgROE: stocks.length ? stocks.reduce((a, s) => a + s.roe, 0) / stocks.length : 0,
    avgNetMgn: stocks.length ? stocks.reduce((a, s) => a + s.netMarginPct, 0) / stocks.length : 0,
  };
}

const GRID_COLS = "120px 52px 62px 56px 48px 52px 48px 52px 1fr 1fr 1fr 1fr 55px 62px";

const SYMBOLS = SECTOR_DEFS.map((s) => s.etf).join(",");
const ENDPOINT = `/api/market/quotes?symbols=${SYMBOLS}`;
const EMPTY: QuotesResponse = { quotes: {}, degraded: true, timestamp: "" };

function pctStyle(v: number): React.CSSProperties {
  if (v >  4) return { color: "#36b37e", background: "rgba(54,179,126,0.13)" };
  if (v >  0) return { color: "#6ee7b7", background: "rgba(54,179,126,0.06)" };
  if (v > -4) return { color: "#ff8c8c", background: "rgba(255,90,95,0.06)" };
  return       { color: "#ff5a5f", background: "rgba(255,90,95,0.13)" };
}

function fmt(v: number) { return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`; }

function deriveSignal(d1: number, m1: number): "LEADING" | "NEUTRAL" | "LAGGING" {
  if (d1 > 0.5 && m1 > 2) return "LEADING";
  if (d1 < -0.5 && m1 < -2) return "LAGGING";
  return "NEUTRAL";
}

interface Props {
  style?: React.CSSProperties;
  onTickerClick?: (sym: string) => void;
}

export default function SectorRotationPanel({ style, onTickerClick }: Props) {
  const { data, isLive } = useMarketData<QuotesResponse>(ENDPOINT, 120_000, EMPTY);
  const quotes = data.quotes ?? {};

  const rows = SECTOR_DEFS.map((def) => {
    const q = quotes[def.etf];
    const d1 = q?.changePercent ?? 0;
    return {
      ...def,
      d1,
      signal: deriveSignal(d1, def.m1),
    };
  });

  return (
    <div className="wv-market-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">Sector Rotation</span>
        <span style={{ fontSize: 9, color: "var(--wv-text-muted)", letterSpacing: "0.04em" }}>
          SPDR ETFs · Multi-Timeframe Performance
        </span>
        <span className={`wv-market-panel-badge ${isLive ? "is-live" : "is-static"}`}>
          {isLive ? "LIVE" : "STATIC"}
        </span>
      </div>
      <div className="wv-market-panel-body-auto" style={{ padding: 0 }}>
        {/* Header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: GRID_COLS,
          padding: "4px 10px",
          borderBottom: "1px solid var(--wv-line)",
          fontSize: 8.5,
          color: "var(--wv-text-muted)",
          fontWeight: 600,
          letterSpacing: "0.06em",
        }}>
          <span>SECTOR</span>
          <span style={{ textAlign: "right" }}>ETF</span>
          <span style={{ textAlign: "right" }}>MKT CAP</span>
          <span style={{ textAlign: "right" }}>AVG P/E</span>
          <span style={{ textAlign: "right" }}>AVG β</span>
          <span style={{ textAlign: "right" }}>ROE</span>
          <span style={{ textAlign: "right" }}>NET MGN</span>
          <span style={{ textAlign: "right" }}>DIV%</span>
          <span style={{ textAlign: "right" }}>1D</span>
          <span style={{ textAlign: "right" }}>1W</span>
          <span style={{ textAlign: "right" }}>1M</span>
          <span style={{ textAlign: "right" }}>3M</span>
          <span style={{ textAlign: "right" }}>YTD</span>
          <span style={{ textAlign: "center" }}>SIGNAL</span>
        </div>

        {rows.map((r) => {
          const sigColor = r.signal === "LEADING" ? "#36b37e" : r.signal === "LAGGING" ? "#ff5a5f" : "#b9cde0";
          const sigBg    = r.signal === "LEADING" ? "rgba(54,179,126,0.12)" : r.signal === "LAGGING" ? "rgba(255,90,95,0.10)" : "rgba(185,205,224,0.07)";
          const fund = SECTOR_FUNDAMENTALS[r.etf];
          return (
            <div
              key={r.etf}
              style={{
                display: "grid",
                gridTemplateColumns: GRID_COLS,
                padding: "4px 10px",
                borderBottom: "1px solid rgba(185,205,224,0.05)",
                fontSize: 10,
                alignItems: "center",
                cursor: onTickerClick ? "pointer" : "default",
              }}
              onClick={() => onTickerClick?.(r.etf)}
            >
              <span style={{ color: "var(--wv-text-bright)", fontWeight: 600 }}>{r.sector}</span>
              <span style={{ textAlign: "right", color: "var(--wv-text-muted)", fontFamily: "monospace" }}>{r.etf}</span>
              <span style={{ textAlign: "right", fontFamily: "monospace", fontSize: 9, color: "var(--wv-text-muted)" }}>
                {fund?.mktCapB ? `$${(fund.mktCapB / 1000).toFixed(1)}T` : "—"}
              </span>
              <span style={{ textAlign: "right", fontFamily: "monospace", fontSize: 9, color: "var(--wv-text-muted)" }}>
                {fund?.avgPE ? fund.avgPE.toFixed(1) : "—"}
              </span>
              <span style={{ textAlign: "right", fontFamily: "monospace", fontSize: 9, color: fund?.avgBeta > 1.2 ? "#ffab40" : "var(--wv-text-muted)" }}>
                {fund?.avgBeta ? fund.avgBeta.toFixed(2) : "—"}
              </span>
              <span style={{ textAlign: "right", fontFamily: "monospace", fontSize: 9, color: fund?.avgROE > 20 ? "#36b37e" : "var(--wv-text-muted)" }}>
                {fund?.avgROE ? `${fund.avgROE.toFixed(1)}%` : "—"}
              </span>
              <span style={{ textAlign: "right", fontFamily: "monospace", fontSize: 9, color: fund?.avgNetMgn > 20 ? "#36b37e" : fund?.avgNetMgn < 0 ? "#ff5a5f" : "var(--wv-text-muted)" }}>
                {fund?.avgNetMgn != null ? `${fund.avgNetMgn.toFixed(1)}%` : "—"}
              </span>
              <span style={{ textAlign: "right", fontFamily: "monospace", fontSize: 9, color: fund?.avgDiv > 1.5 ? "#36b37e" : "var(--wv-text-muted)" }}>
                {fund?.avgDiv ? `${fund.avgDiv.toFixed(2)}%` : "—"}
              </span>
              {([r.d1, r.w1, r.m1, r.m3, r.ytd] as number[]).map((v, i) => (
                <span key={i} style={{
                  textAlign: "right",
                  fontFamily: "monospace",
                  fontSize: 9.5,
                  padding: "1px 4px",
                  borderRadius: 2,
                  ...pctStyle(v),
                }}>
                  {fmt(v)}
                </span>
              ))}
              <span style={{
                textAlign: "center",
                fontSize: 8,
                fontWeight: 700,
                letterSpacing: "0.05em",
                color: sigColor,
                background: sigBg,
                padding: "1px 5px",
                borderRadius: 2,
                margin: "0 4px",
              }}>
                {r.signal}
              </span>
            </div>
          );
        })}
      </div>
      <div className="wv-market-panel-footer">
        {isLive ? "SPDR Sector ETFs · Yahoo Finance · 2min refresh" : "SPDR Sector ETFs · static data"}
      </div>
    </div>
  );
}
