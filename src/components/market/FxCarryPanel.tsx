"use client";

import React from "react";
import Term from "./shared/Term";

interface CarryRow {
  pair: string;
  longCcy: string;
  shortCcy: string;
  longRate: number;
  shortRate: number;
  spot: string;
  carry1d: string;
  rollYield: number;
  sharpe: number;
  regime: "Favorable" | "Neutral" | "Unfavorable";
}

const CARRY_TRADES: CarryRow[] = [
  { pair: "AUD/JPY", longCcy: "AUD",  shortCcy: "JPY", longRate: 4.35, shortRate: 0.10, spot: "99.82",  carry1d: "+$12/lot", rollYield: 1.18, sharpe: 1.42, regime: "Favorable" },
  { pair: "NZD/JPY", longCcy: "NZD",  shortCcy: "JPY", longRate: 5.50, shortRate: 0.10, spot: "91.44",  carry1d: "+$15/lot", rollYield: 1.48, sharpe: 1.38, regime: "Favorable" },
  { pair: "MXN/JPY", longCcy: "MXN",  shortCcy: "JPY", longRate: 11.0, shortRate: 0.10, spot: "5.94",   carry1d: "+$30/lot", rollYield: 2.97, sharpe: 1.12, regime: "Neutral"   },
  { pair: "USD/CHF", longCcy: "USD",  shortCcy: "CHF", longRate: 5.38, shortRate: 1.50, spot: "0.8891", carry1d: "+$10/lot", rollYield: 1.04, sharpe: 0.96, regime: "Favorable" },
  { pair: "GBP/CHF", longCcy: "GBP",  shortCcy: "CHF", longRate: 5.25, shortRate: 1.50, spot: "1.1288", carry1d: "+$9/lot",  rollYield: 1.00, sharpe: 0.88, regime: "Neutral"   },
  { pair: "EUR/CHF", longCcy: "EUR",  shortCcy: "CHF", longRate: 4.50, shortRate: 1.50, spot: "0.9618", carry1d: "+$8/lot",  rollYield: 0.82, sharpe: 0.72, regime: "Neutral"   },
  { pair: "USD/JPY", longCcy: "USD",  shortCcy: "JPY", longRate: 5.38, shortRate: 0.10, spot: "149.88", carry1d: "+$14/lot", rollYield: 1.44, sharpe: 1.22, regime: "Favorable" },
  { pair: "TRY/JPY", longCcy: "TRY",  shortCcy: "JPY", longRate: 45.0, shortRate: 0.10, spot: "4.62",   carry1d: "+$120/lot",rollYield: 12.2, sharpe: 0.34, regime: "Unfavorable"},
];

const REGIME_COLOR: Record<string, string> = {
  Favorable:   "#36b37e",
  Neutral:     "#ffab40",
  Unfavorable: "#ff5a5f",
};

interface Props {
  style?: React.CSSProperties;
}

export default function FxCarryPanel({ style }: Props) {
  return (
    <div className="si-market-panel" style={style}>
      <div className="si-market-panel-header">
        <span className="si-market-panel-title">FX <Term id="CARRY_TRADE">Carry Trades</Term></span>
        <span style={{ fontSize: 9, color: "var(--si-text-muted)" }}>Rate diff · Roll yield</span>
        <span className="si-market-panel-badge is-reference">REFERENCE</span>
      </div>
      <div className="si-market-panel-body" style={{ padding: 0 }}>
        <div className="si-carry-header">
          <span>PAIR</span><span>LONG</span><span>SHORT</span>
          <span style={{ textAlign: "right" }}>RATE Δ</span>
          <span style={{ textAlign: "right" }}>SPOT</span>
          <span style={{ textAlign: "right" }}>ROLL%</span>
          <span style={{ textAlign: "right" }}><Term id="CARRY_SHARPE">SHARPE</Term></span>
          <span>REGIME</span>
        </div>
        {CARRY_TRADES.map((r) => {
          const diff = r.longRate - r.shortRate;
          return (
            <div key={r.pair} className="si-carry-row">
              <span style={{ color: "#89e5ff", fontWeight: 700 }}>{r.pair}</span>
              <span style={{ color: "#36b37e", fontSize: 9 }}>{r.longCcy} {r.longRate}%</span>
              <span style={{ color: "#ff5a5f", fontSize: 9 }}>{r.shortCcy} {r.shortRate}%</span>
              <span style={{ textAlign: "right", color: "#36b37e", fontWeight: 600 }}>+{diff.toFixed(2)}%</span>
              <span style={{ textAlign: "right", color: "var(--si-text)" }}>{r.spot}</span>
              <span style={{ textAlign: "right", color: r.rollYield > 1 ? "#36b37e" : "#ffab40" }}>{r.rollYield.toFixed(2)}%</span>
              <span style={{ textAlign: "right", color: r.sharpe > 1 ? "#36b37e" : r.sharpe > 0.5 ? "#ffab40" : "#ff5a5f" }}>{r.sharpe.toFixed(2)}</span>
              <span style={{ color: REGIME_COLOR[r.regime], fontSize: 9, fontWeight: 600 }}>{r.regime}</span>
            </div>
          );
        })}
      </div>
      <div className="si-market-panel-footer">CFTC · broker roll data · Curated reference data</div>
    </div>
  );
}
