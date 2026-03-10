"use client";

import React, { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { SCREENER_UNIVERSE, ScreenerRow } from "./shared/screenerData";
import { heatColor } from "./shared/heatColor";
import { useMarketData } from "../../hooks/useMarketData";

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  style?: React.CSSProperties;
  onTickerClick?: (sym: string) => void;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface TileData {
  sym: string;
  name: string;
  sector: string;
  weight: number;
  chg: number;
}

interface PositionedTile extends TileData, Rect {}

interface QuoteItem {
  symbol: string;
  changePercent: number;
  [key: string]: unknown;
}

interface QuotesResponse {
  quotes: QuoteItem[];
  degraded: boolean;
}

const EMPTY: QuotesResponse = { quotes: [], degraded: true };

const ALL_SYMBOLS = SCREENER_UNIVERSE.map((s) => s.sym).join(",");

// ── Squarified Treemap Algorithm ─────────────────────────────────────────────

function squarify(items: TileData[], rect: Rect): PositionedTile[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [{ ...items[0], ...rect }];

  const totalWeight = items.reduce((s, i) => s + i.weight, 0);
  if (totalWeight <= 0) return [];

  const sorted = [...items].sort((a, b) => b.weight - a.weight);
  const results: PositionedTile[] = [];
  layoutRow(sorted, rect, totalWeight, results);
  return results;
}

function layoutRow(
  items: TileData[],
  rect: Rect,
  totalWeight: number,
  results: PositionedTile[],
) {
  if (items.length === 0) return;
  if (items.length === 1) {
    results.push({ ...items[0], ...rect });
    return;
  }

  const { x, y, w, h } = rect;
  const isHorizontal = w >= h;
  const side = isHorizontal ? h : w;

  let rowWeight = 0;
  let bestCount = 1;
  let bestWorst = Infinity;

  for (let i = 0; i < items.length; i++) {
    rowWeight += items[i].weight;
    const rowFraction = rowWeight / totalWeight;
    const rowSize = isHorizontal ? w * rowFraction : h * rowFraction;

    let worst = 0;
    let runWeight = 0;
    for (let j = 0; j <= i; j++) {
      runWeight += items[j].weight;
      const itemFrac = items[j].weight / rowWeight;
      const itemSize = side * itemFrac;
      const ar = Math.max(rowSize / itemSize, itemSize / rowSize);
      if (ar > worst) worst = ar;
    }

    if (worst <= bestWorst) {
      bestWorst = worst;
      bestCount = i + 1;
    } else {
      break;
    }
  }

  const rowItems = items.slice(0, bestCount);
  const remaining = items.slice(bestCount);
  const rowTotalWeight = rowItems.reduce((s, i) => s + i.weight, 0);
  const rowFraction = rowTotalWeight / totalWeight;

  if (isHorizontal) {
    const rowWidth = w * rowFraction;
    let cy = y;
    for (const item of rowItems) {
      const itemH = side * (item.weight / rowTotalWeight);
      results.push({ ...item, x, y: cy, w: rowWidth, h: itemH });
      cy += itemH;
    }
    if (remaining.length > 0) {
      layoutRow(remaining, { x: x + rowWidth, y, w: w - rowWidth, h }, totalWeight - rowTotalWeight, results);
    }
  } else {
    const rowHeight = h * rowFraction;
    let cx = x;
    for (const item of rowItems) {
      const itemW = side * (item.weight / rowTotalWeight);
      results.push({ ...item, x: cx, y, w: itemW, h: rowHeight });
      cx += itemW;
    }
    if (remaining.length > 0) {
      layoutRow(remaining, { x, y: y + rowHeight, w, h: h - rowHeight }, totalWeight - rowTotalWeight, results);
    }
  }
}

// ── Sector Colors ────────────────────────────────────────────────────────────

const SECTOR_LABEL_COLORS: Record<string, string> = {
  Technology: "#89e5ff",
  Financials: "#fbbf24",
  Healthcare: "#6ee7b7",
  Energy: "#f97316",
  "Consumer Cyclical": "#fb7185",
  "Consumer Staples": "#a78bfa",
  Industrials: "#60a5fa",
  "Comm Services": "#34d399",
  Utilities: "#c4b5fd",
  Materials: "#fcd34d",
  "Real Estate": "#93c5fd",
};

// ── Constants ────────────────────────────────────────────────────────────────

// Internal coordinate width; height is computed from container aspect ratio
const VB_W = 1000;
const DEFAULT_VB_H = 480;
const SECTOR_GAP = 1.5;
const TILE_GAP = 0.75;
const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const ZOOM_SPEED = 0.0015;
const DRAG_THRESHOLD = 4;

// ── Component ────────────────────────────────────────────────────────────────

export default function MarketHeatmapPanel({ style, onTickerClick }: Props) {
  const [hoveredSym, setHoveredSym] = useState<string | null>(null);

  // Dynamic VB_H based on container aspect ratio so treemap fills edge-to-edge
  const [vbH, setVbH] = useState(DEFAULT_VB_H);

  // viewBox-based zoom: we track the visible region of the VB_W x vbH space
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: VB_W, h: DEFAULT_VB_H });

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef({
    active: false,
    didDrag: false,
    startClientX: 0,
    startClientY: 0,
    startVBX: 0,
    startVBY: 0,
  });
  const viewBoxRef = useRef(viewBox);
  viewBoxRef.current = viewBox;
  const vbHRef = useRef(vbH);
  vbHRef.current = vbH;

  // ── Measure container and compute dynamic vbH ─────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function measure() {
      const rect = container!.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const newVbH = VB_W * (rect.height / rect.width);
        setVbH(newVbH);
        // Reset viewBox to full extent with new height
        const full = { x: 0, y: 0, w: VB_W, h: newVbH };
        viewBoxRef.current = full;
        setViewBox(full);
        if (svgRef.current) {
          svgRef.current.setAttribute("viewBox", `0 0 ${VB_W} ${newVbH}`);
        }
      }
    }

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  const { data, isLive } = useMarketData<QuotesResponse>(
    `/api/market/quotes?symbols=${ALL_SYMBOLS}`,
    1_000,
    EMPTY,
  );

  const changeMap = useMemo(() => {
    const map: Record<string, number> = {};
    const quotesArr = Array.isArray(data?.quotes) ? data.quotes : Object.values(data?.quotes ?? {});
    for (const q of quotesArr) {
      map[q.symbol] = q.changePercent;
    }
    return map;
  }, [data]);

  const tiles = useMemo(() => {
    return SCREENER_UNIVERSE.map((s: ScreenerRow) => ({
      sym: s.sym,
      name: s.name,
      sector: s.sector,
      weight: s.marketCapB,
      chg: changeMap[s.sym] ?? s.chg1d,
    }));
  }, [changeMap]);

  const positioned = useMemo(() => {
    const sectorMap = new Map<string, TileData[]>();
    for (const t of tiles) {
      const arr = sectorMap.get(t.sector) || [];
      arr.push(t);
      sectorMap.set(t.sector, arr);
    }

    const sectorItems: { sector: string; weight: number; stocks: TileData[] }[] = [];
    for (const [sector, stocks] of sectorMap) {
      sectorItems.push({ sector, weight: stocks.reduce((s, t) => s + t.weight, 0), stocks });
    }
    sectorItems.sort((a, b) => b.weight - a.weight);

    const sectorTileData: TileData[] = sectorItems.map((s) => ({
      sym: s.sector, name: s.sector, sector: s.sector, weight: s.weight, chg: 0,
    }));

    const sectorRects = squarify(sectorTileData, { x: 0, y: 0, w: VB_W, h: vbH });

    const sectorRectMap = new Map<string, Rect>();
    for (const sr of sectorRects) {
      sectorRectMap.set(sr.sym, { x: sr.x, y: sr.y, w: sr.w, h: sr.h });
    }

    const allTiles: PositionedTile[] = [];
    for (const si of sectorItems) {
      const sr = sectorRectMap.get(si.sector);
      if (!sr) continue;
      const innerRect: Rect = {
        x: sr.x + SECTOR_GAP,
        y: sr.y + SECTOR_GAP,
        w: Math.max(0, sr.w - SECTOR_GAP * 2),
        h: Math.max(0, sr.h - SECTOR_GAP * 2),
      };
      allTiles.push(...squarify(si.stocks, innerRect));
    }

    return { tiles: allTiles, sectorRects };
  }, [tiles, vbH]);

  // ── Helper: clamp viewBox within bounds ────────────────────────────────────

  const clampVB = useCallback((vb: { x: number; y: number; w: number; h: number }) => {
    const curVbH = vbHRef.current;
    const w = Math.min(VB_W, Math.max(VB_W / MAX_ZOOM, vb.w));
    const h = Math.min(curVbH, Math.max(curVbH / MAX_ZOOM, vb.h));
    const x = Math.min(VB_W - w, Math.max(0, vb.x));
    const y = Math.min(curVbH - h, Math.max(0, vb.y));
    return { x, y, w, h };
  }, []);

  // ── Wheel zoom toward cursor (viewBox-based = always crisp) ────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function handleWheel(e: WheelEvent) {
      e.preventDefault();
      e.stopPropagation();

      const vb = viewBoxRef.current;
      const currentZoom = VB_W / vb.w;

      const delta = -e.deltaY * ZOOM_SPEED;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, currentZoom * (1 + delta)));

      const curVbH = vbHRef.current;
      const newW = VB_W / newZoom;
      const newH = curVbH / newZoom;

      // Zoom toward cursor: keep the SVG point under cursor fixed
      const rect = container!.getBoundingClientRect();
      const fracX = (e.clientX - rect.left) / rect.width;
      const fracY = (e.clientY - rect.top) / rect.height;

      // The SVG coord under cursor before zoom
      const svgX = vb.x + fracX * vb.w;
      const svgY = vb.y + fracY * vb.h;

      // New viewBox origin so that svgX,svgY stays at the same frac position
      const newX = svgX - fracX * newW;
      const newY = svgY - fracY * newH;

      const clamped = clampVB({ x: newX, y: newY, w: newW, h: newH });
      viewBoxRef.current = clamped;

      // Apply immediately to SVG for 60fps
      if (svgRef.current) {
        svgRef.current.setAttribute("viewBox", `${clamped.x} ${clamped.y} ${clamped.w} ${clamped.h}`);
      }
      setViewBox(clamped);
    }

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [clampVB]);

  // ── Mouse drag for pan ────────────────────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const vb = viewBoxRef.current;
    // Allow pan only when zoomed in
    if (vb.w >= VB_W - 0.1) return;
    dragRef.current = {
      active: true,
      didDrag: false,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startVBX: vb.x,
      startVBY: vb.y,
    };
  }, []);

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      const d = dragRef.current;
      if (!d.active) return;

      const dx = e.clientX - d.startClientX;
      const dy = e.clientY - d.startClientY;

      if (!d.didDrag && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
      d.didDrag = true;

      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const vb = viewBoxRef.current;

      // Convert pixel drag to viewBox coord movement
      const vbDx = -(dx / rect.width) * vb.w;
      const vbDy = -(dy / rect.height) * vb.h;

      const newVB = clampVB({
        x: d.startVBX + vbDx,
        y: d.startVBY + vbDy,
        w: vb.w,
        h: vb.h,
      });

      viewBoxRef.current = { ...newVB, w: vb.w, h: vb.h };

      if (svgRef.current) {
        svgRef.current.setAttribute("viewBox", `${newVB.x} ${newVB.y} ${vb.w} ${vb.h}`);
      }
    }

    function handleMouseUp() {
      if (dragRef.current.active) {
        dragRef.current.active = false;
        setViewBox({ ...viewBoxRef.current });
      }
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [clampVB]);

  // ── Double-click to reset zoom ────────────────────────────────────────────

  const handleDoubleClick = useCallback(() => {
    const curVbH = vbHRef.current;
    const reset = { x: 0, y: 0, w: VB_W, h: curVbH };
    viewBoxRef.current = reset;
    setViewBox(reset);
    if (svgRef.current) {
      svgRef.current.setAttribute("viewBox", `0 0 ${VB_W} ${curVbH}`);
    }
  }, []);

  // ── Tile click (only if not dragging) ─────────────────────────────────────

  const handleTileClick = useCallback(
    (sym: string) => {
      if (dragRef.current.didDrag) return;
      onTickerClick?.(sym);
    },
    [onTickerClick],
  );

  const hoveredTile = hoveredSym
    ? positioned.tiles.find((t) => t.sym === hoveredSym)
    : null;

  const currentZoom = VB_W / viewBox.w;
  const isPannable = currentZoom > 1.05;

  return (
    <div className="wv-market-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">Sector Heatmap</span>
        <span
          style={{
            fontSize: 9,
            color: "var(--wv-text-muted)",
            letterSpacing: "0.04em",
          }}
        >
          S&P 500 · {isLive ? "LIVE" : "STATIC"} · Scroll to zoom · Click stock for chart
        </span>
        <span className={`wv-market-panel-badge ${isLive ? "is-live" : "is-static"}`}>
          {isLive ? "LIVE" : "STATIC"}
        </span>
      </div>
      <div
        ref={containerRef}
        className="wv-market-panel-body"
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        style={{
          padding: 0,
          overflow: "hidden",
          position: "relative",
          cursor: isPannable
            ? dragRef.current.active
              ? "grabbing"
              : "grab"
            : "default",
          userSelect: "none",
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          width="100%"
          height="100%"
          style={{ display: "block" }}
          preserveAspectRatio="none"
        >
          {/* Sector background rects with labels */}
          {positioned.sectorRects.map((sr) => (
            <g key={`sector-${sr.sym}`}>
              <rect
                x={sr.x}
                y={sr.y}
                width={sr.w}
                height={sr.h}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={SECTOR_GAP}
              />
              {sr.w > 60 && sr.h > 30 && (
                <text
                  x={sr.x + 4}
                  y={sr.y + 11}
                  fill={SECTOR_LABEL_COLORS[sr.sym] ?? "#89e5ff"}
                  fontSize={8}
                  fontWeight={700}
                  fontFamily="monospace"
                  opacity={0.7}
                  pointerEvents="none"
                >
                  {sr.sym}
                </text>
              )}
            </g>
          ))}

          {/* Stock tiles */}
          {positioned.tiles.map((tile) => {
            const isHovered = hoveredSym === tile.sym;
            const tileArea = tile.w * tile.h;
            const symFontSize = Math.max(5, Math.min(16, Math.sqrt(tileArea) / 5));
            const chgFontSize = symFontSize * 0.7;
            const showSym = tile.w > 14 && tile.h > 10;
            const showChg = tile.w > 24 && tile.h > 16;

            return (
              <g
                key={tile.sym}
                onClick={() => handleTileClick(tile.sym)}
                onMouseEnter={() => setHoveredSym(tile.sym)}
                onMouseLeave={() => setHoveredSym(null)}
                style={{ cursor: onTickerClick ? "pointer" : "default" }}
              >
                <rect
                  x={tile.x + TILE_GAP}
                  y={tile.y + TILE_GAP}
                  width={Math.max(0, tile.w - TILE_GAP * 2)}
                  height={Math.max(0, tile.h - TILE_GAP * 2)}
                  fill={heatColor(tile.chg)}
                  rx={1}
                  opacity={isHovered ? 1 : 0.92}
                  stroke={isHovered ? "rgba(255,255,255,0.5)" : "none"}
                  strokeWidth={isHovered ? 1 : 0}
                />
                {showSym && (
                  <text
                    x={tile.x + tile.w / 2}
                    y={tile.y + tile.h / 2 - (showChg ? chgFontSize * 0.3 : 0)}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#fff"
                    fontSize={symFontSize}
                    fontWeight={700}
                    fontFamily="monospace"
                    pointerEvents="none"
                  >
                    {tile.sym}
                  </text>
                )}
                {showChg && (
                  <text
                    x={tile.x + tile.w / 2}
                    y={tile.y + tile.h / 2 + symFontSize * 0.55}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="rgba(255,255,255,0.8)"
                    fontSize={chgFontSize}
                    fontWeight={500}
                    fontFamily="monospace"
                    pointerEvents="none"
                  >
                    {tile.chg >= 0 ? "+" : ""}{tile.chg.toFixed(2)}%
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Zoom badge */}
        {currentZoom > 1.05 && (
          <div
            style={{
              position: "absolute",
              top: 6,
              left: 6,
              background: "rgba(10,14,20,0.85)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 3,
              padding: "2px 7px",
              fontSize: 9,
              fontWeight: 700,
              fontFamily: "monospace",
              color: "#89e5ff",
              pointerEvents: "none",
              zIndex: 10,
            }}
          >
            {currentZoom.toFixed(1)}x
          </div>
        )}

        {/* Reset hint */}
        {currentZoom > 1.05 && (
          <div
            style={{
              position: "absolute",
              bottom: 6,
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(10,14,20,0.75)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 3,
              padding: "2px 8px",
              fontSize: 8,
              fontFamily: "monospace",
              color: "var(--wv-text-muted)",
              pointerEvents: "none",
              zIndex: 10,
            }}
          >
            Double-click to reset · Drag to pan
          </div>
        )}

        {/* Tooltip */}
        {hoveredTile && (
          <div
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              background: "rgba(10,14,20,0.92)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 4,
              padding: "6px 10px",
              fontSize: 10,
              color: "#fff",
              fontFamily: "monospace",
              pointerEvents: "none",
              zIndex: 10,
              lineHeight: 1.5,
              minWidth: 120,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 12 }}>{hoveredTile.sym}</div>
            <div style={{ color: "var(--wv-text-muted)", fontSize: 9 }}>{hoveredTile.name}</div>
            <div style={{ color: SECTOR_LABEL_COLORS[hoveredTile.sector] ?? "#89e5ff", fontSize: 9 }}>
              {hoveredTile.sector}
            </div>
            <div style={{ color: hoveredTile.chg >= 0 ? "#36b37e" : "#ff5a5f", fontWeight: 600 }}>
              {hoveredTile.chg >= 0 ? "+" : ""}{hoveredTile.chg.toFixed(2)}%
            </div>
          </div>
        )}
      </div>
      <div className="wv-market-panel-footer">
        {isLive ? "Yahoo Finance · live data · 1s refresh" : "S&P 500 · static data"} · {SCREENER_UNIVERSE.length} stocks
      </div>
    </div>
  );
}
