"use client";

import React from "react";

interface CbRow {
  bank: string;
  country: string;
  rate: number;
  prev: number;
  cpi: number; // latest CPI y/y for real rate calc
  nextMtg: string;
  stance: "hawkish" | "neutral" | "dovish";
  trend: "hiking" | "holding" | "cutting";
}

// Curated central bank data — updated manually as rates change
const CENTRAL_BANKS: CbRow[] = [
  { bank: "Fed",   country: "United States", rate: 4.375, prev: 4.375, cpi: 3.1,  nextMtg: "May 7",   stance: "neutral",  trend: "holding" },
  { bank: "ECB",   country: "Euro Area",     rate: 2.65,  prev: 2.90,  cpi: 2.4,  nextMtg: "Apr 17",  stance: "dovish",   trend: "cutting" },
  { bank: "BOE",   country: "United Kingdom",rate: 4.50,  prev: 4.75,  cpi: 4.0,  nextMtg: "May 8",   stance: "neutral",  trend: "cutting" },
  { bank: "BOJ",   country: "Japan",         rate: 0.50,  prev: 0.25,  cpi: 2.8,  nextMtg: "Apr 25",  stance: "hawkish",  trend: "hiking"  },
  { bank: "SNB",   country: "Switzerland",   rate: 0.25,  prev: 0.50,  cpi: 1.3,  nextMtg: "Jun 19",  stance: "dovish",   trend: "cutting" },
  { bank: "RBA",   country: "Australia",     rate: 4.10,  prev: 4.35,  cpi: 3.4,  nextMtg: "May 20",  stance: "neutral",  trend: "cutting" },
  { bank: "BOC",   country: "Canada",        rate: 2.75,  prev: 3.00,  cpi: 2.9,  nextMtg: "Apr 16",  stance: "dovish",   trend: "cutting" },
  { bank: "PBOC",  country: "China",         rate: 3.10,  prev: 3.10,  cpi: 0.7,  nextMtg: "—",       stance: "dovish",   trend: "holding" },
  { bank: "RBNZ",  country: "New Zealand",   rate: 3.75,  prev: 4.25,  cpi: 4.7,  nextMtg: "May 28",  stance: "dovish",   trend: "cutting" },
  { bank: "Norges",country: "Norway",        rate: 4.50,  prev: 4.50,  cpi: 3.6,  nextMtg: "May 8",   stance: "hawkish",  trend: "holding" },
];

const STANCE_COLOR: Record<string, string> = {
  hawkish: "#ff5a5f",
  neutral: "#ffab40",
  dovish: "#36b37e",
};

const TREND_LABEL: Record<string, string> = {
  hiking: "↑ Hiking",
  holding: "→ Hold",
  cutting: "↓ Cutting",
};

const TREND_COLOR: Record<string, string> = {
  hiking: "#ff5a5f",
  holding: "var(--wv-text-muted)",
  cutting: "#36b37e",
};

interface Props {
  style?: React.CSSProperties;
}

export default function CentralBankPanel({ style }: Props) {
  return (
    <div className="wv-market-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">Central Banks</span>
        <span style={{ fontSize: 9, color: "var(--wv-text-muted)" }}>Policy Rates</span>
        <span className="wv-market-panel-badge is-live">CURATED</span>
      </div>
      <div className="wv-market-panel-body" style={{ padding: 0 }}>
        <div className="wv-cb-header-row">
          <span>CB</span>
          <span>COUNTRY</span>
          <span>RATE</span>
          <span style={{ textAlign: "right" }}>REAL</span>
          <span>Δ PREV</span>
          <span>TREND</span>
          <span style={{ textAlign: "center" }}>STANCE</span>
          <span>NEXT MTG</span>
        </div>
        {CENTRAL_BANKS.map((cb) => {
          const delta = cb.rate - cb.prev;
          const deltaStr = Math.abs(delta) < 0.001 ? "—" : `${delta > 0 ? "+" : ""}${(delta * 100).toFixed(0)}bp`;
          const deltaColor = delta > 0 ? "#ff5a5f" : delta < 0 ? "#36b37e" : "var(--wv-text-muted)";
          const realRate = cb.rate - cb.cpi;
          const realColor = realRate > 0 ? "#36b37e" : realRate < -1 ? "#ff5a5f" : "#ffab40";
          return (
            <div key={cb.bank} className="wv-cb-row">
              <span style={{ color: "#89e5ff", fontWeight: 700 }}>{cb.bank}</span>
              <span style={{ color: "var(--wv-text-muted)", fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cb.country}</span>
              <span style={{ color: "var(--wv-text)", fontWeight: 600 }}>{cb.rate.toFixed(2)}%</span>
              <span style={{ textAlign: "right", fontFamily: "monospace", fontSize: 9, color: realColor }}>
                {realRate > 0 ? "+" : ""}{realRate.toFixed(1)}%
              </span>
              <span style={{ color: deltaColor }}>{deltaStr}</span>
              <span style={{ color: TREND_COLOR[cb.trend] }}>{TREND_LABEL[cb.trend]}</span>
              <span style={{
                textAlign: "center",
                fontSize: 8,
                fontWeight: 700,
                letterSpacing: "0.04em",
                color: STANCE_COLOR[cb.stance],
                background: cb.stance === "hawkish" ? "rgba(255,90,95,0.10)" : cb.stance === "dovish" ? "rgba(54,179,126,0.10)" : "rgba(255,171,64,0.10)",
                padding: "1px 5px",
                borderRadius: 2,
              }}>
                {cb.stance.toUpperCase()}
              </span>
              <span style={{ color: "var(--wv-text-muted)" }}>{cb.nextMtg}</span>
            </div>
          );
        })}
      </div>
      <div className="wv-market-panel-footer">BIS · central bank websites · Mar 2026</div>
    </div>
  );
}
