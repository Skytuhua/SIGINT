"use client";

import React from "react";
import { useMarketData } from "../../hooks/useMarketData";
import Term from "./shared/Term";
import type { HistoricalResponse } from "../../lib/server/news/providers/marketTypes";

const LABELS = ["S&P 500", "20Y Bond", "Gold", "Crude Oil", "Bitcoin", "USD Idx"];

// Static fallback correlation matrix
const STATIC_CORR: number[][] = [
  [ 1.00, -0.42,  0.08,  0.24,  0.52, -0.28 ],
  [-0.42,  1.00,  0.38, -0.18, -0.14,  0.12 ],
  [ 0.08,  0.38,  1.00,  0.14,  0.18, -0.52 ],
  [ 0.24, -0.18,  0.14,  1.00,  0.21, -0.38 ],
  [ 0.52, -0.14,  0.18,  0.21,  1.00, -0.08 ],
  [-0.28,  0.12, -0.52, -0.38, -0.08,  1.00 ],
];

const STATIC_ASSETS = ["SPY", "TLT", "GLD", "OIL", "BTC", "DXY"];

const EMPTY: HistoricalResponse = {
  series: {},
  correlations: STATIC_CORR,
  assets: STATIC_ASSETS,
  degraded: true,
};

function corrColor(v: number): string {
  if (v === 1) return "rgba(137,229,255,0.12)";
  if (v >  0.6) return "rgba(54,179,126,0.55)";
  if (v >  0.3) return "rgba(54,179,126,0.30)";
  if (v >  0.1) return "rgba(54,179,126,0.12)";
  if (v > -0.1) return "rgba(185,205,224,0.06)";
  if (v > -0.3) return "rgba(255,90,95,0.12)";
  if (v > -0.6) return "rgba(255,90,95,0.30)";
  return "rgba(255,90,95,0.55)";
}

function corrTextColor(v: number): string {
  if (v === 1) return "var(--si-text-muted)";
  if (Math.abs(v) > 0.3) return v > 0 ? "#36b37e" : "#ff5a5f";
  return "var(--si-text)";
}

interface Props {
  style?: React.CSSProperties;
}

export default function CorrelationMatrixPanel({ style }: Props) {
  const { data, isLive } = useMarketData<HistoricalResponse>(
    "/api/market/historical",
    30 * 60_000,
    EMPTY,
  );

  const assets = data.assets ?? STATIC_ASSETS;
  const corr = data.correlations ?? STATIC_CORR;
  const n = assets.length;

  return (
    <div className="si-market-panel" style={style}>
      <div className="si-market-panel-header">
        <span className="si-market-panel-title">Cross-Asset <Term id="CORRELATION">Correlation</Term></span>
        <span style={{ fontSize: 9, color: "var(--si-text-muted)" }}>30D Rolling · <Term id="CORRELATION">Pearson</Term></span>
        <span className={`si-market-panel-badge ${isLive ? "is-live" : "is-static"}`}>
          {isLive ? "LIVE" : "STATIC"}
        </span>
      </div>
      <div className="si-market-panel-body" style={{ padding: "8px 10px", overflow: "auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `52px repeat(${n}, 1fr)`,
            gap: 2,
            minWidth: 320,
          }}
        >
          {/* Header row */}
          <div style={{ height: 20 }} />
          {assets.map((a) => (
            <div key={a} style={{ textAlign: "center", fontSize: 9, color: "var(--si-text-muted)", fontWeight: 700, paddingBottom: 2 }}>
              {a}
            </div>
          ))}

          {/* Data rows */}
          {assets.map((rowAsset, i) => (
            <React.Fragment key={rowAsset}>
              <div style={{ fontSize: 9, color: "var(--si-text-muted)", alignSelf: "center", paddingRight: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {LABELS[i] ?? rowAsset}
              </div>
              {Array.from({ length: n }, (_, j) => {
                const v = corr[i]?.[j] ?? 0;
                const isDiag = i === j;
                return (
                  <div
                    key={j}
                    style={{
                      background: corrColor(v),
                      borderRadius: 2,
                      textAlign: "center",
                      fontSize: isDiag ? 9 : 9.5,
                      fontWeight: isDiag ? 400 : 600,
                      color: corrTextColor(v),
                      padding: "4px 2px",
                      lineHeight: 1,
                    }}
                    title={`${assets[i]} vs ${assets[j]}: ${v.toFixed(2)}`}
                  >
                    {isDiag ? "—" : v.toFixed(2)}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 8, marginTop: 8, fontSize: 8.5, color: "var(--si-text-muted)", flexWrap: "wrap" }}>
          {[
            { color: "rgba(54,179,126,0.5)", label: "Strong +" },
            { color: "rgba(54,179,126,0.2)", label: "Weak +" },
            { color: "rgba(185,205,224,0.08)", label: "None" },
            { color: "rgba(255,90,95,0.2)",  label: "Weak −" },
            { color: "rgba(255,90,95,0.5)",  label: "Strong −" },
          ].map(({ color, label }) => (
            <span key={label} style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ width: 10, height: 10, borderRadius: 1, background: color, display: "inline-block" }} />
              {label}
            </span>
          ))}
        </div>
      </div>
      <div className="si-market-panel-footer">
        {isLive ? "Yahoo Finance · 30D Pearson · 30min refresh" : "Static approximation"}
      </div>
    </div>
  );
}
