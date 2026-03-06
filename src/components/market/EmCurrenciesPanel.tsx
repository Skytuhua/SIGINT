"use client";

import React from "react";
import { MiniSparkline } from "./shared/MiniSparkline";

interface EmRow {
  pair: string;
  country: string;
  rate: string;
  chg1d: number;
  chg1w: number;
  chg1m: number;
  ytd: number;
  cbRate: number;
  hist: number[];
  regime: "Risk-On" | "Risk-Off" | "Neutral";
}

const EM_FX: EmRow[] = [
  { pair: "USD/MXN", country: "Mexico",      rate: "16.82",  chg1d: -0.28, chg1w: -0.6, chg1m:  1.2, ytd: -2.1, cbRate: 11.00, hist: [17.1,17.0,16.9,16.85,16.82,16.80,16.82], regime: "Risk-On" },
  { pair: "USD/BRL", country: "Brazil",      rate: "4.97",   chg1d:  0.31, chg1w:  0.8, chg1m:  2.8, ytd:  4.2, cbRate: 10.75, hist: [4.82,4.84,4.90,4.93,4.96,4.98,4.97],  regime: "Neutral" },
  { pair: "USD/ZAR", country: "S. Africa",   rate: "18.72",  chg1d:  0.42, chg1w:  1.2, chg1m:  3.8, ytd:  5.1, cbRate: 8.25,  hist: [18.1,18.2,18.4,18.6,18.7,18.72,18.72], regime: "Risk-Off" },
  { pair: "USD/TRY", country: "Turkey",      rate: "32.44",  chg1d:  0.08, chg1w:  0.3, chg1m:  2.2, ytd:  8.4, cbRate: 45.00, hist: [31.2,31.5,31.8,32.1,32.3,32.4,32.44],  regime: "Risk-Off" },
  { pair: "USD/INR", country: "India",       rate: "83.12",  chg1d:  0.04, chg1w:  0.1, chg1m:  0.3, ytd:  0.8, cbRate: 6.50,  hist: [82.8,82.9,83.0,83.1,83.1,83.1,83.12],  regime: "Neutral" },
  { pair: "USD/IDR", country: "Indonesia",   rate: "15,648", chg1d:  0.12, chg1w:  0.4, chg1m:  1.1, ytd:  1.8, cbRate: 6.00,  hist: [15500,15520,15560,15600,15630,15645,15648], regime: "Neutral" },
  { pair: "USD/PHP", country: "Philippines", rate: "56.28",  chg1d: -0.08, chg1w: -0.2, chg1m:  0.6, ytd:  1.2, cbRate: 6.50,  hist: [56.5,56.4,56.35,56.30,56.28,56.27,56.28], regime: "Neutral" },
  { pair: "USD/CLP", country: "Chile",       rate: "938.4",  chg1d:  0.45, chg1w:  1.3, chg1m:  3.2, ytd:  4.8, cbRate: 6.50,  hist: [912,920,928,932,936,938,938.4],  regime: "Risk-Off" },
  { pair: "USD/COP", country: "Colombia",    rate: "3,881",  chg1d:  0.22, chg1w:  0.8, chg1m:  2.1, ytd:  3.4, cbRate: 12.50, hist: [3800,3820,3840,3860,3874,3880,3881], regime: "Neutral" },
  { pair: "USD/RON", country: "Romania",     rate: "4.97",   chg1d:  0.08, chg1w:  0.2, chg1m:  0.5, ytd:  1.1, cbRate: 7.00,  hist: [4.93,4.94,4.95,4.96,4.97,4.97,4.97], regime: "Neutral" },
];

const REGIME_COLOR: Record<string, string> = {
  "Risk-On":  "#36b37e",
  "Risk-Off": "#ff5a5f",
  "Neutral":  "var(--wv-text-muted)",
};

interface Props {
  style?: React.CSSProperties;
}

export default function EmCurrenciesPanel({ style }: Props) {
  return (
    <div className="wv-market-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">EM Currencies</span>
        <span style={{ fontSize: 9, color: "var(--wv-text-muted)" }}>USD cross-rates</span>
        <span className="wv-market-panel-badge is-static">STATIC</span>
      </div>
      <div className="wv-market-panel-body" style={{ padding: 0 }}>
        <div className="wv-em-header">
          <span>PAIR</span><span>RATE</span>
          <span style={{ textAlign: "right" }}>1D%</span>
          <span style={{ textAlign: "right" }}>1W%</span>
          <span style={{ textAlign: "right" }}>1M%</span>
          <span style={{ textAlign: "right" }}>YTD%</span>
          <span style={{ textAlign: "right" }}>CB</span>
          <span>TREND</span>
        </div>
        {EM_FX.map((r) => {
          const up = r.chg1d <= 0; // USD weakening = EM strengthening = bullish for EM
          return (
            <div key={r.pair} className="wv-em-row" title={r.country}>
              <span style={{ color: "#89e5ff", fontWeight: 700 }}>{r.pair}</span>
              <span style={{ color: "var(--wv-text)", fontWeight: 600 }}>{r.rate}</span>
              <span style={{ textAlign: "right", color: r.chg1d <= 0 ? "#36b37e" : "#ff5a5f" }}>
                {r.chg1d > 0 ? "+" : ""}{r.chg1d.toFixed(2)}%
              </span>
              <span style={{ textAlign: "right", color: r.chg1w <= 0 ? "#36b37e" : "#ff5a5f" }}>
                {r.chg1w > 0 ? "+" : ""}{r.chg1w.toFixed(1)}%
              </span>
              <span style={{ textAlign: "right", color: r.chg1m <= 0 ? "#36b37e" : "#ff5a5f" }}>
                {r.chg1m > 0 ? "+" : ""}{r.chg1m.toFixed(1)}%
              </span>
              <span style={{ textAlign: "right", color: r.ytd <= 0 ? "#36b37e" : "#ff5a5f" }}>
                {r.ytd > 0 ? "+" : ""}{r.ytd.toFixed(1)}%
              </span>
              <span style={{ textAlign: "right", color: "var(--wv-text-muted)" }}>{r.cbRate}%</span>
              <span><MiniSparkline prices={r.hist} up={up} width={36} height={12} /></span>
            </div>
          );
        })}
      </div>
      <div className="wv-market-panel-footer">Reuters · Bloomberg · placeholder data</div>
    </div>
  );
}
