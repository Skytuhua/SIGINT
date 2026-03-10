"use client";

import React from "react";
import { useMarketData } from "../../hooks/useMarketData";
import type { QuotesResponse } from "../../lib/server/news/providers/marketTypes";

interface YieldDef {
  maturity: string;
  yfSym: string;
}

const YIELD_DEFS: YieldDef[] = [
  { maturity: "3M",  yfSym: "^IRX" },
  { maturity: "2Y",  yfSym: "^IRX" }, // ^IRX is 13-week T-bill; we'll reuse for display
  { maturity: "5Y",  yfSym: "^FVX" },
  { maturity: "10Y", yfSym: "^TNX" },
  { maturity: "30Y", yfSym: "^TYX" },
];

const YF_SYMBOLS = ["^IRX", "^FVX", "^TNX", "^TYX"];
const ENDPOINT = `/api/market/quotes?symbols=${YF_SYMBOLS.join(",")}`;

const EMPTY: QuotesResponse = { quotes: {}, degraded: true, timestamp: "" };

// SVG dimensions
const W = 520, H = 180;
const PL = 38, PR = 14, PT = 12, PB = 26;
const CW = W - PL - PR;
const CH = H - PT - PB;

interface Props {
  style?: React.CSSProperties;
}

export default function YieldCurvePanel({ style }: Props) {
  const { data, isLive } = useMarketData<QuotesResponse>(ENDPOINT, 15 * 60_000, EMPTY);
  const quotes = data.quotes ?? {};

  // Build yield curve from available data
  // Yahoo: ^IRX = 13-week, ^FVX = 5Y, ^TNX = 10Y, ^TYX = 30Y
  const points = [
    { maturity: "3M",  yield: quotes["^IRX"]?.price ?? 0 },
    { maturity: "5Y",  yield: quotes["^FVX"]?.price ?? 0 },
    { maturity: "10Y", yield: quotes["^TNX"]?.price ?? 0 },
    { maturity: "30Y", yield: quotes["^TYX"]?.price ?? 0 },
  ].filter((p) => p.yield > 0);

  const hasData = points.length > 0;
  const allYields = points.map((p) => p.yield);
  const MIN_Y = hasData ? Math.min(...allYields) - 0.15 : 3.5;
  const MAX_Y = hasData ? Math.max(...allYields) + 0.15 : 5.5;
  const RANGE_Y = MAX_Y - MIN_Y || 1;

  function toX(i: number) { return PL + (i / Math.max(1, points.length - 1)) * CW; }
  function toY(v: number) { return PT + (1 - (v - MIN_Y) / RANGE_Y) * CH; }

  const polyline = points.map((p, i) => `${toX(i).toFixed(1)},${toY(p.yield).toFixed(1)}`).join(" ");

  // 2s-10s spread (approximate: 3M vs 10Y since we don't have 2Y)
  const y3M = quotes["^IRX"]?.price;
  const y10Y = quotes["^TNX"]?.price;
  const spread = y3M != null && y10Y != null ? ((y10Y - y3M) * 100).toFixed(0) : null;

  // Y-axis grid levels
  function gridYLevels() {
    const step = 0.25;
    const levels: number[] = [];
    let v = Math.ceil(MIN_Y / step) * step;
    while (v <= MAX_Y + 0.01) { levels.push(parseFloat(v.toFixed(2))); v += step; }
    return levels;
  }

  return (
    <div className="wv-market-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">Yield Curve</span>
        <div className="wv-market-yield-legend">
          <span><span className="wv-market-yield-legend-dot" style={{ background: "#89e5ff" }} />CURRENT</span>
        </div>
        <span className={`wv-market-panel-badge ${isLive ? "is-live" : "is-static"}`}>
          {isLive ? "LIVE" : "STATIC"}
        </span>
      </div>

      <div className="wv-market-panel-body" style={{ padding: "0 0 4px 0" }}>
        {/* Spread annotation */}
        {spread != null && (
          <div style={{ padding: "3px 10px", fontSize: 9, color: "#ffab40", letterSpacing: "0.06em", borderBottom: "1px solid var(--wv-line)" }}>
            3M–10Y SPREAD:&nbsp;
            <strong>{Number(spread) > 0 ? "+" : ""}{spread}bp</strong>
            &nbsp;&nbsp;
            <span style={{ color: "var(--wv-text-muted)" }}>
              {Number(spread) < 0 ? "INVERTED" : "NORMAL"}
            </span>
          </div>
        )}

        <div className="wv-market-yield-canvas">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid meet"
            style={{ display: "block" }}
          >
            {/* Grid lines */}
            {gridYLevels().map((v) => {
              const y = toY(v);
              return (
                <g key={v}>
                  <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                  <text x={PL - 4} y={y + 3.5} textAnchor="end" fontSize="8" fill="rgba(185,205,224,0.5)">
                    {v.toFixed(2)}
                  </text>
                </g>
              );
            })}

            {/* Current line */}
            {hasData && (
              <>
                <polyline
                  points={polyline}
                  fill="none"
                  stroke="#89e5ff"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {points.map((p, i) => (
                  <circle key={p.maturity} cx={toX(i)} cy={toY(p.yield)} r="3" fill="#89e5ff" stroke="#0a0e14" strokeWidth="1.5" />
                ))}
              </>
            )}

            {/* X-axis labels */}
            {points.map((p, i) => (
              <text key={p.maturity} x={toX(i)} y={H - 6} textAnchor="middle" fontSize="8" fill="rgba(185,205,224,0.6)">
                {p.maturity}
              </text>
            ))}

            {/* Baseline */}
            <line x1={PL} y1={H - PB} x2={W - PR} y2={H - PB} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

            {/* No data message */}
            {!hasData && (
              <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="11" fill="rgba(185,205,224,0.4)">
                Waiting for yield data…
              </text>
            )}
          </svg>
        </div>
      </div>

      <div className="wv-market-panel-footer">
        {isLive ? "US Treasury · Yahoo Finance · 15min refresh" : "Waiting for data…"}
      </div>
    </div>
  );
}
