"use client";

import React from "react";

interface FactorRow {
  category: string;
  name: string;
  etf: string;
  d1: number;
  w1: number;
  m1: number;
  m3: number;
  ytd: number;
}

const ROWS: FactorRow[] = [
  /* ── Market Cap ── */
  { category: "CAP",    name: "Large Cap",    etf: "SPY",  d1:  0.41, w1:  1.12, m1:  3.20, m3:  7.40, ytd: 11.80 },
  { category: "CAP",    name: "Mid Cap",      etf: "MDY",  d1:  0.28, w1:  0.80, m1:  1.90, m3:  4.20, ytd:  7.10 },
  { category: "CAP",    name: "Small Cap",    etf: "IWM",  d1: -0.14, w1: -0.40, m1: -0.60, m3: -1.80, ytd: -2.40 },
  /* ── Style ── */
  { category: "STYLE",  name: "Growth",       etf: "IWF",  d1:  0.68, w1:  1.80, m1:  5.10, m3: 10.30, ytd: 16.40 },
  { category: "STYLE",  name: "Value",        etf: "IWD",  d1:  0.14, w1:  0.30, m1:  0.60, m3:  1.80, ytd:  2.90 },
  { category: "STYLE",  name: "Blend",        etf: "IVV",  d1:  0.41, w1:  1.05, m1:  2.80, m3:  6.20, ytd: 10.10 },
  /* ── Smart Beta Factors ── */
  { category: "FACTOR", name: "Momentum",     etf: "MTUM", d1:  0.92, w1:  2.40, m1:  6.80, m3: 14.20, ytd: 22.10 },
  { category: "FACTOR", name: "Quality",      etf: "QUAL", d1:  0.55, w1:  1.30, m1:  3.90, m3:  8.60, ytd: 13.20 },
  { category: "FACTOR", name: "Low Volatility",etf:"USMV", d1: -0.10, w1: -0.20, m1: -0.80, m3: -2.10, ytd: -1.60 },
  { category: "FACTOR", name: "Dividend",     etf: "DVY",  d1: -0.32, w1: -0.60, m1: -1.40, m3: -2.90, ytd: -3.80 },
  /* ── International ── */
  { category: "INTL",   name: "Developed Mkt",etf: "EFA",  d1:  0.22, w1:  0.50, m1:  1.20, m3:  3.40, ytd:  5.60 },
  { category: "INTL",   name: "Emerging Mkt", etf: "EEM",  d1: -0.18, w1: -0.40, m1: -0.90, m3: -2.60, ytd: -3.90 },
];

const CAT_COLORS: Record<string, string> = {
  CAP:    "#89e5ff",
  STYLE:  "#fbbf24",
  FACTOR: "#a78bfa",
  INTL:   "#6ee7b7",
};

function pctStyle(v: number): React.CSSProperties {
  if (v >  4) return { color: "#36b37e", background: "rgba(54,179,126,0.13)" };
  if (v >  0) return { color: "#6ee7b7", background: "rgba(54,179,126,0.06)" };
  if (v > -4) return { color: "#ff8c8c", background: "rgba(255,90,95,0.06)" };
  return       { color: "#ff5a5f", background: "rgba(255,90,95,0.13)" };
}

function fmt(v: number) { return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`; }

let prevCat = "";

interface Props { style?: React.CSSProperties; }

export default function FactorPerformancePanel({ style }: Props) {
  prevCat = "";
  return (
    <div className="wv-market-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">Factor & Style Returns</span>
        <span style={{ fontSize: 9, color: "var(--wv-text-muted)", letterSpacing: "0.04em" }}>
          Cap · Style · Smart Beta · International
        </span>
        <span className="wv-market-panel-badge is-static">STATIC</span>
      </div>
      <div className="wv-market-panel-body-auto" style={{ padding: 0 }}>
        {/* Header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "52px 1fr 50px 50px 50px 50px 50px 55px",
          padding: "4px 10px",
          borderBottom: "1px solid var(--wv-line)",
          fontSize: 8.5,
          color: "var(--wv-text-muted)",
          fontWeight: 600,
          letterSpacing: "0.06em",
        }}>
          <span>CAT</span>
          <span>FACTOR</span>
          <span style={{ textAlign: "right" }}>ETF</span>
          <span style={{ textAlign: "right" }}>1D</span>
          <span style={{ textAlign: "right" }}>1W</span>
          <span style={{ textAlign: "right" }}>1M</span>
          <span style={{ textAlign: "right" }}>3M</span>
          <span style={{ textAlign: "right" }}>YTD</span>
        </div>

        {ROWS.map((r, idx) => {
          const isNewCat = r.category !== prevCat;
          prevCat = r.category;
          const catColor = CAT_COLORS[r.category] ?? "#b9cde0";
          return (
            <React.Fragment key={r.etf}>
              {isNewCat && idx > 0 && (
                <div style={{ borderTop: "1px solid rgba(185,205,224,0.08)" }} />
              )}
              <div style={{
                display: "grid",
                gridTemplateColumns: "52px 1fr 50px 50px 50px 50px 50px 55px",
                padding: "4px 10px",
                borderBottom: "1px solid rgba(185,205,224,0.05)",
                fontSize: 10,
                alignItems: "center",
              }}>
                {isNewCat ? (
                  <span style={{
                    fontSize: 7.5, fontWeight: 700, letterSpacing: "0.08em",
                    color: catColor, background: `${catColor}18`,
                    padding: "1px 4px", borderRadius: 2,
                  }}>
                    {r.category}
                  </span>
                ) : <span />}
                <span style={{ color: "var(--wv-text-bright)", fontWeight: 600 }}>{r.name}</span>
                <span style={{
                  textAlign: "right", fontFamily: "monospace",
                  fontSize: 9, color: "var(--wv-text-muted)",
                }}>
                  {r.etf}
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
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <div className="wv-market-panel-footer">iShares · Vanguard · SPDR ETFs · placeholder data</div>
    </div>
  );
}
