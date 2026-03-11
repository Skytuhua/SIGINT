"use client";

import { useMemo } from "react";
import { useMarketData } from "../../hooks/useMarketData";
import type { QuotesResponse } from "../../lib/server/news/providers/marketTypes";
import Term from "./shared/Term";

const SYMBOLS = ["^VIX", "^VIX9D", "RSP", "SPY"];
const ENDPOINT = `/api/market/quotes?symbols=${SYMBOLS.join(",")}`;
const EMPTY: QuotesResponse = { quotes: {}, degraded: true, timestamp: "" };

interface Signal {
  name: string;
  termId: string;
  value: string;
  score: number;  // -2 to +2
  label: string;
  color: string;
}

const REGIME_MAP: { min: number; label: string; color: string }[] = [
  { min: -Infinity, label: "EXTREME FEAR", color: "#ff5a5f" },
  { min: -1.5, label: "FEAR", color: "#ff8c42" },
  { min: -0.5, label: "NEUTRAL", color: "#89e5ff" },
  { min: 0.5, label: "GREED", color: "#6ee7b7" },
  { min: 1.5, label: "EXTREME GREED", color: "#36b37e" },
];

function getRegime(score: number): { label: string; color: string } {
  if (score >= 1.5) return REGIME_MAP[4];
  if (score >= 0.5) return REGIME_MAP[3];
  if (score >= -0.5) return REGIME_MAP[2];
  if (score >= -1.5) return REGIME_MAP[1];
  return REGIME_MAP[0];
}

function signalColor(score: number): string {
  if (score >= 1) return "#36b37e";
  if (score > 0) return "#6ee7b7";
  if (score === 0) return "#89e5ff";
  if (score > -1) return "#ff8c42";
  return "#ff5a5f";
}

function signalArrow(score: number): string {
  if (score >= 1) return "▲▲";
  if (score > 0) return "▲";
  if (score === 0) return "—";
  if (score > -1) return "▼";
  return "▼▼";
}

interface Props {
  style?: React.CSSProperties;
}

export default function MarketRegimePanel({ style }: Props) {
  const { data, isLive } = useMarketData<QuotesResponse>(ENDPOINT, 60_000, EMPTY);
  const quotes = data.quotes ?? {};

  const { signals, composite, regime } = useMemo(() => {
    const vix = quotes["^VIX"]?.price ?? 0;
    const vix9d = quotes["^VIX9D"]?.price ?? 0;
    const rsp = quotes["RSP"]?.changePercent ?? 0;
    const spy = quotes["SPY"]?.changePercent ?? 0;

    const sigs: Signal[] = [];

    // 1. VIX Level
    let vixScore = 0;
    if (vix > 0) {
      if (vix <= 15) vixScore = 2;
      else if (vix <= 20) vixScore = 1;
      else if (vix <= 25) vixScore = 0;
      else if (vix <= 30) vixScore = -1;
      else vixScore = -2;
    }
    sigs.push({
      name: "VIX Level",
      termId: "VIX",
      value: vix > 0 ? vix.toFixed(1) : "—",
      score: vixScore,
      label: vixScore >= 1 ? "Low Vol" : vixScore <= -1 ? "High Vol" : "Normal",
      color: signalColor(vixScore),
    });

    // 2. VIX Term Structure (VIX9D vs VIX)
    let termScore = 0;
    if (vix > 0 && vix9d > 0) {
      const ratio = vix9d / vix;
      if (ratio > 1.05) termScore = -1;       // Inverted → fear
      else if (ratio < 0.95) termScore = 1;    // Contango → greed
      else termScore = 0;
    }
    sigs.push({
      name: "VIX Term Structure",
      termId: "VVIX",
      value: vix9d > 0 && vix > 0 ? `${(vix9d / vix).toFixed(2)}x` : "—",
      score: termScore,
      label: termScore > 0 ? "Contango" : termScore < 0 ? "Inverted" : "Flat",
      color: signalColor(termScore),
    });

    // 3. Market Breadth (RSP vs SPY — equal-weight vs cap-weight)
    let breadthScore = 0;
    const breadthDiff = rsp - spy;
    if (Math.abs(breadthDiff) > 0.01) {
      if (breadthDiff > 0.3) breadthScore = 2;
      else if (breadthDiff > 0) breadthScore = 1;
      else if (breadthDiff > -0.3) breadthScore = -1;
      else breadthScore = -2;
    }
    sigs.push({
      name: "Breadth (RSP vs SPY)",
      termId: "BREADTH",
      value: breadthDiff !== 0 ? `${breadthDiff > 0 ? "+" : ""}${breadthDiff.toFixed(2)}%` : "—",
      score: breadthScore,
      label: breadthScore >= 1 ? "Broad Rally" : breadthScore <= -1 ? "Narrow" : "Balanced",
      color: signalColor(breadthScore),
    });

    // 4. SPY Momentum (1D change as quick proxy)
    const spyChg = spy;
    let momScore = 0;
    if (spyChg > 1) momScore = 2;
    else if (spyChg > 0.3) momScore = 1;
    else if (spyChg > -0.3) momScore = 0;
    else if (spyChg > -1) momScore = -1;
    else momScore = -2;
    sigs.push({
      name: "SPY Momentum",
      termId: "MOMENTUM",
      value: `${spyChg > 0 ? "+" : ""}${spyChg.toFixed(2)}%`,
      score: momScore,
      label: momScore >= 1 ? "Bullish" : momScore <= -1 ? "Bearish" : "Flat",
      color: signalColor(momScore),
    });

    const comp = sigs.reduce((s, sig) => s + sig.score, 0) / sigs.length;
    const reg = getRegime(comp);

    return { signals: sigs, composite: comp, regime: reg };
  }, [quotes]);

  // Gauge: map composite (-2 to +2) → position (0% to 100%)
  const gaugePos = Math.max(0, Math.min(100, ((composite + 2) / 4) * 100));

  return (
    <div className="si-market-panel" style={style}>
      <div className="si-market-panel-header">
        <span className="si-market-panel-title"><Term id="RISK_ON">Market Regime</Term></span>
        <span style={{ fontSize: 9, color: "var(--si-text-muted)", letterSpacing: "0.04em" }}>FEAR & GREED</span>
        <span className={`si-market-panel-badge ${isLive ? "is-live" : "is-static"}`}>
          {isLive ? "LIVE" : "STATIC"}
        </span>
      </div>
      <div className="si-market-panel-body" style={{ padding: "12px 14px" }}>
        {/* Gauge */}
        <div style={{ marginBottom: 12 }}>
          {/* Gradient bar */}
          <div style={{
            height: 10, borderRadius: 5, position: "relative",
            background: "linear-gradient(to right, #ff5a5f, #ff8c42, #89e5ff, #6ee7b7, #36b37e)",
          }}>
            {/* Needle */}
            <div style={{
              position: "absolute", top: -3, left: `${gaugePos}%`, transform: "translateX(-50%)",
              width: 4, height: 16, borderRadius: 2, background: "#fff",
              boxShadow: "0 0 6px rgba(255,255,255,0.5)",
            }} />
          </div>
          {/* Labels under gauge */}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "var(--si-text-muted)", marginTop: 3 }}>
            <span>EXTREME FEAR</span>
            <span>NEUTRAL</span>
            <span>EXTREME GREED</span>
          </div>
        </div>

        {/* Regime label */}
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: regime.color, letterSpacing: "0.05em" }}>
            {regime.label}
          </div>
          <div style={{ fontSize: 9, color: "var(--si-text-muted)", marginTop: 2 }}>
            Score: {composite.toFixed(2)} / 2.00
          </div>
        </div>

        {/* Contributing signals */}
        <div style={{ borderTop: "1px solid var(--si-line)", paddingTop: 8 }}>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 60px 70px 50px",
            padding: "0 0 4px 0", fontSize: 9, color: "var(--si-text-muted)",
          }}>
            <span>SIGNAL</span>
            <span style={{ textAlign: "right" }}>VALUE</span>
            <span style={{ textAlign: "right" }}>READING</span>
            <span style={{ textAlign: "right" }}>BIAS</span>
          </div>
          {signals.map((sig) => (
            <div
              key={sig.name}
              style={{
                display: "grid", gridTemplateColumns: "1fr 60px 70px 50px",
                padding: "4px 0", borderBottom: "1px solid rgba(185,205,224,0.06)",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 10, color: "var(--si-text)" }}>
                <Term id={sig.termId}>{sig.name}</Term>
              </span>
              <span style={{ textAlign: "right", fontSize: 10, fontWeight: 600 }}>
                {sig.value}
              </span>
              <span style={{ textAlign: "right", fontSize: 9, color: sig.color }}>
                {sig.label}
              </span>
              <span style={{ textAlign: "right", fontSize: 11, color: sig.color, fontWeight: 700 }}>
                {signalArrow(sig.score)}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="si-market-panel-footer">
        {isLive ? "Composite of VIX, breadth, momentum · 60s refresh" : "Waiting for data…"}
      </div>
    </div>
  );
}
