"use client";

import React from "react";

interface RatingChange {
  date: string;
  sym: string;
  company: string;
  analyst: string;
  from: string;
  to: string;
  pt: string;
  ptChg: number;
}

const UPGRADES: RatingChange[] = [
  { date: "Mar 4",  sym: "NVDA",  company: "NVIDIA",        analyst: "Morgan Stanley",  from: "EW",       to: "OW",  pt: "$1,000", ptChg:  18.2 },
  { date: "Mar 4",  sym: "AMZN",  company: "Amazon",         analyst: "Goldman Sachs",   from: "Neutral",  to: "Buy", pt: "$210",   ptChg:  12.5 },
  { date: "Mar 3",  sym: "META",  company: "Meta",           analyst: "JPMorgan",         from: "Neutral",  to: "OW",  pt: "$580",   ptChg:   8.1 },
  { date: "Mar 3",  sym: "LLY",   company: "Eli Lilly",      analyst: "UBS",              from: "Neutral",  to: "Buy", pt: "$850",   ptChg:  12.7 },
  { date: "Mar 2",  sym: "JPM",   company: "JPMorgan",       analyst: "Wells Fargo",      from: "EW",       to: "OW",  pt: "$220",   ptChg:   5.3 },
];

const DOWNGRADES: RatingChange[] = [
  { date: "Mar 4",  sym: "INTC",  company: "Intel",          analyst: "BofA",             from: "Buy",      to: "Neutral", pt: "$35",  ptChg: -13.7 },
  { date: "Mar 3",  sym: "DIS",   company: "Disney",         analyst: "Barclays",         from: "OW",       to: "EW",      pt: "$100", ptChg:  -8.2 },
  { date: "Mar 2",  sym: "PYPL",  company: "PayPal",         analyst: "Citi",             from: "Buy",      to: "Neutral", pt: "$65",  ptChg:  -5.1 },
  { date: "Mar 2",  sym: "BA",    company: "Boeing",         analyst: "Deutsche Bank",    from: "Buy",      to: "Hold",    pt: "$175", ptChg:  -6.9 },
  { date: "Mar 1",  sym: "SBUX",  company: "Starbucks",      analyst: "Raymond James",    from: "OW",       to: "MP",      pt: "$85",  ptChg:  -8.1 },
];

const RATING_COLOR: Record<string, string> = {
  "OW": "#36b37e", "Buy": "#36b37e", "Strong Buy": "#36b37e",
  "EW": "#ffab40", "Neutral": "#ffab40", "Hold": "#ffab40", "MP": "#ffab40",
  "UW": "#ff5a5f", "Sell": "#ff5a5f", "Underperform": "#ff5a5f",
};

function RatingRow({ r, onTickerClick }: { r: RatingChange; onTickerClick?: (sym: string) => void }) {
  return (
    <div className="wv-analyst-row" onClick={() => onTickerClick?.(r.sym)} style={{ cursor: onTickerClick ? "pointer" : "default" }}>
      <span style={{ color: "var(--wv-text-muted)", minWidth: 38 }}>{r.date}</span>
      <span style={{ color: "#89e5ff", fontWeight: 700, minWidth: 44 }}>{r.sym}</span>
      <span style={{ color: "var(--wv-text-muted)", fontSize: 9, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.analyst}</span>
      <span style={{ color: RATING_COLOR[r.from] ?? "var(--wv-text-muted)", fontSize: 9.5, minWidth: 40 }}>{r.from}</span>
      <span style={{ color: "var(--wv-text-muted)", fontSize: 9 }}>→</span>
      <span style={{ color: RATING_COLOR[r.to] ?? "var(--wv-text)", fontWeight: 700, fontSize: 9.5, minWidth: 52 }}>{r.to}</span>
      <span style={{ color: "var(--wv-text)", minWidth: 48, textAlign: "right" }}>{r.pt}</span>
      <span style={{ color: r.ptChg >= 0 ? "#36b37e" : "#ff5a5f", minWidth: 46, textAlign: "right", fontSize: 9.5 }}>
        {r.ptChg >= 0 ? "+" : ""}{r.ptChg.toFixed(1)}%
      </span>
    </div>
  );
}

interface Props {
  style?: React.CSSProperties;
  onTickerClick?: (sym: string) => void;
}

export default function AnalystRatingsPanel({ style, onTickerClick }: Props) {
  return (
    <div className="wv-market-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">Analyst Ratings</span>
        <span style={{ fontSize: 9, color: "#36b37e" }}>{UPGRADES.length}↑</span>
        <span style={{ fontSize: 9, color: "var(--wv-text-muted)" }}>&nbsp;/&nbsp;</span>
        <span style={{ fontSize: 9, color: "#ff5a5f" }}>{DOWNGRADES.length}↓</span>
        <span className="wv-market-panel-badge is-static">STATIC</span>
      </div>
      <div className="wv-market-panel-body" style={{ padding: 0 }}>
        <div className="wv-analyst-section-hdr" style={{ color: "#36b37e" }}>▲ UPGRADES</div>
        {UPGRADES.map((r, i) => <RatingRow key={i} r={r} onTickerClick={onTickerClick} />)}
        <div className="wv-analyst-section-hdr" style={{ color: "#ff5a5f", borderTop: "1px solid var(--wv-line)" }}>▼ DOWNGRADES</div>
        {DOWNGRADES.map((r, i) => <RatingRow key={i} r={r} onTickerClick={onTickerClick} />)}
      </div>
      <div className="wv-market-panel-footer">Bloomberg Intelligence · FactSet · placeholder data</div>
    </div>
  );
}
