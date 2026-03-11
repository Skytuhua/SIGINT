"use client";

import React, { useState, useMemo } from "react";
import { SCREENER_UNIVERSE, type ScreenerRow } from "./shared/screenerData";
import Term from "./shared/Term";

interface Props {
  onTickerClick?: (sym: string) => void;
}

const COLORS = ["#89e5ff", "#c084fc", "#ffab40"];

interface MetricDef {
  key: keyof ScreenerRow;
  label: string;
  fmt: (v: number | null | undefined) => string;
  higherBetter: boolean;
}

const METRICS: MetricDef[] = [
  { key: "price", label: "Price", fmt: (v) => v != null ? `$${(v as number).toFixed(2)}` : "—", higherBetter: true },
  { key: "marketCapB", label: "Mkt Cap", fmt: (v) => v != null ? (v as number >= 1000 ? `${((v as number) / 1000).toFixed(1)}T` : `${(v as number).toFixed(0)}B`) : "—", higherBetter: true },
  { key: "pe", label: "P/E", fmt: (v) => v != null ? (v as number).toFixed(1) : "N/A", higherBetter: false },
  { key: "ps", label: "P/S", fmt: (v) => v != null ? (v as number).toFixed(1) : "—", higherBetter: false },
  { key: "roe", label: "ROE %", fmt: (v) => v != null ? `${(v as number).toFixed(0)}%` : "N/A", higherBetter: true },
  { key: "grossMarginPct", label: "Gross Margin", fmt: (v) => v != null ? `${(v as number).toFixed(0)}%` : "—", higherBetter: true },
  { key: "beta", label: "Beta", fmt: (v) => v != null ? (v as number).toFixed(2) : "—", higherBetter: false },
  { key: "divYield", label: "Div Yield", fmt: (v) => v != null ? `${(v as number).toFixed(2)}%` : "—", higherBetter: true },
  { key: "chg1d", label: "1D Change", fmt: (v) => v != null ? `${(v as number) > 0 ? "+" : ""}${(v as number).toFixed(2)}%` : "—", higherBetter: true },
  { key: "chg1w", label: "1W Change", fmt: (v) => v != null ? `${(v as number) > 0 ? "+" : ""}${(v as number).toFixed(2)}%` : "—", higherBetter: true },
];

export default function StockComparisonPanel({ onTickerClick }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestions = useMemo(() => {
    if (!searchInput.trim()) return [];
    const q = searchInput.toUpperCase();
    return SCREENER_UNIVERSE
      .filter((r) => !selected.includes(r.sym) && (r.sym.includes(q) || r.name.toUpperCase().includes(q)))
      .slice(0, 6);
  }, [searchInput, selected]);

  function addTicker(sym: string) {
    if (selected.length >= 3 || selected.includes(sym)) return;
    setSelected((prev) => [...prev, sym]);
    setSearchInput("");
    setShowSuggestions(false);
  }

  function removeTicker(sym: string) {
    setSelected((prev) => prev.filter((s) => s !== sym));
  }

  const stocks = useMemo(() =>
    selected.map((sym) => SCREENER_UNIVERSE.find((r) => r.sym === sym)).filter(Boolean) as ScreenerRow[],
    [selected]
  );

  function bestIdx(metric: MetricDef): number {
    if (stocks.length < 2) return -1;
    const vals = stocks.map((s) => s[metric.key] as number | null | undefined);
    let bestI = -1;
    let bestV: number | null = null;
    vals.forEach((v, i) => {
      if (v == null) return;
      if (bestV == null || (metric.higherBetter ? v > bestV : v < bestV)) {
        bestV = v;
        bestI = i;
      }
    });
    return bestI;
  }

  return (
    <div className="si-market-panel" style={{ marginBottom: 8 }}>
      <div className="si-market-panel-header">
        <span className="si-market-panel-title">Stock Comparison</span>
        <span style={{ fontSize: 9, color: "var(--si-text-muted)" }}>
          {selected.length}/3 SELECTED
        </span>
      </div>
      <div className="si-market-panel-body" style={{ padding: "10px 12px" }}>
        {/* Ticker selector */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          {selected.map((sym, i) => (
            <span key={sym} style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "3px 8px", borderRadius: 3, fontSize: 10, fontWeight: 700,
              background: "rgba(137,229,255,0.1)", color: COLORS[i],
              border: `1px solid ${COLORS[i]}40`,
            }}>
              <span style={{ cursor: onTickerClick ? "pointer" : "default" }} onClick={() => onTickerClick?.(sym)}>
                {sym}
              </span>
              <button
                onClick={() => removeTicker(sym)}
                style={{ background: "none", border: "none", color: "var(--si-text-muted)", cursor: "pointer", fontSize: 10, padding: 0, lineHeight: 1 }}
              >
                ✕
              </button>
            </span>
          ))}
          {selected.length < 3 && (
            <div style={{ position: "relative" }}>
              <input
                className="si-order-input"
                placeholder="Add ticker..."
                style={{ width: 110 }}
                value={searchInput}
                onChange={(e) => { setSearchInput(e.target.value.toUpperCase()); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              />
              {showSuggestions && suggestions.length > 0 && (
                <div style={{
                  position: "absolute", top: "100%", left: 0, zIndex: 50,
                  background: "var(--si-market-panel-bg, #1a1e2e)", border: "1px solid var(--si-line)",
                  borderRadius: 3, maxHeight: 160, overflowY: "auto", width: 200,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                }}>
                  {suggestions.map((r) => (
                    <div
                      key={r.sym}
                      style={{
                        padding: "5px 8px", cursor: "pointer", fontSize: 10,
                        display: "flex", justifyContent: "space-between",
                      }}
                      onMouseDown={() => addTicker(r.sym)}
                    >
                      <span style={{ color: "#89e5ff", fontWeight: 700 }}>{r.sym}</span>
                      <span style={{ color: "var(--si-text-muted)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Comparison table */}
        {stocks.length >= 2 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "4px 8px", color: "var(--si-text-muted)", fontSize: 9, borderBottom: "1px solid var(--si-line)" }}>METRIC</th>
                  {stocks.map((s, i) => (
                    <th key={s.sym} style={{ textAlign: "right", padding: "4px 8px", color: COLORS[i], fontWeight: 700, fontSize: 10, borderBottom: "1px solid var(--si-line)" }}>
                      {s.sym}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METRICS.map((m) => {
                  const best = bestIdx(m);
                  return (
                    <tr key={m.key as string}>
                      <td style={{ padding: "4px 8px", color: "var(--si-text-muted)", fontSize: 9, borderBottom: "1px solid rgba(185,205,224,0.06)" }}>
                        <Term id={m.key as string}>{m.label}</Term>
                      </td>
                      {stocks.map((s, i) => {
                        const val = s[m.key] as number | null | undefined;
                        const isBest = i === best;
                        return (
                          <td key={s.sym} style={{
                            textAlign: "right", padding: "4px 8px", fontWeight: 600,
                            color: isBest ? "#36b37e" : "var(--si-text)",
                            borderBottom: "1px solid rgba(185,205,224,0.06)",
                          }}>
                            {m.fmt(val)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Bar chart for key metrics */}
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 9, color: "var(--si-text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Visual Comparison</div>
              {(["roe", "grossMarginPct", "divYield"] as (keyof ScreenerRow)[]).map((key) => {
                const mDef = METRICS.find((m) => m.key === key);
                if (!mDef) return null;
                const vals = stocks.map((s) => (s[key] as number) ?? 0);
                const maxVal = Math.max(...vals.map(Math.abs), 1);
                return (
                  <div key={key as string} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 9, color: "var(--si-text-muted)", marginBottom: 3 }}>{mDef.label}</div>
                    {stocks.map((s, i) => {
                      const v = (s[key] as number) ?? 0;
                      return (
                        <div key={s.sym} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: 9, color: COLORS[i], width: 36, fontWeight: 700 }}>{s.sym}</span>
                          <div style={{ flex: 1, height: 6, background: "rgba(185,205,224,0.08)", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${(Math.abs(v) / maxVal) * 100}%`, background: COLORS[i], borderRadius: 2, opacity: 0.7 }} />
                          </div>
                          <span style={{ fontSize: 9, color: "var(--si-text)", width: 40, textAlign: "right" }}>{mDef.fmt(v)}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 10, color: "var(--si-text-muted)", fontStyle: "italic", padding: "8px 0" }}>
            Select at least 2 stocks to compare fundamentals side-by-side
          </div>
        )}
      </div>
      <div className="si-market-panel-footer">
        Static fundamentals · Compare up to 3 stocks
      </div>
    </div>
  );
}
