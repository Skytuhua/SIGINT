"use client";

import React from "react";
import { useMarketData } from "../../hooks/useMarketData";
import type { EarningsResponse, EarningsEntry } from "../../lib/server/news/providers/marketTypes";

type Surprise = "beat" | "miss" | "in-line" | null;

const SURPRISE_STYLE: Record<NonNullable<Surprise>, { cls: string; label: string }> = {
  "beat":    { cls: "is-beat",   label: "BEAT" },
  "miss":    { cls: "is-miss",   label: "MISS" },
  "in-line": { cls: "is-inline", label: "≈LINE" },
};

const EMPTY: EarningsResponse = { upcoming: [], recent: [], degraded: true };

interface Props {
  style?: React.CSSProperties;
  onTickerClick?: (sym: string) => void;
}

export default function EarningsTracker({ style, onTickerClick }: Props) {
  const { data, isLive } = useMarketData<EarningsResponse>("/api/market/earnings", 15 * 60_000, EMPTY);

  const upcoming = data.upcoming ?? [];
  const recent = data.recent ?? [];
  const hasData = upcoming.length > 0 || recent.length > 0;

  return (
    <div className="wv-market-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">Earnings Tracker</span>
        <span style={{ fontSize: 9, color: "var(--wv-text-muted)", letterSpacing: "0.04em" }}>
          BMO = pre-market · AMC = after-market
        </span>
        <span className={`wv-market-panel-badge ${isLive ? "is-live" : "is-static"}`}>
          {isLive ? "LIVE" : "STATIC"}
        </span>
      </div>
      <div className="wv-market-panel-body" style={{ padding: 0 }}>
        {!hasData && (
          <div style={{ padding: "16px 10px", fontSize: 10, color: "var(--wv-text-muted)", textAlign: "center" }}>
            Waiting for earnings data…
          </div>
        )}

        {upcoming.length > 0 && (
          <>
            <div className="wv-market-earn-section-label" style={{ color: "#89e5ff" }}>
              UPCOMING
            </div>
            {upcoming.map((e: EarningsEntry) => (
              <div
                key={`${e.sym}-${e.date}`}
                className="wv-market-earn-row"
                style={{ cursor: onTickerClick ? "pointer" : "default" }}
                onClick={() => onTickerClick?.(e.sym)}
              >
                <span className="wv-market-earn-time">{e.time}</span>
                <span
                  className="wv-market-earn-dot"
                  style={{ background: "var(--wv-text-muted)", width: 5, height: 5, borderRadius: "50%", display: "inline-block", flexShrink: 0 }}
                />
                <span className="wv-market-earn-sym">{e.sym}</span>
                <span className="wv-market-earn-company" title={e.company}>{e.company}</span>
                <span className="wv-market-earn-eps-est">EST {e.epsEst}</span>
              </div>
            ))}
          </>
        )}

        {recent.length > 0 && (
          <>
            <div className="wv-market-earn-section-label" style={{ color: "var(--wv-text-muted)", marginTop: 2 }}>
              RECENT
            </div>
            {recent.map((e: EarningsEntry) => {
              const s = e.surprise ? SURPRISE_STYLE[e.surprise] : null;
              return (
                <div
                  key={`${e.sym}-${e.date}`}
                  className="wv-market-earn-row"
                  style={{ cursor: onTickerClick ? "pointer" : "default" }}
                  onClick={() => onTickerClick?.(e.sym)}
                >
                  <span className="wv-market-earn-time">{e.date}</span>
                  <span
                    className="wv-market-earn-dot"
                    style={{
                      background: e.surprise === "beat" ? "#36b37e" : e.surprise === "miss" ? "#ff5a5f" : "var(--wv-text-muted)",
                      width: 5, height: 5, borderRadius: "50%", display: "inline-block", flexShrink: 0,
                    }}
                  />
                  <span className="wv-market-earn-sym">{e.sym}</span>
                  <span className="wv-market-earn-company">{e.epsAct ?? "—"}</span>
                  {s && <span className={`wv-market-earn-surprise ${s.cls}`}>{s.label}</span>}
                </div>
              );
            })}
          </>
        )}
      </div>
      <div className="wv-market-panel-footer">
        {isLive ? "Yahoo Finance · 15min refresh" : "Waiting for data…"}
      </div>
    </div>
  );
}
