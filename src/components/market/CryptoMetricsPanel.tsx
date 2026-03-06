"use client";

import React from "react";

interface MetricRow {
  label: string;
  value: string;
  chg: string;
  chgDir: "up" | "down" | "flat";
  signal: "Bullish" | "Bearish" | "Neutral" | "Caution";
  desc: string;
}

const METRICS: MetricRow[] = [
  { label: "BTC Hash Rate",        value: "612 EH/s",   chg: "+1.2%",  chgDir: "up",   signal: "Bullish", desc: "Network security at ATH" },
  { label: "Miner Revenue",        value: "$64.2M/day", chg: "+8.1%",  chgDir: "up",   signal: "Bullish", desc: "Post-halving equilibrium" },
  { label: "Exchange BTC Flow",    value: "-12.4K BTC", chg: "Outflow",chgDir: "up",   signal: "Bullish", desc: "Net withdrawal from exchanges" },
  { label: "MVRV Ratio",           value: "1.82",       chg: "+0.04",  chgDir: "up",   signal: "Neutral", desc: "Market value vs realized value" },
  { label: "NVT Signal",           value: "82",         chg: "-4",     chgDir: "down", signal: "Neutral", desc: "Network value to transactions" },
  { label: "Funding Rate (BTC)",   value: "+0.012%/8h", chg: "Pos.",   chgDir: "up",   signal: "Caution", desc: "Perpetual futures premium" },
  { label: "Open Interest",        value: "$28.4B",     chg: "+2.1%",  chgDir: "up",   signal: "Caution", desc: "Total BTC futures OI" },
  { label: "Long/Short Ratio",     value: "1.24",       chg: "+0.06",  chgDir: "up",   signal: "Neutral", desc: "Binance futures L/S" },
  { label: "Stablecoin Supply",    value: "$168B",      chg: "+1.4%",  chgDir: "up",   signal: "Bullish", desc: "Dry powder on sidelines" },
  { label: "Active Addresses",     value: "1.12M/day",  chg: "+3.2%",  chgDir: "up",   signal: "Bullish", desc: "Unique BTC addresses" },
  { label: "ETH Staking APR",      value: "3.82%",      chg: "-0.04%", chgDir: "down", signal: "Neutral", desc: "Beacon chain staking yield" },
  { label: "DeFi TVL",             value: "$92.4B",     chg: "+2.8%",  chgDir: "up",   signal: "Bullish", desc: "Total value locked in DeFi" },
];

const SIGNAL_COLOR: Record<string, string> = {
  Bullish: "#36b37e",
  Bearish: "#ff5a5f",
  Neutral: "#ffab40",
  Caution: "#f97316",
};

interface Props {
  style?: React.CSSProperties;
}

export default function CryptoMetricsPanel({ style }: Props) {
  const bullish = METRICS.filter(m => m.signal === "Bullish").length;
  const bearish = METRICS.filter(m => m.signal === "Bearish").length;
  const caution = METRICS.filter(m => m.signal === "Caution").length;

  return (
    <div className="wv-market-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">On-Chain Metrics</span>
        <span style={{ fontSize: 9 }}>
          <span style={{ color: "#36b37e" }}>{bullish}B</span>
          <span style={{ color: "var(--wv-text-muted)" }}> / </span>
          <span style={{ color: "#f97316" }}>{caution}C</span>
          <span style={{ color: "var(--wv-text-muted)" }}> / </span>
          <span style={{ color: "#ff5a5f" }}>{bearish}S</span>
        </span>
        <span className="wv-market-panel-badge is-static">STATIC</span>
      </div>
      <div className="wv-market-panel-body" style={{ padding: 0 }}>
        <div className="wv-onchain-header">
          <span>METRIC</span>
          <span style={{ textAlign: "right" }}>VALUE</span>
          <span style={{ textAlign: "right" }}>CHG</span>
          <span>SIGNAL</span>
        </div>
        {METRICS.map((m) => (
          <div key={m.label} className="wv-onchain-row" title={m.desc}>
            <span style={{ color: "var(--wv-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</span>
            <span style={{ textAlign: "right", color: "var(--wv-text)", fontWeight: 600 }}>{m.value}</span>
            <span style={{ textAlign: "right", color: m.chgDir === "up" ? "#36b37e" : m.chgDir === "down" ? "#ff5a5f" : "var(--wv-text-muted)" }}>
              {m.chg}
            </span>
            <span>
              <span style={{ fontSize: 8.5, fontWeight: 700, color: SIGNAL_COLOR[m.signal] }}>{m.signal}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="wv-market-panel-footer">Glassnode · Dune Analytics · placeholder data</div>
    </div>
  );
}
