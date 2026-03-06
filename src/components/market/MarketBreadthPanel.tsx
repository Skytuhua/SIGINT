"use client";

import React from "react";

interface BreadthRow {
  label: string;
  nyse: string;
  nasdaq: string;
  color?: string;
}

const BREADTH: BreadthRow[] = [
  { label: "Advancing",     nyse: "1,842", nasdaq: "2,118", color: "#36b37e" },
  { label: "Declining",     nyse: "1,023", nasdaq: "1,387", color: "#ff5a5f" },
  { label: "Unchanged",     nyse: "134",   nasdaq: "201" },
  { label: "New 52W Highs", nyse: "87",    nasdaq: "143",   color: "#36b37e" },
  { label: "New 52W Lows",  nyse: "12",    nasdaq: "29",    color: "#ff5a5f" },
];

interface GaugeProps { label: string; value: number; low: number; high: number; color: string; suffix?: string; }

function Gauge({ label, value, low, high, color, suffix = "" }: GaugeProps) {
  const pct = Math.min(100, Math.max(0, ((value - low) / (high - low)) * 100));
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, marginBottom: 3 }}>
        <span style={{ color: "var(--wv-text-muted)" }}>{label}</span>
        <span style={{ color, fontWeight: 700 }}>{value.toFixed(2)}{suffix}</span>
      </div>
      <div style={{ height: 4, background: "rgba(185,205,224,0.08)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

interface Props {
  style?: React.CSSProperties;
}

export default function MarketBreadthPanel({ style }: Props) {
  const advDecRatio = 1842 / 1023;
  const pctAbove200 = 68.4;
  const putCallRatio = 0.72;
  const mclellan = 42.8;
  const trin = 0.84;

  const adColor = advDecRatio >= 1 ? "#36b37e" : "#ff5a5f";

  return (
    <div className="wv-market-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">Market Breadth</span>
        <span style={{ fontSize: 9, color: "var(--wv-text-muted)" }}>NYSE · NASDAQ</span>
        <span className="wv-market-panel-badge is-static">STATIC</span>
      </div>
      <div className="wv-market-panel-body" style={{ padding: "8px 10px" }}>
        {/* A/D table */}
        <div style={{ marginBottom: 10 }}>
          <div className="wv-breadth-table-head">
            <span>ISSUE</span><span style={{ textAlign: "right" }}>NYSE</span><span style={{ textAlign: "right" }}>NASDAQ</span>
          </div>
          {BREADTH.map((r) => (
            <div key={r.label} className="wv-breadth-table-row">
              <span style={{ color: "var(--wv-text-muted)" }}>{r.label}</span>
              <span style={{ color: r.color ?? "var(--wv-text)", textAlign: "right" }}>{r.nyse}</span>
              <span style={{ color: r.color ?? "var(--wv-text)", textAlign: "right" }}>{r.nasdaq}</span>
            </div>
          ))}
        </div>

        {/* Gauges */}
        <div style={{ borderTop: "1px solid var(--wv-line)", paddingTop: 8 }}>
          <Gauge label="Adv/Dec Ratio"       value={advDecRatio}  low={0.3}  high={3}    color={adColor} />
          <Gauge label="% Above 200-MA"      value={pctAbove200}  low={20}   high={80}   color={pctAbove200 > 60 ? "#36b37e" : "#ff5a5f"} suffix="%" />
          <Gauge label="Put/Call Ratio"      value={putCallRatio} low={0.4}  high={1.4}  color={putCallRatio < 0.8 ? "#ffab40" : "#36b37e"} />
          <Gauge label="McClellan Osc"       value={mclellan}     low={-100} high={100}  color={mclellan > 0 ? "#36b37e" : "#ff5a5f"} />
          <Gauge label="TRIN (Arms Index)"   value={trin}         low={0.3}  high={2.5}  color={trin < 1 ? "#36b37e" : "#ff5a5f"} />
        </div>

        {/* Regime pill */}
        <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
          <div className={`wv-breadth-regime-pill is-bullish`}>
            BULLISH BREADTH
          </div>
          <div style={{ fontSize: 9, color: "var(--wv-text-muted)", alignSelf: "center" }}>
            A/D: {advDecRatio.toFixed(2)}x · TRIN: {trin}
          </div>
        </div>
      </div>
      <div className="wv-market-panel-footer">NYSE · NASDAQ · placeholder data</div>
    </div>
  );
}
