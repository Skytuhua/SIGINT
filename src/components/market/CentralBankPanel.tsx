"use client";

import React from "react";

interface CbRow {
  bank: string;
  country: string;
  rate: number;
  prev: number;
  nextMtg: string;
  stance: "hawkish" | "neutral" | "dovish";
  trend: "hiking" | "holding" | "cutting";
}

const CENTRAL_BANKS: CbRow[] = [
  { bank: "Fed",   country: "United States", rate: 5.375, prev: 5.375, nextMtg: "May 1",   stance: "neutral",  trend: "holding" },
  { bank: "ECB",   country: "Euro Area",     rate: 4.50,  prev: 4.50,  nextMtg: "Apr 11",  stance: "dovish",   trend: "cutting" },
  { bank: "BOE",   country: "United Kingdom",rate: 5.25,  prev: 5.25,  nextMtg: "May 9",   stance: "neutral",  trend: "holding" },
  { bank: "BOJ",   country: "Japan",         rate: 0.10,  prev: -0.10, nextMtg: "Apr 26",  stance: "hawkish",  trend: "hiking"  },
  { bank: "SNB",   country: "Switzerland",   rate: 1.50,  prev: 1.75,  nextMtg: "Jun 20",  stance: "dovish",   trend: "cutting" },
  { bank: "RBA",   country: "Australia",     rate: 4.35,  prev: 4.35,  nextMtg: "May 7",   stance: "neutral",  trend: "holding" },
  { bank: "BOC",   country: "Canada",        rate: 5.00,  prev: 5.00,  nextMtg: "Apr 10",  stance: "dovish",   trend: "cutting" },
  { bank: "PBOC",  country: "China",         rate: 3.45,  prev: 3.55,  nextMtg: "—",       stance: "dovish",   trend: "cutting" },
  { bank: "RBNZ",  country: "New Zealand",   rate: 5.50,  prev: 5.50,  nextMtg: "May 22",  stance: "neutral",  trend: "holding" },
  { bank: "Norges",country: "Norway",        rate: 4.50,  prev: 4.50,  nextMtg: "Mar 21",  stance: "hawkish",  trend: "holding" },
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
        <span className="wv-market-panel-badge is-static">STATIC</span>
      </div>
      <div className="wv-market-panel-body" style={{ padding: 0 }}>
        <div className="wv-cb-header-row">
          <span>CB</span>
          <span>RATE</span>
          <span>Δ PREV</span>
          <span>TREND</span>
          <span>NEXT MTG</span>
        </div>
        {CENTRAL_BANKS.map((cb) => {
          const delta = cb.rate - cb.prev;
          const deltaStr = delta === 0 ? "—" : `${delta > 0 ? "+" : ""}${(delta * 100).toFixed(0)}bp`;
          const deltaColor = delta > 0 ? "#ff5a5f" : delta < 0 ? "#36b37e" : "var(--wv-text-muted)";
          return (
            <div key={cb.bank} className="wv-cb-row" title={cb.country}>
              <span style={{ color: "#89e5ff", fontWeight: 700 }}>{cb.bank}</span>
              <span style={{ color: "var(--wv-text)", fontWeight: 600 }}>{cb.rate.toFixed(2)}%</span>
              <span style={{ color: deltaColor }}>{deltaStr}</span>
              <span style={{ color: TREND_COLOR[cb.trend] }}>{TREND_LABEL[cb.trend]}</span>
              <span style={{ color: "var(--wv-text-muted)" }}>{cb.nextMtg}</span>
            </div>
          );
        })}
      </div>
      <div className="wv-market-panel-footer">BIS · central bank websites · placeholder data</div>
    </div>
  );
}
