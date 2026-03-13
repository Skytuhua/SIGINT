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
import { useIsMobile } from "../../hooks/useIsMobile";

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

interface DraggableDashboardGridProps {
  panels: GridPanel[];
}

export default function DraggableDashboardGrid({ panels }: DraggableDashboardGridProps) {
  const isMobile = useIsMobile();
  const [isInteracting, setIsInteracting] = useState(false);
  const layouts = useSIGINTStore((s) => s.dashboard.panelLayouts);
  const panelLocks = useSIGINTStore((s) => s.dashboard.panelLocks);
  const panelZOrder = useSIGINTStore((s) => s.dashboard.panelZOrder);
  const setPanelLayouts = useSIGINTStore((s) => s.setPanelLayouts);
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

  const containerRef = useRef<HTMLDivElement | null>(null);

  const safeLayouts = useMemo(() => {
    const next: ResponsiveLayouts<string> = { ...layouts } as ResponsiveLayouts<string>;

    const applyPanelConstraints = (items: LayoutItem[] = []) => {
      return items.map((item) => {
        const panel = panels.find((p) => p.id === item.i);
        const locked = panelLocks[item.i] === true;
        return {
          ...item,
          minW: panel?.minW ?? item.minW,
          minH: panel?.minH ?? item.minH,
          maxW: panel?.maxW ?? item.maxW,
          maxH: panel?.maxH ?? item.maxH,
          static: locked,
          isDraggable: !locked,
          isResizable: !locked,
        };
      });
    };

    next.lg = applyPanelConstraints(next.lg as LayoutItem[]) as Layout;
    next.md = applyPanelConstraints(next.md as LayoutItem[]) as Layout;
    next.sm = applyPanelConstraints(next.sm as LayoutItem[]) as Layout;
    next.xs = applyPanelConstraints(next.xs as LayoutItem[]) as Layout;

    return next;
  }, [layouts, panelLocks, panels]);

  if (isMobile) {
    const mobilePanels = panels.filter((p) => p.id !== "kpi");
    return (
      <div className="si-mobile-dashboard-stack">
        {mobilePanels.map((panel) => (
          <div key={panel.id} className="si-mobile-dashboard-panel">
            {panel.node}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
    <ResponsiveGridLayout
      className={`si-grid-drag ${isInteracting ? "is-interacting" : ""}`.trim()}
      layouts={safeLayouts}
      breakpoints={GRID_BREAKPOINTS}
      cols={GRID_COLS}
      rowHeight={GRID_ROW_HEIGHT}
      margin={GRID_MARGIN}
      containerPadding={[0, 0]}
      draggableHandle=".si-panel-drag-handle"
      draggableCancel=".react-resizable-handle,button:not(.si-panel-drag-handle),input,select,textarea,a,[role='tab'],.si-cctv-live-tab,.si-panel-filters,.si-panel-filters *"
      preventCollision={false}
      allowOverlap={false}
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
    </div>
  );
}
