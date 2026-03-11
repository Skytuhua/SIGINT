"use client";

import React from "react";
import Term from "./shared/Term";

interface ShortRow {
  sym: string;
  name: string;
  shortPct: number;
  dtc: number;       // days to cover
  borrowRate: number; // % p.a.
  chg1d: number;
  chg1w: number;
  squeezeScore: number; // 0-100
  signal: "HIGH" | "MODERATE" | "LOW";
}

const ROWS: ShortRow[] = [
  { sym: "GME",   name: "GameStop",         shortPct: 24.8, dtc: 4.2, borrowRate: 12.4, chg1d:  3.20, chg1w:  8.40, squeezeScore: 88, signal: "HIGH" },
  { sym: "AMC",   name: "AMC Entmt",         shortPct: 22.1, dtc: 3.8, borrowRate: 18.6, chg1d:  1.80, chg1w:  4.20, squeezeScore: 82, signal: "HIGH" },
  { sym: "BYND",  name: "Beyond Meat",       shortPct: 38.4, dtc: 6.1, borrowRate: 24.2, chg1d: -2.10, chg1w: -3.40, squeezeScore: 76, signal: "HIGH" },
  { sym: "RIVN",  name: "Rivian",            shortPct: 18.6, dtc: 2.9, borrowRate: 8.8,  chg1d:  0.40, chg1w:  2.10, squeezeScore: 64, signal: "MODERATE" },
  { sym: "LCID",  name: "Lucid Group",       shortPct: 16.2, dtc: 2.4, borrowRate: 6.2,  chg1d: -1.20, chg1w: -0.80, squeezeScore: 58, signal: "MODERATE" },
  { sym: "PLUG",  name: "Plug Power",        shortPct: 14.8, dtc: 2.1, borrowRate: 5.4,  chg1d:  0.80, chg1w:  1.60, squeezeScore: 52, signal: "MODERATE" },
  { sym: "SOFI",  name: "SoFi Tech",         shortPct: 12.4, dtc: 1.8, borrowRate: 4.1,  chg1d:  1.40, chg1w:  3.20, squeezeScore: 46, signal: "MODERATE" },
  { sym: "UPST",  name: "Upstart",           shortPct: 28.6, dtc: 5.2, borrowRate: 14.8, chg1d: -0.60, chg1w: -2.10, squeezeScore: 71, signal: "HIGH" },
  { sym: "NVAX",  name: "Novavax",           shortPct: 19.2, dtc: 3.4, borrowRate: 9.6,  chg1d: -3.40, chg1w: -5.80, squeezeScore: 44, signal: "MODERATE" },
  { sym: "COIN",  name: "Coinbase",          shortPct: 11.8, dtc: 1.6, borrowRate: 3.8,  chg1d:  2.40, chg1w:  6.80, squeezeScore: 38, signal: "LOW" },
  { sym: "SMCI",  name: "Super Micro",       shortPct: 9.4,  dtc: 1.2, borrowRate: 2.8,  chg1d:  3.98, chg1w: 12.40, squeezeScore: 34, signal: "LOW" },
  { sym: "MSTR",  name: "MicroStrategy",     shortPct: 16.8, dtc: 2.6, borrowRate: 7.4,  chg1d:  4.20, chg1w:  9.60, squeezeScore: 60, signal: "MODERATE" },
];

function scoreBar(score: number) {
  const color = score >= 70 ? "#ff5a5f" : score >= 45 ? "#ffab40" : "#36b37e";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{ flex: 1, height: 4, background: "rgba(185,205,224,0.1)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 9, fontFamily: "monospace", color, minWidth: 22, textAlign: "right" }}>{score}</span>
    </div>
  );
}

function pct(v: number, small = false) {
  const color = v > 0 ? "#36b37e" : v < 0 ? "#ff5a5f" : "var(--si-text-muted)";
  return (
    <span style={{ color, fontFamily: "monospace", fontSize: small ? 9 : 10 }}>
      {v > 0 ? "+" : ""}{v.toFixed(2)}%
    </span>
  );
}

interface Props {
  style?: React.CSSProperties;
  onTickerClick?: (sym: string) => void;
}

export default function ShortInterestPanel({ style, onTickerClick }: Props) {
  return (
    <div className="si-market-panel" style={style}>
      <div className="si-market-panel-header">
        <span className="si-market-panel-title">Short Interest & Squeeze Screen</span>
        <span style={{ fontSize: 9, color: "var(--si-text-muted)", letterSpacing: "0.04em" }}>
          <Term id="SI_PCT">Short Float</Term> · <Term id="DAYS_TO_COVER">Days to Cover</Term> · Borrow Rate
        </span>
        <span className="si-market-panel-badge is-reference">REFERENCE</span>
      </div>
      <div className="si-market-panel-body-auto" style={{ padding: 0 }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "44px 1fr 52px 44px 56px 46px 46px 1fr",
          padding: "4px 10px",
          borderBottom: "1px solid var(--si-line)",
          fontSize: 8.5,
          color: "var(--si-text-muted)",
          fontWeight: 600,
          letterSpacing: "0.06em",
        }}>
          <span>SYM</span>
          <span>NAME</span>
          <span style={{ textAlign: "right" }}><Term id="SI_PCT">SHORT%</Term></span>
          <span style={{ textAlign: "right" }}><Term id="DAYS_TO_COVER">DTC</Term></span>
          <span style={{ textAlign: "right" }}>BORROW</span>
          <span style={{ textAlign: "right" }}>1D</span>
          <span style={{ textAlign: "right" }}>1W</span>
          <span>SQUEEZE</span>
        </div>

        {ROWS.map((r) => {
          const sigColor = r.signal === "HIGH" ? "#ff5a5f" : r.signal === "MODERATE" ? "#ffab40" : "#36b37e";
          return (
            <div
              key={r.sym}
              onClick={() => onTickerClick?.(r.sym)}
              style={{
                display: "grid",
                gridTemplateColumns: "44px 1fr 52px 44px 56px 46px 46px 1fr",
                padding: "4px 10px",
                borderBottom: "1px solid rgba(185,205,224,0.05)",
                fontSize: 10,
                alignItems: "center",
                cursor: onTickerClick ? "pointer" : "default",
              }}
            >
              <span style={{ color: sigColor, fontWeight: 700, fontFamily: "monospace", fontSize: 9.5 }}>{r.sym}</span>
              <span style={{ color: "var(--si-text-muted)", fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
              <span style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: r.shortPct > 20 ? "#ff5a5f" : "var(--si-text-bright)" }}>
                {r.shortPct.toFixed(1)}%
              </span>
              <span style={{ textAlign: "right", fontFamily: "monospace", color: "var(--si-text-muted)" }}>{r.dtc.toFixed(1)}d</span>
              <span style={{ textAlign: "right", fontFamily: "monospace", color: r.borrowRate > 10 ? "#ffab40" : "var(--si-text-muted)" }}>
                {r.borrowRate.toFixed(1)}%
              </span>
              <span style={{ textAlign: "right" }}>{pct(r.chg1d, true)}</span>
              <span style={{ textAlign: "right" }}>{pct(r.chg1w, true)}</span>
              <div style={{ paddingLeft: 4 }}>{scoreBar(r.squeezeScore)}</div>
            </div>
          );
        })}
      </div>
      <div className="si-market-panel-footer">FINRA · SEC Form 3/4 · Curated reference data</div>
    </div>
  );
}
