"use client";

import { useState } from "react";
import React from "react";
import { useMarketData } from "../../hooks/useMarketData";
import type { MoversResponse, MoverRow } from "../../lib/server/news/providers/marketTypes";
import { SCREENER_UNIVERSE } from "./shared/screenerData";

/* ── Static FX data (Yahoo doesn't provide FX movers easily) ───── */
const FX_GAINERS: MoverRow[] = [
  { sym: "JPY",  name: "Japanese Yen", pct:  0.58, price: "148.92",   volMult: "—", reason: "BOJ hawkish signal" },
  { sym: "CHF",  name: "Swiss Franc",  pct:  0.41, price: "0.8842",   volMult: "—", reason: "Risk-off safe haven flow" },
  { sym: "GBP",  name: "Pound",        pct:  0.22, price: "1.2648",   volMult: "—", reason: "UK services PMI beat" },
  { sym: "AUD",  name: "Aussie Dollar",pct:  0.14, price: "0.6521",   volMult: "—", reason: "China stimulus optimism" },
  { sym: "NOK",  name: "Norwegian Kr", pct:  0.08, price: "10.42",    volMult: "—", reason: "Oil price recovery" },
  { sym: "SGD",  name: "Singapore $",  pct:  0.05, price: "1.3388",   volMult: "—", reason: "MAS steady stance" },
];

const FX_LOSERS: MoverRow[] = [
  { sym: "TRY",  name: "Turkish Lira", pct: -1.24, price: "32.14",    volMult: "—", reason: "CBRT rate hold surprise" },
  { sym: "BRL",  name: "Brazilian R$", pct: -0.88, price: "4.98",     volMult: "—", reason: "Fiscal concerns" },
  { sym: "ZAR",  name: "S African Rand",pct:-0.62, price: "18.92",    volMult: "—", reason: "Commodity drag" },
  { sym: "MXN",  name: "Mexican Peso", pct: -0.44, price: "17.14",    volMult: "—", reason: "Nearshoring uncertainty" },
  { sym: "CLP",  name: "Chilean Peso", pct: -0.32, price: "948.50",   volMult: "—", reason: "Copper slide" },
  { sym: "HUF",  name: "Hungarian Ft", pct: -0.28, price: "364.20",   volMult: "—", reason: "EU funding freeze" },
];

// Build sym → marketCapB lookup from screener universe
const MCAP_MAP: Record<string, number> = {};
for (const s of SCREENER_UNIVERSE) MCAP_MAP[s.sym] = s.marketCapB;

function fmtMcap(b: number | undefined): string {
  if (!b) return "—";
  if (b >= 1000) return `$${(b / 1000).toFixed(1)}T`;
  if (b >= 1) return `$${b.toFixed(0)}B`;
  return `$${(b * 1000).toFixed(0)}M`;
}

type TabType = "GAINERS" | "LOSERS";

const EMPTY_MOVERS: MoversResponse = { gainers: [], losers: [], degraded: true, timestamp: "" };

interface Props {
  filter?: "equity" | "fx" | "all";
  style?: React.CSSProperties;
  onTickerClick?: (sym: string) => void;
}

export default function TopMoversPanel({ filter = "equity", style, onTickerClick }: Props) {
  const [tab, setTab] = useState<TabType>("GAINERS");
  const isFx = filter === "fx";

  // Only fetch for equity movers
  const { data, isLive } = useMarketData<MoversResponse>(
    "/api/market/movers",
    120_000,
    EMPTY_MOVERS,
  );

  let gainers: MoverRow[];
  let losers: MoverRow[];

  if (isFx) {
    gainers = FX_GAINERS;
    losers = FX_LOSERS;
  } else {
    gainers = (data.gainers ?? []).map((r) => ({ ...r, mcapB: r.mcapB ?? MCAP_MAP[r.sym] }));
    losers = (data.losers ?? []).map((r) => ({ ...r, mcapB: r.mcapB ?? MCAP_MAP[r.sym] }));
  }

  const rows = tab === "GAINERS" ? gainers : losers;
  const live = isFx ? false : isLive;

  return (
    <div className="wv-market-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">Top Movers</span>
        <div className="wv-market-movers-tabs">
          {(["GAINERS", "LOSERS"] as TabType[]).map((t) => (
            <button
              key={t}
              className={`wv-market-movers-tab${tab === t ? " is-active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <span className={`wv-market-panel-badge ${live ? "is-live" : "is-static"}`}>
          {live ? "LIVE" : "STATIC"}
        </span>
      </div>
      <div className="wv-market-panel-body" style={{ padding: 0 }}>
        <div className={`wv-market-movers-col-header ${isFx ? "is-fx" : ""}`}>
          <span>SYM</span>
          <span>NAME</span>
          <span style={{ textAlign: "right" }}>PRICE</span>
          <span style={{ textAlign: "right" }}>CHG%</span>
          {!isFx && <span style={{ textAlign: "right" }}>MCAP</span>}
          {!isFx && <span style={{ textAlign: "right" }}>VOL</span>}
        </div>
        {rows.length === 0 && (
          <div style={{ padding: "16px 10px", fontSize: 10, color: "var(--wv-text-muted)", textAlign: "center" }}>
            Waiting for data…
          </div>
        )}
        {rows.map((row) => {
          const chgClass = row.pct > 0 ? "is-up" : "is-down";
          const sign = row.pct > 0 ? "+" : "";
          return (
            <div key={row.sym} className={`wv-market-movers-row ${isFx ? "is-fx" : ""}`} style={{ cursor: onTickerClick ? "pointer" : "default" }} onClick={() => onTickerClick?.(row.sym)}>
              <span className="wv-market-movers-sym">{row.sym}</span>
              <span className="wv-market-movers-name-col">
                <span className="wv-market-movers-name" title={row.name}>{row.name}</span>
                {row.reason && <span className="wv-market-movers-reason">{row.reason}</span>}
              </span>
              <span className="wv-market-movers-price">{row.price || "—"}</span>
              <span className={`wv-market-movers-pct ${chgClass}`}>{sign}{row.pct.toFixed(2)}%</span>
              {!isFx && <span className="wv-market-movers-mcap">{fmtMcap(row.mcapB)}</span>}
              {!isFx && <span className="wv-market-movers-vol">{row.volMult}</span>}
            </div>
          );
        })}
      </div>
      <div className="wv-market-panel-footer">
        {live ? "Yahoo Finance · 2min refresh" : isFx ? "FX static data" : "Waiting for data…"}
      </div>
    </div>
  );
}
