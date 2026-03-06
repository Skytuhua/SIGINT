"use client";

import React from "react";

interface VolRow {
  sym: string;
  name: string;
  level: number;
  chg: number;
  riskLabel: string;
  riskColor: string;
}

const VOL_DATA: VolRow[] = [
  { sym: "VIX",   name: "S&P 500 Vol Index",  level: 14.82, chg: -3.11, riskLabel: "LOW",      riskColor: "#36b37e" },
  { sym: "VVIX",  name: "Vol of VIX",          level: 84.5,  chg:  1.24, riskLabel: "NORMAL",   riskColor: "#89e5ff" },
  { sym: "MOVE",  name: "Bond Market Vol",     level: 98.4,  chg:  0.84, riskLabel: "ELEVATED", riskColor: "#ffab40" },
  { sym: "OVX",   name: "Oil Volatility",      level: 24.3,  chg:  5.21, riskLabel: "NORMAL",   riskColor: "#89e5ff" },
  { sym: "GVX",   name: "Gold Volatility",     level: 11.2,  chg: -0.44, riskLabel: "LOW",      riskColor: "#36b37e" },
  { sym: "CVIX",  name: "FX Volatility",       level:  7.8,  chg: -0.88, riskLabel: "LOW",      riskColor: "#36b37e" },
];

const VIX_THRESHOLD = 20;

interface Props {
  style?: React.CSSProperties;
}

export default function VolatilityPanel({ style }: Props) {
  const vix = VOL_DATA[0].level;
  const regime = vix <= VIX_THRESHOLD ? "RISK-ON" : "RISK-OFF";
  const regimeClass = regime === "RISK-ON" ? "is-risk-on" : "is-risk-off";

  return (
    <div className="wv-market-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">Volatility</span>
        <span style={{ fontSize: 9, color: "var(--wv-text-muted)", letterSpacing: "0.04em" }}>FEAR GAUGES</span>
        <span className="wv-market-panel-badge is-static">STATIC</span>
      </div>
      <div className="wv-market-panel-body" style={{ padding: 0 }}>
        <div className="wv-market-vol-col-header">
          <span>SYM</span>
          <span>NAME</span>
          <span style={{ textAlign: "right" }}>LEVEL</span>
          <span style={{ textAlign: "right" }}>CHG%</span>
          <span style={{ textAlign: "right" }}>RISK</span>
        </div>
        {VOL_DATA.map((row) => {
          const chgClass = row.chg > 0 ? "is-up" : row.chg < 0 ? "is-down" : "is-flat";
          const sign = row.chg > 0 ? "+" : "";
          return (
            <div key={row.sym} className="wv-market-vol-row">
              <span className="wv-market-vol-sym">{row.sym}</span>
              <span className="wv-market-vol-name" title={row.name}>{row.name}</span>
              <span className="wv-market-vol-level">{row.level.toFixed(1)}</span>
              <span className={`wv-market-vol-chg ${chgClass}`}>{sign}{row.chg.toFixed(2)}%</span>
              <span className="wv-market-vol-risk" style={{ color: row.riskColor }}>{row.riskLabel}</span>
            </div>
          );
        })}
        <div className={`wv-market-vol-regime ${regimeClass}`}>
          <span>REGIME:</span>
          <span className="wv-market-vol-regime-label">{regime}</span>
          <span style={{ marginLeft: "auto", color: "var(--wv-text-muted)" }}>
            {regime === "RISK-ON" ? "Stocks↑ · Bonds↑ · Gold↓" : "Stocks↓ · Bonds↑ · Gold↑"}
          </span>
        </div>
      </div>
      <div className="wv-market-panel-footer">CBOE · ICE · placeholder data</div>
    </div>
  );
}
