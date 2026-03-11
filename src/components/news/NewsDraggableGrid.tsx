"use client";

import {
  Responsive,
  WidthProvider,
  type Layout,
  type LayoutItem,
  type ResponsiveLayouts,
} from "react-grid-layout/legacy";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { useSIGINTStore } from "../../store";
import type { DashboardLayouts } from "../../lib/dashboard/types";

const ResponsiveGridLayout = WidthProvider(Responsive);
const GRID_BREAKPOINTS = { lg: 1680, md: 1320, sm: 980, xs: 0 } as const;
const GRID_COLS = { lg: 360, md: 300, sm: 180, xs: 60 } as const;
const GRID_ROW_HEIGHT = 2;
const GRID_MARGIN: [number, number] = [2, 2];

interface GridPanel {
  id: string;
  node: React.ReactNode;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}

interface NewsDraggableGridProps {
  panels: GridPanel[];
  /** Panel IDs for category feeds with no articles; these are moved to the bottom. */
  emptyCategoryPanelIds?: string[];
}

function overlaps(a: LayoutItem, b: LayoutItem): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function findPlace(
  item: LayoutItem,
  placed: LayoutItem[],
  cols: number
): { x: number; y: number } {
  let y = 0;
  for (;;) {
    for (let x = 0; x <= cols - item.w; x++) {
      const candidate = { ...item, x, y };
      if (placed.every((p) => !overlaps(candidate, p))) return { x, y };
    }
    y += 1;
  }
}

/** Slide items up and left to fill gaps; run multiple passes until no moves. */
function compactLayout(items: LayoutItem[]): LayoutItem[] {
  const result = items.map((i) => ({ ...i }));
  let moved = true;
  while (moved) {
    moved = false;
    const byPosition = [...result].sort((a, b) => a.y - b.y || a.x - b.x);
    for (const item of byPosition) {
      while (item.y > 0) {
        const up = { ...item, y: item.y - 1 };
        if (result.every((p) => p.i === item.i || !overlaps(up, p))) {
          item.y -= 1;
          moved = true;
        } else break;
      }
      while (item.x > 0) {
        const left = { ...item, x: item.x - 1 };
        if (result.every((p) => p.i === item.i || !overlaps(left, p))) {
          item.x -= 1;
          moved = true;
        } else break;
      }
    }
  }
  return result;
}

/**
 * Reflow layout so non-empty panels fill top-left first (use full width),
 * then empty panels in a block at the bottom, also filling left-to-right.
 * Compaction pass fills blank space by sliding items up and left.
 */
function reflowLayoutWithEmptyAtBottom(
  items: LayoutItem[],
  emptyIds: Set<string>,
  cols: number
): LayoutItem[] {
  if (emptyIds.size === 0) return items;
  const rest = items.filter((item) => !emptyIds.has(item.i));
  const empty = items.filter((item) => emptyIds.has(item.i));
  if (empty.length === 0) return items;

  const sortedRest = [...rest].sort((a, b) => a.y - b.y || a.x - b.x);
  const placed: LayoutItem[] = [];

  for (const item of sortedRest) {
    const pos = findPlace(item, placed, cols);
    placed.push({ ...item, x: pos.x, y: pos.y });
  }

  const baseY = placed.length > 0 ? Math.max(...placed.map((i) => i.y + i.h)) : 0;
  const sortedEmpty = [...empty].sort((a, b) => a.y - b.y || a.x - b.x);
  let curX = 0;
  let curY = baseY;
  let rowH = 0;
  const emptyPlaced: LayoutItem[] = [];

  for (const item of sortedEmpty) {
    if (curX + item.w > cols && curX > 0) {
      curX = 0;
      curY += rowH;
      rowH = 0;
    }
    emptyPlaced.push({ ...item, x: curX, y: curY });
    rowH = Math.max(rowH, item.h);
    curX += item.w;
  }

  return compactLayout([...placed, ...emptyPlaced]);
}

export default function NewsDraggableGrid({ panels, emptyCategoryPanelIds = [] }: NewsDraggableGridProps) {
  const [isInteracting, setIsInteracting] = useState(false);
  const layouts = useSIGINTStore((s) => s.news.panelLayouts);
  const panelLocks = useSIGINTStore((s) => s.news.panelLocks);
  const panelZOrder = useSIGINTStore((s) => s.news.panelZOrder);
  const setPanelLayouts = useSIGINTStore((s) => s.setNewsPanelLayouts);
  const isInteractingRef = useRef(false);
  const pendingLayoutRef = useRef<DashboardLayouts | null>(null);

  const emptySet = useMemo(() => new Set(emptyCategoryPanelIds), [emptyCategoryPanelIds]);
  const reflowDoneRef = useRef(false);

  // Run reflow once at startup so empty panels move to bottom; then persist to store. Never re-run to avoid lag.
  useEffect(() => {
    if (reflowDoneRef.current || emptySet.size === 0) return;
    const timer = setTimeout(() => {
      if (reflowDoneRef.current) return;
      const store = useSIGINTStore.getState();
      const currentLayouts = store.news.panelLayouts;
      const locks = store.news.panelLocks;

      const applyPanelConstraints = (items: LayoutItem[] = []) =>
        items.map((item) => {
          const panel = panels.find((p) => p.id === item.i);
          const locked = locks[item.i] === true;
          const isGlobe = item.i === "news-globe";
          return {
            ...item,
            minW: panel?.minW ?? item.minW,
            minH: panel?.minH ?? item.minH,
            maxW: panel?.maxW ?? item.maxW,
            maxH: panel?.maxH ?? item.maxH,
            static: locked || isGlobe,
            isDraggable: !locked && !isGlobe,
            isResizable: !locked && !isGlobe,
          };
        });

      const next = { ...currentLayouts } as ResponsiveLayouts<string>;
      next.lg = applyPanelConstraints(
        reflowLayoutWithEmptyAtBottom(currentLayouts.lg as LayoutItem[], emptySet, GRID_COLS.lg)
      ) as Layout;
      next.md = applyPanelConstraints(
        reflowLayoutWithEmptyAtBottom(currentLayouts.md as LayoutItem[], emptySet, GRID_COLS.md)
      ) as Layout;
      next.sm = applyPanelConstraints(
        reflowLayoutWithEmptyAtBottom(currentLayouts.sm as LayoutItem[], emptySet, GRID_COLS.sm)
      ) as Layout;
      next.xs = applyPanelConstraints(
        reflowLayoutWithEmptyAtBottom(currentLayouts.xs as LayoutItem[], emptySet, GRID_COLS.xs)
      ) as Layout;

      setPanelLayouts(next as DashboardLayouts);
      reflowDoneRef.current = true;
    }, 2500);
    return () => clearTimeout(timer);
  }, [emptySet.size, panels, setPanelLayouts]);

  const zIndexByPanelId = useMemo(() => {
    const total = Math.max(panelZOrder.length, panels.length);
    const map = new Map<string, number>();
    panelZOrder.forEach((id, idx) => {
      map.set(id, idx + 1);
    });

    panels.forEach((panel, idx) => {
      if (!map.has(panel.id)) {
        map.set(panel.id, total + idx + 1);
      }
    });

    return map;
  }, [panelZOrder, panels]);

  const safeLayouts = useMemo(() => {
    const next: ResponsiveLayouts<string> = { ...layouts } as ResponsiveLayouts<string>;

    const applyPanelConstraints = (items: LayoutItem[] = []) => {
      return items.map((item) => {
        const panel = panels.find((p) => p.id === item.i);
        const locked = panelLocks[item.i] === true;
        const isGlobe = item.i === "news-globe";
        return {
          ...item,
          minW: panel?.minW ?? item.minW,
          minH: panel?.minH ?? item.minH,
          maxW: panel?.maxW ?? item.maxW,
          maxH: panel?.maxH ?? item.maxH,
          static: locked || isGlobe,
          isDraggable: !locked && !isGlobe,
          isResizable: !locked && !isGlobe,
        };
      });
    };

    next.lg = applyPanelConstraints(next.lg as LayoutItem[]) as Layout;
    next.md = applyPanelConstraints(next.md as LayoutItem[]) as Layout;
    next.sm = applyPanelConstraints(next.sm as LayoutItem[]) as Layout;
    next.xs = applyPanelConstraints(next.xs as LayoutItem[]) as Layout;

    return next;
  }, [layouts, panelLocks, panels]);

  return (
    <ResponsiveGridLayout
      className={`si-grid-drag ${isInteracting ? "is-interacting" : ""}`.trim()}
      layouts={safeLayouts}
      breakpoints={GRID_BREAKPOINTS}
      cols={GRID_COLS}
      rowHeight={GRID_ROW_HEIGHT}
      margin={GRID_MARGIN}
      containerPadding={[0, 0]}
      draggableHandle=".si-panel-drag-handle"
      draggableCancel=".react-resizable-handle,button:not(.si-panel-drag-handle),input,select,textarea,a,[role='tab']"
      preventCollision={false}
      allowOverlap
      useCSSTransforms
      resizeHandles={["n", "s", "e", "w", "ne", "nw", "se", "sw"]}
      compactType={null}
      onLayoutChange={(_layout, allLayouts) => {
        const next = allLayouts as DashboardLayouts;
        pendingLayoutRef.current = next;
        if (!isInteractingRef.current) {
          setPanelLayouts(next);
        }
      }}
      onDragStart={() => {
        isInteractingRef.current = true;
        setIsInteracting(true);
      }}
      onDragStop={() => {
        isInteractingRef.current = false;
        setIsInteracting(false);
        if (pendingLayoutRef.current) {
          setPanelLayouts(pendingLayoutRef.current);
        }
      }}
      onResizeStart={() => {
        isInteractingRef.current = true;
        setIsInteracting(true);
      }}
      onResizeStop={() => {
        isInteractingRef.current = false;
        setIsInteracting(false);
        if (pendingLayoutRef.current) {
          setPanelLayouts(pendingLayoutRef.current);
        }
      }}
    >
      {panels.map((panel) => (
        <div
          key={panel.id}
          className={`si-grid-item ${panelLocks[panel.id] ? "is-locked" : ""}`.trim()}
          data-grid-id={panel.id}
          data-panel-locked={panelLocks[panel.id] ? "true" : "false"}
          style={
            {
              "--si-item-z": zIndexByPanelId.get(panel.id) ?? 1,
            } as CSSProperties
          }
        >
          {panel.node}
        </div>
      ))}
    </ResponsiveGridLayout>
  );
}

