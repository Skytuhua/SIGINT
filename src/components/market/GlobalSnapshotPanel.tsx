"use client";

import React from "react";
import { useMarketData } from "../../hooks/useMarketData";
import type { QuotesResponse } from "../../lib/server/news/providers/marketTypes";
import Term from "./shared/Term";

type Scenario = "BASELINE" | "RISK-OFF" | "RATES UP" | "OIL SHOCK";

interface SnapshotRowDef {
  sym: string;
  yfSym: string;
  label: string;
  highlight?: Scenario[];
}

interface SnapshotGroupDef {
  id: string;
  label: string;
  col3Label: string;
  isRate?: boolean;
  rows: SnapshotRowDef[];
}

const GROUPS: SnapshotGroupDef[] = [
  {
    id: "indices",
    label: "INDICES",
    col3Label: "YTD%",
    rows: [
      { sym: "ES",   yfSym: "ES=F",     label: "S&P 500 Fut" },
      { sym: "NQ",   yfSym: "NQ=F",     label: "Nasdaq 100 Fut" },
      { sym: "RTY",  yfSym: "RTY=F",    label: "Russell 2000", highlight: ["RISK-OFF"] },
      { sym: "DAX",  yfSym: "^GDAXI",   label: "Germany 30" },
      { sym: "N225", yfSym: "^N225",    label: "Nikkei 225" },
    ],
  },
  {
    id: "fx",
    label: "FX",
    col3Label: "1W%",
    rows: [
      { sym: "EUR",  yfSym: "EURUSD=X", label: "EUR / USD", highlight: ["RISK-OFF"] },
      { sym: "USD",  yfSym: "JPY=X",    label: "USD / JPY", highlight: ["RATES UP"] },
      { sym: "GBP",  yfSym: "GBPUSD=X", label: "GBP / USD" },
      { sym: "DXY",  yfSym: "DX-Y.NYB", label: "USD Index", highlight: ["RISK-OFF", "RATES UP"] },
    ],
  },
  {
    id: "commodities",
    label: "COMMODITIES",
    col3Label: "1W%",
    rows: [
      { sym: "XAU",  yfSym: "GC=F",     label: "Gold", highlight: ["RISK-OFF"] },
      { sym: "XAG",  yfSym: "SI=F",     label: "Silver" },
      { sym: "WTI",  yfSym: "CL=F",     label: "Crude Oil WTI", highlight: ["OIL SHOCK"] },
      { sym: "NG",   yfSym: "NG=F",     label: "Natural Gas", highlight: ["OIL SHOCK"] },
    ],
  },
  {
    id: "rates",
    label: "RATES (UST)",
    col3Label: "1W Δ",
    isRate: true,
    rows: [
      { sym: "2Y",   yfSym: "^IRX",     label: "US 2Y Treasury", highlight: ["RATES UP"] },
      { sym: "5Y",   yfSym: "^FVX",     label: "US 5Y Treasury", highlight: ["RATES UP"] },
      { sym: "10Y",  yfSym: "^TNX",     label: "US 10Y Treasury", highlight: ["RATES UP"] },
      { sym: "30Y",  yfSym: "^TYX",     label: "US 30Y Treasury", highlight: ["RATES UP", "RISK-OFF"] },
    ],
  },
];

const SYM_TERM_MAP: Record<string, { id: string; label: string }> = {
  ES:  { id: "ES",  label: "ES" },
  NQ:  { id: "NQ",  label: "NQ" },
  RTY: { id: "RTY", label: "RTY" },
  YM:  { id: "YM",  label: "YM" },
  DXY: { id: "DXY", label: "DXY" },
  WTI: { id: "WTI", label: "WTI" },
  XAU: { id: "GC",  label: "Gold" },
};

function renderSym(sym: string) {
  const t = SYM_TERM_MAP[sym];
  return t ? <Term id={t.id}>{sym}</Term> : <>{sym}</>;
}

function renderLabel(sym: string, label: string) {
  if (sym === "XAU") return <><Term id="GC">Gold</Term></>;
  if (sym === "WTI") return <><Term id="WTI">Crude Oil WTI</Term></>;
  if (label === "Brent Crude" || label === "Brent") return <Term id="BRENT">{label}</Term>;
  return <>{label}</>;
}

const ALL_YF_SYMBOLS = GROUPS.flatMap((g) => g.rows.map((r) => r.yfSym));
const ENDPOINT = `/api/market/quotes?symbols=${ALL_YF_SYMBOLS.join(",")}`;

const EMPTY: QuotesResponse = { quotes: {}, degraded: true, timestamp: "" };

interface Props {
  scenario?: Scenario;
  style?: React.CSSProperties;
  onTickerClick?: (sym: string) => void;
}

export default function GlobalSnapshotPanel({ scenario = "BASELINE", style, onTickerClick }: Props) {
  const { data, isLive } = useMarketData<QuotesResponse>(ENDPOINT, 60_000, EMPTY);
  const quotes = data.quotes ?? {};

  return (
    <div className="si-market-panel" style={style}>
      <div className="si-market-panel-header">
        <span className="si-market-panel-title">Global Snapshot</span>
        <span className={`si-market-panel-badge ${isLive ? "is-live" : "is-static"}`}>
          {isLive ? "LIVE" : "STATIC"}
        </span>
      </div>
      <div className="si-market-panel-body" style={{ padding: 0 }}>
        {GROUPS.map((group) => (
          <div key={group.id}>
            <div className="si-market-snap-group-label">
              <span>{group.label}</span>
              <span style={{ marginLeft: "auto" }}>{group.col3Label === "YTD%" ? <><Term id="YTD">YTD</Term>%</> : group.col3Label}</span>
            </div>
            {group.rows.map((row) => {
              const q = quotes[row.yfSym];
              const price = q?.price ?? 0;
              const dayPct = q?.changePercent ?? 0;
              const isHighlighted = scenario !== "BASELINE" && row.highlight?.includes(scenario);
              const sign = dayPct > 0 ? "+" : "";
              const chgClass = dayPct > 0 ? "is-up" : dayPct < 0 ? "is-down" : "is-flat";

              let priceStr: string;
              if (group.isRate) {
                priceStr = `${price.toFixed(2)}%`;
              } else if (price >= 1000) {
                priceStr = price.toLocaleString("en-US", { maximumFractionDigits: 0 });
              } else {
                priceStr = price.toFixed(price < 10 ? 4 : 2);
              }

              return (
                <div
                  key={row.sym}
                  className="si-market-snap-row"
                  style={{
                    ...(isHighlighted ? { background: "rgba(255,171,64,0.07)" } : {}),
                    cursor: onTickerClick ? "pointer" : "default",
                  }}
                  onClick={() => onTickerClick?.(row.sym)}
                >
                  <span className="si-market-snap-sym">{renderSym(row.sym)}</span>
                  <span className="si-market-snap-name" title={row.label}>{renderLabel(row.sym, row.label)}</span>
                  <span className="si-market-snap-price">{q ? priceStr : "—"}</span>
                  <span className={`si-market-snap-chg ${chgClass}`}>
                    {q ? `${sign}${dayPct.toFixed(2)}%` : "—"}
                  </span>
                  <span className="si-market-snap-col3">
                    <span style={{ color: "var(--si-text-muted)" }}>—</span>
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="si-market-panel-footer">
        {isLive ? "Yahoo Finance · 60s refresh" : "Waiting for data…"}
      </div>
    </div>
  );
}
