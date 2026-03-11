"use client";

import React from "react";
import { useMarketData } from "../../hooks/useMarketData";
import type { QuotesResponse } from "../../lib/server/news/providers/marketTypes";
import Term from "./shared/Term";

interface VolDef {
  sym: string;
  yfSym: string;
  name: string;
  thresholds: { low: number; elevated: number };
}

const VOL_DEFS: VolDef[] = [
  { sym: "VIX",  yfSym: "^VIX",   name: "S&P 500 Vol Index", thresholds: { low: 16, elevated: 25 } },
  { sym: "VVIX", yfSym: "^VVIX",  name: "Vol of VIX",        thresholds: { low: 85, elevated: 110 } },
  { sym: "MOVE", yfSym: "^MOVE",  name: "Bond Market Vol",   thresholds: { low: 80, elevated: 120 } },
  { sym: "OVX",  yfSym: "^OVX",   name: "Oil Volatility",    thresholds: { low: 25, elevated: 40 } },
  { sym: "GVZ",  yfSym: "^GVZ",   name: "Gold Volatility",   thresholds: { low: 14, elevated: 22 } },
  { sym: "EVZ",  yfSym: "^EVZ",   name: "FX Volatility",     thresholds: { low: 8, elevated: 12 } },
];

const ALL_YF_SYMS = VOL_DEFS.map((d) => d.yfSym);
const ENDPOINT = `/api/market/quotes?symbols=${ALL_YF_SYMS.join(",")}`;

const EMPTY: QuotesResponse = { quotes: {}, degraded: true, timestamp: "" };

function riskLabel(level: number, t: { low: number; elevated: number }): { label: string; color: string } {
  if (level <= t.low) return { label: "LOW", color: "#36b37e" };
  if (level <= t.elevated) return { label: "NORMAL", color: "#89e5ff" };
  return { label: "ELEVATED", color: "#ffab40" };
}

interface Props {
  style?: React.CSSProperties;
}

export default function VolatilityPanel({ style }: Props) {
  const { data, isLive } = useMarketData<QuotesResponse>(ENDPOINT, 60_000, EMPTY);
  const quotes = data.quotes ?? {};

  const vixQ = quotes["^VIX"];
  const vixLevel = vixQ?.price ?? 0;
  const regime = vixLevel > 0 && vixLevel <= 20 ? "RISK-ON" : "RISK-OFF";
  const regimeClass = regime === "RISK-ON" ? "is-risk-on" : "is-risk-off";

  return (
    <div className="si-market-panel" style={style}>
      <div className="si-market-panel-header">
        <span className="si-market-panel-title">Volatility</span>
        <span style={{ fontSize: 9, color: "var(--si-text-muted)", letterSpacing: "0.04em" }}>FEAR GAUGES</span>
        <span className={`si-market-panel-badge ${isLive ? "is-live" : "is-static"}`}>
          {isLive ? "LIVE" : "STATIC"}
        </span>
      </div>
      <div className="si-market-panel-body" style={{ padding: 0 }}>
        <div className="si-market-vol-col-header">
          <span>SYM</span>
          <span>NAME</span>
          <span style={{ textAlign: "right" }}>LEVEL</span>
          <span style={{ textAlign: "right" }}>CHG%</span>
          <span style={{ textAlign: "right" }}>RISK</span>
        </div>
        {VOL_DEFS.map((def) => {
          const q = quotes[def.yfSym];
          const level = q?.price ?? 0;
          const chg = q?.changePercent ?? 0;
          const risk = riskLabel(level, def.thresholds);
          const chgClass = chg > 0 ? "is-up" : chg < 0 ? "is-down" : "is-flat";
          const sign = chg > 0 ? "+" : "";
          return (
            <div key={def.sym} className="si-market-vol-row">
              <span className="si-market-vol-sym"><Term id={def.sym}>{def.sym}</Term></span>
              <span className="si-market-vol-name" title={def.name}>{def.name}</span>
              <span className="si-market-vol-level">{q ? level.toFixed(1) : "—"}</span>
              <span className={`si-market-vol-chg ${chgClass}`}>
                {q ? `${sign}${chg.toFixed(2)}%` : "—"}
              </span>
              <span className="si-market-vol-risk" style={{ color: risk.color }}>
                {q ? risk.label : "—"}
              </span>
            </div>
          );
        })}
        {vixQ && (
          <div className={`si-market-vol-regime ${regimeClass}`}>
            <span>REGIME:</span>
            <span className="si-market-vol-regime-label"><Term id={regime === "RISK-ON" ? "RISK_ON" : "RISK_OFF"}>{regime}</Term></span>
            <span style={{ marginLeft: "auto", color: "var(--si-text-muted)" }}>
              {regime === "RISK-ON" ? "Stocks↑ · Bonds↑ · Gold↓" : "Stocks↓ · Bonds↑ · Gold↑"}
            </span>
          </div>
        )}
      </div>
      <div className="si-market-panel-footer">
        {isLive ? "CBOE · Yahoo Finance · 60s refresh" : "Waiting for data…"}
      </div>
    </div>
  );
}
