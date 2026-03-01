"use client";

import {
  Responsive,
  WidthProvider,
  type Layout,
  type LayoutItem,
  type ResponsiveLayouts,
} from "react-grid-layout/legacy";
import { type CSSProperties, useMemo, useRef, useState } from "react";
import { useWorldViewStore } from "../../store";

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
}

export default function NewsDraggableGrid({ panels }: NewsDraggableGridProps) {
  const [isInteracting, setIsInteracting] = useState(false);
  const layouts = useWorldViewStore((s) => s.news.panelLayouts);
  const panelLocks = useWorldViewStore((s) => s.news.panelLocks);
  const panelZOrder = useWorldViewStore((s) => s.news.panelZOrder);
  const setPanelLayouts = useWorldViewStore((s) => s.setNewsPanelLayouts);
  const isInteractingRef = useRef(false);
  const pendingLayoutRef = useRef<Parameters<typeof setPanelLayouts>[0] | null>(null);

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
        const noResize = item.i === "news-globe";
        return {
          ...item,
          minW: panel?.minW ?? item.minW,
          minH: panel?.minH ?? item.minH,
          maxW: panel?.maxW ?? item.maxW,
          maxH: panel?.maxH ?? item.maxH,
          static: locked,
          isDraggable: !locked,
          isResizable: !locked && !noResize,
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
      className={`wv-grid-drag ${isInteracting ? "is-interacting" : ""}`.trim()}
      layouts={safeLayouts}
      breakpoints={GRID_BREAKPOINTS}
      cols={GRID_COLS}
      rowHeight={GRID_ROW_HEIGHT}
      margin={GRID_MARGIN}
      containerPadding={[0, 0]}
      draggableHandle=".wv-panel-drag-handle"
      draggableCancel=".react-resizable-handle,button:not(.wv-panel-drag-handle),input,select,textarea,a,[role='tab']"
      preventCollision={false}
      allowOverlap
      useCSSTransforms
      resizeHandles={["n", "s", "e", "w", "ne", "nw", "se", "sw"]}
      compactType={null}
      onLayoutChange={(_layout, allLayouts) => {
        const next = allLayouts as Parameters<typeof setPanelLayouts>[0];
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
          className={`wv-grid-item ${panelLocks[panel.id] ? "is-locked" : ""}`.trim()}
          data-grid-id={panel.id}
          data-panel-locked={panelLocks[panel.id] ? "true" : "false"}
          style={
            {
              "--wv-item-z": zIndexByPanelId.get(panel.id) ?? 1,
            } as CSSProperties
          }
        >
          {panel.node}
        </div>
      ))}
    </ResponsiveGridLayout>
  );
}

