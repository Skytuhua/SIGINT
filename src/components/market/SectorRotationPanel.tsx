"use client";

import React from "react";

interface SectorRow {
  sector: string;
  etf: string;
  d1: number;
  w1: number;
  m1: number;
  m3: number;
  ytd: number;
  signal: "LEADING" | "NEUTRAL" | "LAGGING";
}

const ROWS: SectorRow[] = [
  { sector: "Technology",       etf: "XLK",  d1:  1.24, w1:  2.41, m1:  6.80, m3: 12.40, ytd: 18.60, signal: "LEADING" },
  { sector: "Comm Services",    etf: "XLC",  d1:  1.82, w1:  3.10, m1:  5.20, m3:  9.80, ytd: 22.30, signal: "LEADING" },
  { sector: "Financials",       etf: "XLF",  d1:  0.33, w1:  1.20, m1:  3.40, m3:  8.10, ytd: 14.20, signal: "LEADING" },
  { sector: "Industrials",      etf: "XLI",  d1:  0.76, w1:  0.90, m1:  2.10, m3:  5.60, ytd: 10.40, signal: "NEUTRAL" },
  { sector: "Health Care",      etf: "XLV",  d1:  0.51, w1:  0.40, m1:  1.80, m3:  2.30, ytd:  4.10, signal: "NEUTRAL" },
  { sector: "Cons Discretion",  etf: "XLY",  d1: -0.41, w1: -0.80, m1:  0.60, m3:  3.20, ytd:  8.60, signal: "NEUTRAL" },
  { sector: "Cons Staples",     etf: "XLP",  d1:  0.12, w1: -0.30, m1: -0.80, m3: -1.20, ytd:  0.80, signal: "LAGGING" },
  { sector: "Materials",        etf: "XLB",  d1:  0.64, w1:  0.20, m1: -1.40, m3: -2.80, ytd: -1.20, signal: "LAGGING" },
  { sector: "Real Estate",      etf: "XLRE", d1: -0.88, w1: -1.20, m1: -3.40, m3: -5.60, ytd: -6.80, signal: "LAGGING" },
  { sector: "Utilities",        etf: "XLU",  d1: -0.21, w1: -0.60, m1: -2.20, m3: -4.10, ytd: -3.40, signal: "LAGGING" },
  { sector: "Energy",           etf: "XLE",  d1: -2.14, w1: -3.40, m1: -5.10, m3: -8.20, ytd:-12.40, signal: "LAGGING" },
];

function pctStyle(v: number): React.CSSProperties {
  if (v >  4) return { color: "#36b37e", background: "rgba(54,179,126,0.13)" };
  if (v >  0) return { color: "#6ee7b7", background: "rgba(54,179,126,0.06)" };
  if (v > -4) return { color: "#ff8c8c", background: "rgba(255,90,95,0.06)" };
  return       { color: "#ff5a5f", background: "rgba(255,90,95,0.13)" };
}

function fmt(v: number) { return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`; }

interface Props { style?: React.CSSProperties; }

export default function SectorRotationPanel({ style }: Props) {
  return (
    <div className="wv-market-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">Sector Rotation</span>
        <span style={{ fontSize: 9, color: "var(--wv-text-muted)", letterSpacing: "0.04em" }}>
          SPDR ETFs · Multi-Timeframe Performance
        </span>
        <span className="wv-market-panel-badge is-static">STATIC</span>
      </div>
      <div className="wv-market-panel-body-auto" style={{ padding: 0 }}>
        {/* Header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 52px 50px 50px 50px 50px 55px 62px",
          padding: "4px 10px",
          borderBottom: "1px solid var(--wv-line)",
          fontSize: 8.5,
          color: "var(--wv-text-muted)",
          fontWeight: 600,
          letterSpacing: "0.06em",
        }}>
          <span>SECTOR</span>
          <span style={{ textAlign: "right" }}>ETF</span>
          <span style={{ textAlign: "right" }}>1D</span>
          <span style={{ textAlign: "right" }}>1W</span>
          <span style={{ textAlign: "right" }}>1M</span>
          <span style={{ textAlign: "right" }}>3M</span>
          <span style={{ textAlign: "right" }}>YTD</span>
          <span style={{ textAlign: "center" }}>SIGNAL</span>
        </div>

        {ROWS.map((r) => {
          const sigColor = r.signal === "LEADING" ? "#36b37e" : r.signal === "LAGGING" ? "#ff5a5f" : "#b9cde0";
          const sigBg    = r.signal === "LEADING" ? "rgba(54,179,126,0.12)" : r.signal === "LAGGING" ? "rgba(255,90,95,0.10)" : "rgba(185,205,224,0.07)";
          return (
            <div key={r.etf} style={{
              display: "grid",
              gridTemplateColumns: "1fr 52px 50px 50px 50px 50px 55px 62px",
              padding: "4px 10px",
              borderBottom: "1px solid rgba(185,205,224,0.05)",
              fontSize: 10,
              alignItems: "center",
            }}>
              <span style={{ color: "var(--wv-text-bright)", fontWeight: 600 }}>{r.sector}</span>
              <span style={{ textAlign: "right", color: "var(--wv-text-muted)", fontFamily: "monospace" }}>{r.etf}</span>
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
      <div className="wv-market-panel-footer">SPDR Sector ETFs · placeholder data</div>
    </div>
  );
}
