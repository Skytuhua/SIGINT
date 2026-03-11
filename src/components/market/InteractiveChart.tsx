"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { generateOHLCV, type CandleBar } from "./shared/generateOHLCV";
import { sma, rsi, macd } from "./shared/technicalIndicators";

type TF = "1D" | "5D" | "1M" | "3M" | "1Y";

const TF_BARS: Record<TF, number> = {
  "1D": 78,
  "5D": 50,
  "1M": 30,
  "3M": 90,
  "1Y": 252,
};

const PAD_L = 52, PAD_R = 8, PAD_T = 12, PAD_B = 22;
const VOL_FRAC = 0.18; // volume takes 18% of main chart height

interface Props {
  sym: string;
  basePrice: number;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toFixed(0);
}

function fmtPrice(p: number): string {
  return p >= 100 ? p.toFixed(2) : p >= 10 ? p.toFixed(3) : p.toFixed(4);
}

export default function InteractiveChart({ sym, basePrice }: Props) {
  const [tf, setTf] = useState<TF>("1M");
  const [showMA20, setShowMA20] = useState(true);
  const [showMA50, setShowMA50] = useState(true);
  const [showRSI, setShowRSI] = useState(false);
  const [showMACD, setShowMACD] = useState(false);
  const [showVolume, setShowVolume] = useState(true);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [dims, setDims] = useState({ w: 800, h: 320 });

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 100 && height > 60) setDims({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const bars = TF_BARS[tf];
  const candles: CandleBar[] = generateOHLCV(sym, bars, basePrice, tf === "1D" ? 1 : 2);
  const closes = candles.map((c) => c.close);

  const ma20vals = showMA20 ? sma(closes, 20) : [];
  const ma50vals = showMA50 ? sma(closes, 50) : [];
  const rsiVals   = showRSI  ? rsi(closes, 14) : [];
  const macdData  = showMACD ? macd(closes) : null;

  // ── Main chart sizing ─────────────────────────────────────────────────────
  const indicatorH = (showRSI ? 60 : 0) + (showMACD ? 60 : 0);
  const mainH = dims.h - indicatorH - PAD_T - PAD_B;
  const cw = dims.w - PAD_L - PAD_R;
  const ch = mainH;
  const volH = showVolume ? ch * VOL_FRAC : 0;
  const priceH = ch - volH;

  // ── Price range ───────────────────────────────────────────────────────────
  const allPrices = candles.flatMap((c) => [c.high, c.low]);
  const maxP = Math.max(...allPrices) * 1.005;
  const minP = Math.min(...allPrices) * 0.995;
  const rangeP = maxP - minP || 1;

  function toX(i: number) { return PAD_L + (i / (bars - 1)) * cw; }
  function toY(v: number) { return PAD_T + (1 - (v - minP) / rangeP) * priceH; }

  // ── Volume range ──────────────────────────────────────────────────────────
  const maxVol = Math.max(...candles.map((c) => c.volume));
  const volTop = PAD_T + priceH;

  function toYVol(v: number) { return volTop + volH - (v / maxVol) * volH; }

  // ── Candlestick width ─────────────────────────────────────────────────────
  const candleW = Math.max(1, (cw / bars) * 0.65);

  // ── Grid lines ────────────────────────────────────────────────────────────
  const yGridCount = 5;
  const yGridLines = Array.from({ length: yGridCount }, (_, i) => {
    const v = minP + (rangeP * i) / (yGridCount - 1);
    return { v, y: toY(v) };
  });

  // ── Hover data ────────────────────────────────────────────────────────────
  const hc = hoverIdx != null ? candles[hoverIdx] : null;

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const svgX = (e.clientX - rect.left) * (dims.w / rect.width) - PAD_L;
      const idx = Math.round((svgX / cw) * (bars - 1));
      setHoverIdx(Math.max(0, Math.min(bars - 1, idx)));
    },
    [dims.w, cw, bars],
  );

  const handleMouseLeave = useCallback(() => setHoverIdx(null), []);

  // ── RSI SVG ───────────────────────────────────────────────────────────────
  const rsiTop = dims.h - indicatorH + (showRSI ? 0 : 0) - PAD_B;
  const rsiH = 55;

  // ── MACD SVG ─────────────────────────────────────────────────────────────
  const macdTop = rsiTop + (showRSI ? rsiH + 5 : 0);
  const macdH = 55;

  const toggleBtn = (label: string, active: boolean, onToggle: () => void) => (
    <button
      key={label}
      className={`si-chart-toggle-btn${active ? " is-active" : ""}`}
      onClick={onToggle}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Toolbar */}
      <div className="si-chart-toolbar">
        <div className="si-chart-tf-row">
          {(["1D", "5D", "1M", "3M", "1Y"] as TF[]).map((t) => (
            <button
              key={t}
              className={`si-chart-tf-btn${tf === t ? " is-active" : ""}`}
              onClick={() => setTf(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="si-chart-indicator-row">
          <span className="si-chart-indicator-label">INDICATORS</span>
          {toggleBtn("MA20", showMA20, () => setShowMA20((v) => !v))}
          {toggleBtn("MA50", showMA50, () => setShowMA50((v) => !v))}
          {toggleBtn("VOL", showVolume, () => setShowVolume((v) => !v))}
          {toggleBtn("RSI", showRSI, () => setShowRSI((v) => !v))}
          {toggleBtn("MACD", showMACD, () => setShowMACD((v) => !v))}
        </div>
      </div>

      {/* Hover tooltip */}
      {hc && (
        <div className="si-chart-tooltip">
          <span className="si-chart-tooltip-ts">{new Date(hc.ts).toLocaleTimeString()}</span>
          <span>O <strong>{fmtPrice(hc.open)}</strong></span>
          <span>H <strong style={{ color: "#36b37e" }}>{fmtPrice(hc.high)}</strong></span>
          <span>L <strong style={{ color: "#ff5a5f" }}>{fmtPrice(hc.low)}</strong></span>
          <span>C <strong>{fmtPrice(hc.close)}</strong></span>
          <span>V <strong style={{ color: "#89e5ff" }}>{fmt(hc.volume)}</strong></span>
        </div>
      )}

      {/* Main SVG */}
      <div ref={containerRef} style={{ flex: "1 1 0", minHeight: 0, overflow: "hidden" }}>
        <svg
          width={dims.w}
          height={dims.h - (showRSI ? rsiH + 5 : 0) - (showMACD ? macdH + 5 : 0)}
          viewBox={`0 0 ${dims.w} ${dims.h - (showRSI ? rsiH + 5 : 0) - (showMACD ? macdH + 5 : 0)}`}
          style={{ display: "block" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Y-axis grid */}
          {yGridLines.map(({ v, y }) => (
            <g key={v}>
              <line x1={PAD_L} y1={y} x2={dims.w - PAD_R} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
              <text x={PAD_L - 4} y={y + 3.5} textAnchor="end" fontSize="8.5" fill="rgba(185,205,224,0.5)">
                {fmtPrice(v)}
              </text>
            </g>
          ))}

          {/* X-axis baseline */}
          <line x1={PAD_L} y1={PAD_T + ch} x2={dims.w - PAD_R} y2={PAD_T + ch} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

          {/* Candles */}
          {candles.map((c, i) => {
            const x = toX(i);
            const bullish = c.close >= c.open;
            const fill = bullish ? "#36b37e" : "#ff5a5f";
            const top    = toY(Math.max(c.open, c.close));
            const bottom = toY(Math.min(c.open, c.close));
            const bodyH  = Math.max(1, bottom - top);
            return (
              <g key={i}>
                {/* Wick */}
                <line x1={x} y1={toY(c.high)} x2={x} y2={toY(c.low)} stroke={fill} strokeWidth="1" />
                {/* Body */}
                <rect
                  x={x - candleW / 2}
                  y={top}
                  width={candleW}
                  height={bodyH}
                  fill={bullish ? fill : "transparent"}
                  stroke={fill}
                  strokeWidth="1"
                />
              </g>
            );
          })}

          {/* Volume bars */}
          {showVolume && candles.map((c, i) => {
            const x = toX(i);
            const bullish = c.close >= c.open;
            const barTop = toYVol(c.volume);
            return (
              <rect
                key={i}
                x={x - candleW / 2}
                y={barTop}
                width={candleW}
                height={volTop + volH - barTop}
                fill={bullish ? "rgba(54,179,126,0.22)" : "rgba(255,90,95,0.22)"}
              />
            );
          })}

          {/* MA20 */}
          {showMA20 && ma20vals.length > 0 && (() => {
            const pts = ma20vals
              .map((v, i) => v != null ? `${toX(i)},${toY(v)}` : null)
              .filter(Boolean)
              .join(" ");
            return pts ? <polyline points={pts} fill="none" stroke="#89e5ff" strokeWidth="1.5" opacity="0.8" /> : null;
          })()}

          {/* MA50 */}
          {showMA50 && ma50vals.length > 0 && (() => {
            const pts = ma50vals
              .map((v, i) => v != null ? `${toX(i)},${toY(v)}` : null)
              .filter(Boolean)
              .join(" ");
            return pts ? <polyline points={pts} fill="none" stroke="#ffab40" strokeWidth="1.5" opacity="0.8" /> : null;
          })()}

          {/* Hover crosshair */}
          {hoverIdx != null && (
            <line
              x1={toX(hoverIdx)} y1={PAD_T}
              x2={toX(hoverIdx)} y2={PAD_T + ch}
              stroke="rgba(185,205,224,0.25)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          )}
        </svg>

        {/* RSI panel */}
        {showRSI && (
          <svg width={dims.w} height={rsiH + 5} viewBox={`0 0 ${dims.w} ${rsiH + 5}`} style={{ display: "block", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <text x={PAD_L - 4} y={8} textAnchor="end" fontSize="8" fill="rgba(137,229,255,0.7)">RSI</text>
            {/* 30/70 ref lines */}
            {[30, 70].map((level) => {
              const y = 4 + (1 - level / 100) * (rsiH - 8);
              return <line key={level} x1={PAD_L} y1={y} x2={dims.w - PAD_R} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="2 3" />;
            })}
            {/* RSI line */}
            {(() => {
              const pts = rsiVals
                .map((v, i) => {
                  if (v == null) return null;
                  const x = PAD_L + (i / (bars - 1)) * cw;
                  const y = 4 + (1 - v / 100) * (rsiH - 8);
                  return `${x},${y}`;
                })
                .filter(Boolean)
                .join(" ");
              return pts ? <polyline points={pts} fill="none" stroke="#89e5ff" strokeWidth="1.5" /> : null;
            })()}
            {/* 50 center */}
            {(() => { const y = 4 + 0.5 * (rsiH - 8); return <line x1={PAD_L} y1={y} x2={dims.w - PAD_R} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />; })()}
          </svg>
        )}

        {/* MACD panel */}
        {showMACD && macdData && (
          <svg width={dims.w} height={macdH + 5} viewBox={`0 0 ${dims.w} ${macdH + 5}`} style={{ display: "block", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <text x={PAD_L - 4} y={8} textAnchor="end" fontSize="8" fill="rgba(255,171,64,0.7)">MACD</text>
            {(() => {
              const vals = macdData.histogram.filter((v): v is number => v != null);
              if (!vals.length) return null;
              const maxV = Math.max(...vals.map(Math.abs)) || 1;
              const mid = 4 + (macdH - 8) / 2;
              const toYMacd = (v: number) => mid - (v / maxV) * (macdH - 8) / 2;
              const linePts = macdData.macdLine
                .map((v, i) => v != null ? `${PAD_L + (i / (bars - 1)) * cw},${toYMacd(v)}` : null)
                .filter(Boolean).join(" ");
              const sigPts = macdData.signalLine
                .map((v, i) => v != null ? `${PAD_L + (i / (bars - 1)) * cw},${toYMacd(v)}` : null)
                .filter(Boolean).join(" ");
              return (
                <>
                  <line x1={PAD_L} y1={mid} x2={dims.w - PAD_R} y2={mid} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                  {macdData.histogram.map((v, i) => {
                    if (v == null) return null;
                    const x = PAD_L + (i / (bars - 1)) * cw;
                    const y = toYMacd(v);
                    return <rect key={i} x={x - Math.max(1, (cw / bars) * 0.4)} y={Math.min(y, mid)} width={Math.max(1, (cw / bars) * 0.8)} height={Math.abs(y - mid)} fill={v >= 0 ? "rgba(54,179,126,0.5)" : "rgba(255,90,95,0.5)"} />;
                  })}
                  {linePts && <polyline points={linePts} fill="none" stroke="#89e5ff" strokeWidth="1.2" />}
                  {sigPts && <polyline points={sigPts} fill="none" stroke="#ffab40" strokeWidth="1" strokeDasharray="2 2" />}
                </>
              );
            })()}
          </svg>
        )}
      </div>

      {/* Legend */}
      <div className="si-chart-legend">
        {showMA20 && <span><span style={{ background: "#89e5ff" }} className="si-chart-legend-dot" />MA20</span>}
        {showMA50 && <span><span style={{ background: "#ffab40" }} className="si-chart-legend-dot" />MA50</span>}
        <span style={{ marginLeft: "auto", color: "var(--si-text-muted)" }}>{sym} · {tf} · SIMULATED DATA</span>
      </div>
    </div>
  );
}
