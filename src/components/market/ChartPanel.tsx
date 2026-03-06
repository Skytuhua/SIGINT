"use client";

import React, { useState } from "react";

const TIMEFRAMES = ["1m", "5m", "15m", "1H", "4H", "1D", "1W"] as const;
type TF = (typeof TIMEFRAMES)[number];

// Static placeholder candles: [open, high, low, close]
const CANDLES: [number, number, number, number][] = [
  [65200, 66100, 64900, 65800],
  [65800, 67200, 65600, 66950],
  [66950, 67400, 66200, 66400],
  [66400, 66800, 65100, 65300],
  [65300, 65700, 64600, 65600],
  [65600, 68100, 65500, 67900],
  [67900, 68400, 67200, 67600],
  [67600, 68200, 67000, 67842],
];

const CHART_W = 600;
const CHART_H = 220;
const PAD_L = 48;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 28;
const PLOT_W = CHART_W - PAD_L - PAD_R;
const PLOT_H = CHART_H - PAD_T - PAD_B;

function CandleChart() {
  const prices = CANDLES.flatMap(([o, h, l, c]) => [o, h, l, c]);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;

  const toY = (p: number) => PAD_T + PLOT_H - ((p - minP) / range) * PLOT_H;
  const candleW = Math.floor(PLOT_W / CANDLES.length) - 4;
  const halfW = Math.max(3, Math.floor(candleW / 2));

  const priceLabels = [minP, (minP + maxP) / 2, maxP].map((p) => ({
    y: toY(p),
    label: `$${Math.round(p / 100) * 100}`.replace(/\B(?=(\d{3})+(?!\d))/g, ","),
  }));

  const timeLabels = CANDLES.map((_, i) => {
    const x = PAD_L + (i / (CANDLES.length - 1)) * PLOT_W;
    const date = new Date(Date.now() - (CANDLES.length - 1 - i) * 4 * 3600000);
    return { x, label: `${date.getHours().toString().padStart(2, "0")}:00` };
  }).filter((_, i) => i % 2 === 0);

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      {/* grid lines */}
      {priceLabels.map(({ y, label }) => (
        <g key={label}>
          <line x1={PAD_L} y1={y} x2={CHART_W - PAD_R} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
          <text x={PAD_L - 4} y={y + 3.5} textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.3)" fontFamily="monospace">
            {label}
          </text>
        </g>
      ))}

      {/* time labels */}
      {timeLabels.map(({ x, label }) => (
        <text key={label} x={x} y={CHART_H - 6} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.25)" fontFamily="monospace">
          {label}
        </text>
      ))}

      {/* candles */}
      {CANDLES.map(([open, high, low, close], i) => {
        const x = PAD_L + (i / (CANDLES.length - 1)) * PLOT_W;
        const bullish = close >= open;
        const color = bullish ? "#36b37e" : "#ff5a5f";
        const bodyTop = toY(Math.max(open, close));
        const bodyBot = toY(Math.min(open, close));
        const bodyH = Math.max(1, bodyBot - bodyTop);
        return (
          <g key={i}>
            {/* wick */}
            <line x1={x} y1={toY(high)} x2={x} y2={toY(low)} stroke={color} strokeWidth="1" />
            {/* body */}
            <rect
              x={x - halfW}
              y={bodyTop}
              width={halfW * 2}
              height={bodyH}
              fill={bullish ? color : "transparent"}
              stroke={color}
              strokeWidth="1"
            />
          </g>
        );
      })}
    </svg>
  );
}

interface Props {
  style?: React.CSSProperties;
}

export default function ChartPanel({ style }: Props = {}) {
  const [tf, setTf] = useState<TF>("4H");

  return (
    <div className="wv-market-panel wv-market-chart-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">BTC / USD — Price Chart</span>
        <span className="wv-market-panel-badge is-static">STATIC</span>
      </div>

      <div className="wv-market-chart-toolbar">
        {TIMEFRAMES.map((t) => (
          <button
            key={t}
            type="button"
            className={`wv-market-chart-tf-btn${t === tf ? " is-active" : ""}`}
            onClick={() => setTf(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="wv-market-chart-canvas">
        <CandleChart />
        <div className="wv-market-chart-watermark">
          <span className="wv-market-chart-watermark-text">PLACEHOLDER — CONNECT DATA SOURCE</span>
        </div>
      </div>

      <div className="wv-market-panel-footer">
        BTC/USD · {tf} · Binance · placeholder candle data
      </div>
    </div>
  );
}
