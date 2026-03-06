"use client";

import React from "react";

interface YieldPoint {
  maturity: string;
  current: number;
  priorMonth: number;
}

const CURVE: YieldPoint[] = [
  { maturity: "3M",  current: 5.31, priorMonth: 5.28 },
  { maturity: "6M",  current: 5.24, priorMonth: 5.18 },
  { maturity: "1Y",  current: 5.02, priorMonth: 4.94 },
  { maturity: "2Y",  current: 4.68, priorMonth: 4.52 },
  { maturity: "3Y",  current: 4.52, priorMonth: 4.38 },
  { maturity: "5Y",  current: 4.38, priorMonth: 4.24 },
  { maturity: "7Y",  current: 4.34, priorMonth: 4.20 },
  { maturity: "10Y", current: 4.28, priorMonth: 4.16 },
  { maturity: "20Y", current: 4.48, priorMonth: 4.38 },
  { maturity: "30Y", current: 4.52, priorMonth: 4.44 },
];

const W = 520, H = 180;
const PL = 38, PR = 14, PT = 12, PB = 26;
const CW = W - PL - PR;
const CH = H - PT - PB;

const allYields = CURVE.flatMap((p) => [p.current, p.priorMonth]);
const MIN_Y = Math.min(...allYields) - 0.1;
const MAX_Y = Math.max(...allYields) + 0.1;
const RANGE_Y = MAX_Y - MIN_Y;

function toX(i: number) { return PL + (i / (CURVE.length - 1)) * CW; }
function toY(v: number) { return PT + (1 - (v - MIN_Y) / RANGE_Y) * CH; }

function buildPolyline(key: "current" | "priorMonth") {
  return CURVE.map((p, i) => `${toX(i).toFixed(1)},${toY(p[key]).toFixed(1)}`).join(" ");
}

// Y-axis grid levels
function gridYLevels() {
  const step = 0.25;
  const levels: number[] = [];
  let v = Math.ceil(MIN_Y / step) * step;
  while (v <= MAX_Y + 0.01) { levels.push(parseFloat(v.toFixed(2))); v += step; }
  return levels;
}

const spread2y10y = ((CURVE[3].current - CURVE[7].current) * 100).toFixed(0);
const idx10Y = 7;

interface Props {
  style?: React.CSSProperties;
}

export default function YieldCurvePanel({ style }: Props) {
  return (
    <div className="wv-market-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">Yield Curve</span>
        <div className="wv-market-yield-legend">
          <span><span className="wv-market-yield-legend-dot" style={{ background: "#89e5ff" }} />CURRENT</span>
          <span><span className="wv-market-yield-legend-dot" style={{ background: "rgba(137,229,255,0.35)", outline: "1px dashed rgba(137,229,255,0.5)" }} />1M AGO</span>
        </div>
        <span className="wv-market-panel-badge is-static">STATIC</span>
      </div>

      <div className="wv-market-panel-body" style={{ padding: "0 0 4px 0" }}>
        {/* Spread annotation */}
        <div style={{ padding: "3px 10px", fontSize: 9, color: "#ffab40", letterSpacing: "0.06em", borderBottom: "1px solid var(--wv-line)" }}>
          2Y–10Y SPREAD:&nbsp;
          <strong>{Number(spread2y10y) > 0 ? "+" : ""}{spread2y10y}bp</strong>
          &nbsp;&nbsp;
          <span style={{ color: "var(--wv-text-muted)" }}>
            {Number(spread2y10y) < 0 ? "INVERTED" : "NORMAL"}
          </span>
        </div>

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

            {/* Inversion shading (2Y at index 3 > 10Y at index 7 means inverted 2s10s) */}
            {CURVE[3].current > CURVE[7].current && (() => {
              const pts = CURVE.slice(3, 8).map((p, i) =>
                `${toX(i + 3).toFixed(1)},${toY(p.current).toFixed(1)}`
              );
              const baseline = toY(MIN_Y + 0.08);
              const x3 = toX(3), x7 = toX(7);
              const polyPts = `${x3},${baseline} ${pts.join(" ")} ${x7},${baseline}`;
              return (
                <polygon
                  points={polyPts}
                  fill="rgba(255,90,95,0.07)"
                  stroke="none"
                />
              );
            })()}

            {/* 1M AGO line */}
            <polyline
              points={buildPolyline("priorMonth")}
              fill="none"
              stroke="rgba(137,229,255,0.35)"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />

            {/* CURRENT line */}
            <polyline
              points={buildPolyline("current")}
              fill="none"
              stroke="#89e5ff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Dots on current */}
            {CURVE.map((p, i) => (
              <circle key={p.maturity} cx={toX(i)} cy={toY(p.current)} r="3" fill="#89e5ff" stroke="#0a0e14" strokeWidth="1.5" />
            ))}

            {/* Spread annotation at 10Y */}
            <line
              x1={toX(idx10Y)} y1={PT}
              x2={toX(idx10Y)} y2={H - PB}
              stroke="rgba(255,171,64,0.2)"
              strokeWidth="1"
              strokeDasharray="2 3"
            />

            {/* X-axis labels */}
            {CURVE.map((p, i) => (
              <text key={p.maturity} x={toX(i)} y={H - 6} textAnchor="middle" fontSize="8" fill="rgba(185,205,224,0.6)">
                {p.maturity}
              </text>
            ))}

            {/* Baseline */}
            <line x1={PL} y1={H - PB} x2={W - PR} y2={H - PB} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
          </svg>
        </div>
      </div>

      <div className="wv-market-panel-footer">US Treasury · FRED · placeholder data</div>
    </div>
  );
}
