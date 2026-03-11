"use client";

import React from "react";
import Term from "./shared/Term";

interface YieldRow {
  tenor: string;
  nominal: number;
  real: number;     // TIPS yield
  breakeven: number;
  chg1d: number;    // change in breakeven
  chg1w: number;
}

const ROWS: YieldRow[] = [
  { tenor: "2Y",  nominal: 4.62, real: 2.14, breakeven: 2.48, chg1d: +0.02, chg1w: -0.04 },
  { tenor: "5Y",  nominal: 4.28, real: 1.86, breakeven: 2.42, chg1d: +0.03, chg1w: -0.02 },
  { tenor: "10Y", nominal: 4.31, real: 1.92, breakeven: 2.39, chg1d: +0.01, chg1w: +0.01 },
  { tenor: "30Y", nominal: 4.49, real: 2.06, breakeven: 2.43, chg1d: -0.01, chg1w: +0.03 },
];

interface TipsEtf { sym: string; name: string; price: string; chg: number; yield_: number; }

const TIPS_ETFS: TipsEtf[] = [
  { sym: "TIP",  name: "iShares TIPS Bond",        price: "$106.42", chg:  0.18, yield_: 2.24 },
  { sym: "SCHP", name: "Schwab US TIPS",            price: "$52.18",  chg:  0.14, yield_: 2.18 },
  { sym: "STIP", name: "iShares 0-5Y TIPS",         price: "$99.84",  chg:  0.06, yield_: 2.31 },
  { sym: "VTIP", name: "Vanguard Short-Term TIPS",  price: "$49.21",  chg:  0.04, yield_: 2.28 },
];

function fmt(v: number, dp = 2) {
  return `${v > 0 ? "+" : ""}${v.toFixed(dp)}`;
}

function bpColor(v: number) {
  return v > 0 ? "#ff8c8c" : v < 0 ? "#6ee7b7" : "var(--si-text-muted)";
}

interface Props { style?: React.CSSProperties; }

export default function BreakevenInflationPanel({ style }: Props) {
  return (
    <div className="si-market-panel" style={style}>
      <div className="si-market-panel-header">
        <span className="si-market-panel-title">Breakeven Inflation & Real Yields</span>
        <span style={{ fontSize: 9, color: "var(--si-text-muted)", letterSpacing: "0.04em" }}>
          <Term id="TIPS">TIPS</Term> · Nominal vs <Term id="REAL_YIELD">Real</Term> · 10Y <Term id="BREAKEVEN">BEI</Term>: 2.39%
        </span>
        <span className="si-market-panel-badge is-reference">REFERENCE</span>
      </div>
      <div className="si-market-panel-body-auto" style={{ padding: 0 }}>

        {/* Section: Breakeven Table */}
        <div style={{
          padding: "3px 10px",
          fontSize: 8.5, fontWeight: 700,
          color: "var(--si-text-muted)",
          letterSpacing: "0.08em",
          background: "rgba(0,0,0,0.2)",
          borderBottom: "1px solid var(--si-line)",
        }}>
          BREAKEVEN INFLATION RATES
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "44px 60px 60px 72px 52px 52px",
          padding: "4px 10px",
          borderBottom: "1px solid var(--si-line)",
          fontSize: 8.5, color: "var(--si-text-muted)", fontWeight: 600, letterSpacing: "0.06em",
        }}>
          <span>TENOR</span>
          <span style={{ textAlign: "right" }}><Term id="YIELD">NOMINAL</Term></span>
          <span style={{ textAlign: "right" }}><Term id="REAL_YIELD">REAL</Term></span>
          <span style={{ textAlign: "right" }}><Term id="BREAKEVEN">BREAKEVEN</Term></span>
          <span style={{ textAlign: "right" }}>1D bp</span>
          <span style={{ textAlign: "right" }}>1W bp</span>
        </div>

        {ROWS.map(r => (
          <div key={r.tenor} style={{
            display: "grid",
            gridTemplateColumns: "44px 60px 60px 72px 52px 52px",
            padding: "5px 10px",
            borderBottom: "1px solid rgba(185,205,224,0.05)",
            fontSize: 10, alignItems: "center",
          }}>
            <span style={{ fontWeight: 700, color: "#89e5ff", fontFamily: "monospace" }}>{r.tenor}</span>
            <span style={{ textAlign: "right", fontFamily: "monospace", color: "var(--si-text-muted)" }}>{r.nominal.toFixed(2)}%</span>
            <span style={{ textAlign: "right", fontFamily: "monospace", color: "#6ee7b7" }}>{r.real.toFixed(2)}%</span>
            <span style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#ffab40" }}>{r.breakeven.toFixed(2)}%</span>
            <span style={{ textAlign: "right", fontFamily: "monospace", color: bpColor(r.chg1d) }}>{fmt(r.chg1d * 100, 0)}bp</span>
            <span style={{ textAlign: "right", fontFamily: "monospace", color: bpColor(r.chg1w) }}>{fmt(r.chg1w * 100, 0)}bp</span>
          </div>
        ))}

        {/* Section: TIPS ETFs */}
        <div style={{
          padding: "3px 10px",
          fontSize: 8.5, fontWeight: 700,
          color: "var(--si-text-muted)",
          letterSpacing: "0.08em",
          background: "rgba(0,0,0,0.2)",
          borderBottom: "1px solid var(--si-line)",
          borderTop: "1px solid var(--si-line)",
          marginTop: 2,
        }}>
          TIPS ETFs
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "44px 1fr 60px 50px 56px",
          padding: "4px 10px",
          borderBottom: "1px solid var(--si-line)",
          fontSize: 8.5, color: "var(--si-text-muted)", fontWeight: 600, letterSpacing: "0.06em",
        }}>
          <span>ETF</span>
          <span>NAME</span>
          <span style={{ textAlign: "right" }}>PRICE</span>
          <span style={{ textAlign: "right" }}>1D%</span>
          <span style={{ textAlign: "right" }}>YIELD</span>
        </div>
        {TIPS_ETFS.map(e => (
          <div key={e.sym} style={{
            display: "grid",
            gridTemplateColumns: "44px 1fr 60px 50px 56px",
            padding: "4px 10px",
            borderBottom: "1px solid rgba(185,205,224,0.05)",
            fontSize: 10, alignItems: "center",
          }}>
            <span style={{ fontWeight: 700, color: "#89e5ff", fontFamily: "monospace" }}>{e.sym}</span>
            <span style={{ color: "var(--si-text-muted)", fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
            <span style={{ textAlign: "right", fontFamily: "monospace", color: "var(--si-text-bright)" }}>{e.price}</span>
            <span style={{ textAlign: "right", fontFamily: "monospace", color: e.chg >= 0 ? "#36b37e" : "#ff5a5f" }}>
              {e.chg >= 0 ? "+" : ""}{e.chg.toFixed(2)}%
            </span>
            <span style={{ textAlign: "right", fontFamily: "monospace", color: "#ffab40" }}>{e.yield_.toFixed(2)}%</span>
          </div>
        ))}
      </div>
      <div className="si-market-panel-footer">US Treasury · FRED · Curated reference data</div>
    </div>
  );
}
