"use client";

import { useState, useEffect, useRef } from "react";
import { useMarketData } from "../../hooks/useMarketData";
import type { QuotesResponse } from "../../lib/server/news/providers/marketTypes";

const LS_KEY = "si-market-watchlist";
const EMPTY: QuotesResponse = { quotes: {}, degraded: true, timestamp: "" };

function loadWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveWatchlist(list: string[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}

function fmtVol(v: number | undefined): string {
  if (v == null || v === 0) return "—";
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(v);
}

function fmtCap(v: number | undefined): string {
  if (v == null || v === 0) return "—";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v}`;
}

interface Props {
  style?: React.CSSProperties;
  onTickerClick?: (sym: string) => void;
}

export default function EquityWatchlistPanel({ style, onTickerClick }: Props) {
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [addInput, setAddInput] = useState("");
  const [addErr, setAddErr] = useState("");
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      setWatchlist(loadWatchlist());
    }
  }, []);

  useEffect(() => {
    if (initialized.current) saveWatchlist(watchlist);
  }, [watchlist]);

  const endpoint = watchlist.length > 0
    ? `/api/market/quotes?symbols=${watchlist.join(",")}`
    : "";

  const { data, isLive } = useMarketData<QuotesResponse>(
    endpoint || "/api/market/quotes?symbols=_NOOP_",
    30_000,
    EMPTY
  );

  const quotes = data.quotes ?? {};

  function addTicker() {
    setAddErr("");
    const sym = addInput.trim().toUpperCase();
    if (!sym) { setAddErr("Enter a symbol"); return; }
    if (sym.length > 10) { setAddErr("Symbol too long"); return; }
    if (watchlist.includes(sym)) { setAddErr("Already in watchlist"); return; }
    if (watchlist.length >= 20) { setAddErr("Max 20 tickers"); return; }
    setWatchlist((prev) => [...prev, sym]);
    setAddInput("");
  }

  function removeTicker(sym: string) {
    setWatchlist((prev) => prev.filter((s) => s !== sym));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") addTicker();
  }

  const GRID = "60px 1fr 72px 68px 68px 72px 90px 24px";

  return (
    <div className="si-market-panel" style={style}>
      <div className="si-market-panel-header">
        <span className="si-market-panel-title">Watchlist ({watchlist.length})</span>
        <span style={{ fontSize: 9, color: "var(--si-text-muted)", letterSpacing: "0.04em" }}>PERSONAL TRACKER</span>
        {watchlist.length > 0 && (
          <span className={`si-market-panel-badge ${isLive ? "is-live" : "is-static"}`}>
            {isLive ? "LIVE" : "STATIC"}
          </span>
        )}
      </div>
      <div className="si-market-panel-body" style={{ padding: 0 }}>
        {watchlist.length > 0 && (
          <div
            className="si-market-movers-col-header"
            style={{ display: "grid", gridTemplateColumns: GRID, padding: "4px 10px" }}
          >
            <span>SYM</span>
            <span>NAME</span>
            <span style={{ textAlign: "right" }}>PRICE</span>
            <span style={{ textAlign: "right" }}>CHG%</span>
            <span style={{ textAlign: "right" }}>VOLUME</span>
            <span style={{ textAlign: "right" }}>MKTCAP</span>
            <span style={{ textAlign: "center" }}>DAY RANGE</span>
            <span></span>
          </div>
        )}
        {watchlist.length === 0 && (
          <div style={{ padding: "16px 12px", fontSize: 10, color: "var(--si-text-muted)", fontStyle: "italic" }}>
            Add tickers to track their prices in real-time. Supports stocks, ETFs, and indices.
          </div>
        )}
        {watchlist.map((sym) => {
          const q = quotes[sym];
          const price = q?.price;
          const chgPct = q?.changePercent ?? 0;
          const chgClass = chgPct > 0 ? "is-up" : chgPct < 0 ? "is-down" : "is-flat";
          const sign = chgPct > 0 ? "+" : "";
          const dayLow = q?.dayLow;
          const dayHigh = q?.dayHigh;
          const volume = q?.volume;
          const marketCap = q?.marketCap;
          const rangePct = (dayLow && dayHigh && price && dayHigh > dayLow)
            ? ((price - dayLow) / (dayHigh - dayLow)) * 100
            : 50;

          return (
            <div
              key={sym}
              style={{
                display: "grid", gridTemplateColumns: GRID,
                padding: "5px 10px", borderBottom: "1px solid rgba(185,205,224,0.06)",
                alignItems: "center",
              }}
            >
              <span
                style={{ color: "#89e5ff", fontWeight: 700, fontSize: 11, cursor: onTickerClick ? "pointer" : "default" }}
                onClick={() => onTickerClick?.(sym)}
              >
                {sym}
              </span>
              <span style={{ fontSize: 9, color: "var(--si-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {q?.name ?? ""}
              </span>
              <span style={{ textAlign: "right", fontSize: 11, fontWeight: 600 }}>
                {price != null ? `$${price.toFixed(2)}` : "—"}
              </span>
              <span style={{ textAlign: "right", fontSize: 11, fontWeight: 600 }} className={chgClass}>
                {q ? `${sign}${chgPct.toFixed(2)}%` : "—"}
              </span>
              <span style={{ textAlign: "right", fontSize: 10, color: "var(--si-text-muted)" }}>
                {fmtVol(volume)}
              </span>
              <span style={{ textAlign: "right", fontSize: 10, color: "var(--si-text-muted)" }}>
                {fmtCap(marketCap)}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "center" }}>
                {dayLow && dayHigh ? (
                  <>
                    <span style={{ fontSize: 8, color: "var(--si-text-muted)" }}>{dayLow.toFixed(0)}</span>
                    <span style={{
                      flex: 1, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2,
                      position: "relative", maxWidth: 50,
                    }}>
                      <span style={{
                        position: "absolute", left: 0, top: 0, height: "100%", borderRadius: 2,
                        width: `${Math.min(100, Math.max(0, rangePct))}%`,
                        background: chgPct >= 0 ? "rgba(54,179,126,0.6)" : "rgba(255,90,95,0.6)",
                      }} />
                    </span>
                    <span style={{ fontSize: 8, color: "var(--si-text-muted)" }}>{dayHigh.toFixed(0)}</span>
                  </>
                ) : (
                  <span style={{ fontSize: 8, color: "var(--si-text-muted)" }}>—</span>
                )}
              </span>
              <span>
                <button
                  className="si-port-del-btn"
                  onClick={() => removeTicker(sym)}
                  title={`Remove ${sym}`}
                >
                  ✕
                </button>
              </span>
            </div>
          );
        })}

        {/* Add form */}
        <div style={{ padding: "8px 10px", borderTop: "1px solid var(--si-line)" }}>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <input
              className="si-order-input"
              placeholder="AAPL, MSFT..."
              style={{ width: 90 }}
              value={addInput}
              onChange={(e) => setAddInput(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
            />
            <button
              className="si-order-send-btn buy"
              style={{ flex: "none", padding: "4px 12px", fontSize: 10 }}
              onClick={addTicker}
            >
              + ADD
            </button>
          </div>
          {addErr && <div style={{ fontSize: 9, color: "#ff5a5f", marginTop: 3 }}>{addErr}</div>}
        </div>
      </div>
      <div className="si-market-panel-footer">
        {isLive && watchlist.length > 0 ? "Yahoo Finance · 30s refresh · Volume · Market Cap · Day Range" : "Add tickers to begin tracking"}
      </div>
    </div>
  );
}
