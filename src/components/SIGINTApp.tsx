"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { useSIGINTStore } from "../store";
import { useDashboardFeeds } from "../hooks/useDashboardFeeds";
import { featureFlags } from "../config/featureFlags";
import DashboardWorkspace from "./dashboard/DashboardWorkspace";
import GlobeWorkspace from "./dashboard/GlobeWorkspace";
import InspectorDrawer from "./dashboard/inspector/InspectorDrawer";
import Toggle from "./dashboard/controls/Toggle";
import NewsWorkspace from "./news/NewsWorkspace";
import MarketWorkspace from "./market/MarketWorkspace";
import CctvFloatingPanel from "./dashboard/CctvFloatingPanel";
import TradeRouteCard from "./dashboard/TradeRouteCard";
import { formatUtc } from "../lib/dashboard/format";
import { useIsMobile } from "../hooks/useIsMobile";

function selectGlobalFreshness(lastUpdated: Record<string, number | null>): number | null {
  const values = Object.values(lastUpdated).filter((value): value is number => typeof value === "number");
  if (!values.length) return null;
  return Math.max(...values);
}

const GLOBE_HEIGHT_KEY = "si-globe-height-v2";
const DEFAULT_GLOBE_HEIGHT_VH = 68;
const MIN_GLOBE_HEIGHT_VH = 28;
const MAX_GLOBE_HEIGHT_VH = 72;

export default function SIGINTApp() {
  useDashboardFeeds();
  const isMobile = useIsMobile();

  const setDensity = useSIGINTStore((s) => s.setDensity);
  const activeView = useSIGINTStore((s) => s.dashboard.activeView);
  const setActiveView = useSIGINTStore((s) => s.setActiveView);
  const hotkeysEnabled = useSIGINTStore((s) => s.dashboard.hotkeysEnabled);
  const setHotkeysEnabled = useSIGINTStore((s) => s.setHotkeysEnabled);
  const panelFocusId = useSIGINTStore((s) => s.dashboard.panelFocusId);
  const liveData = useSIGINTStore((s) => s.liveData);
  const newsState = useSIGINTStore((s) => s.news);
  const inspector = useSIGINTStore((s) => s.dashboard.inspector);
  const openInspector = useSIGINTStore((s) => s.openInspector);
  const clearSelectionContext = useSIGINTStore((s) => s.clearSelectionContext);
  const globeSectionRef = useRef<HTMLElement | null>(null);
  const opsLayerSnapshotRef = useRef<Record<string, boolean> | null>(null);
  const [globeHeightVh, setGlobeHeightVh] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_GLOBE_HEIGHT_VH;
    const raw = window.localStorage.getItem(GLOBE_HEIGHT_KEY);
    if (!raw) return DEFAULT_GLOBE_HEIGHT_VH;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_GLOBE_HEIGHT_VH;
    return Math.max(MIN_GLOBE_HEIGHT_VH, Math.min(MAX_GLOBE_HEIGHT_VH, parsed));
  });
  const globeHeightInitRef = useRef(false);

  const freshness = useMemo(
    () => selectGlobalFreshness(liveData.lastUpdated),
    [liveData.lastUpdated]
  );

  useEffect(() => {
    // Enforce Ultra density as the only supported mode.
    setDensity("ultra");
  }, [setDensity]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Skip the first render to avoid overwriting the stored value with the initial state
    if (!globeHeightInitRef.current) { globeHeightInitRef.current = true; return; }
    window.localStorage.setItem(GLOBE_HEIGHT_KEY, globeHeightVh.toFixed(2));
  }, [globeHeightVh]);

  useEffect(() => {
    const el = globeSectionRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Shift + wheel: scroll the page. Plain wheel: let event reach Cesium for zoom.
      if (!e.shiftKey) return;
      const scrollContainer = el.parentElement?.closest?.(".si-unified-scroll");
      if (!scrollContainer) return;
      scrollContainer.scrollTop += e.deltaY;
      e.preventDefault();
      e.stopPropagation();
    };
    el.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => el.removeEventListener("wheel", onWheel, { capture: true });
  }, [activeView]);

  useEffect(() => {
    const unsubscribe = useSIGINTStore.subscribe(
      (s) => s.selection.selectedEntity,
      (entity) => {
        if (entity) {
          useSIGINTStore.getState().openInspector(entity);
        } else {
          useSIGINTStore.getState().closeInspector(true);
        }
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!featureFlags.enablePanelHotkeys || !hotkeysEnabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === "i") {
        event.preventDefault();
        if (inspector.open) {
          clearSelectionContext();
        } else {
          const selected = useSIGINTStore.getState().selection.selectedEntity;
          if (selected) {
            openInspector(selected, true);
          }
        }
        return;
      }

      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "r") {
        event.preventDefault();
        useSIGINTStore.getState().bumpRefreshTick();
        return;
      }

      if (event.ctrlKey && event.key === ".") {
        event.preventDefault();
        const panels = Array.from(
          document.querySelectorAll<HTMLElement>("[data-panel-focusable='true']")
        );
        if (!panels.length) return;

        const currentIndex = panels.findIndex((node) => node.dataset.panelId === panelFocusId);
        const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % panels.length : 0;
        panels[nextIndex]?.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hotkeysEnabled, panelFocusId, inspector.open, openInspector, clearSelectionContext]);

  const feedHealthValues = Object.values(liveData?.health ?? {});
  const newsHealthValues = Object.values(newsState?.backendHealth ?? {});
  const feedLoading = feedHealthValues.some((state) => state === "loading");
  const feedErrors = feedHealthValues.filter((state) => state === "error").length;
  const newsLoading = newsHealthValues.some((state) => state === "loading");
  const newsErrors = newsHealthValues.filter((state) => state === "error").length;

  const startGlobeResize = (startY: number) => {
    const startHeightPx = globeSectionRef.current?.getBoundingClientRect().height ?? 0;
    if (!startHeightPx) return;

    const onMove = (clientY: number) => {
      const delta = clientY - startY;
      const nextPx = startHeightPx + delta;
      const nextVh = (nextPx / window.innerHeight) * 100;
      const clamped = Math.max(MIN_GLOBE_HEIGHT_VH, Math.min(MAX_GLOBE_HEIGHT_VH, nextVh));
      setGlobeHeightVh(clamped);
    };

    const onMouseMove = (event: MouseEvent) => {
      event.preventDefault();
      onMove(event.clientY);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!event.touches.length) return;
      onMove(event.touches[0].clientY);
    };

    const cleanup = () => {
      document.body.classList.remove("si-resizing-globe");
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", cleanup);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", cleanup);
      window.removeEventListener("touchcancel", cleanup);
    };

    document.body.classList.add("si-resizing-globe");
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", cleanup);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", cleanup);
    window.addEventListener("touchcancel", cleanup);
  };

  useEffect(() => {
    if (activeView === "news") {
      const current = useSIGINTStore.getState().layers;
      opsLayerSnapshotRef.current = { ...current };
      useSIGINTStore.setState((state) => ({
        ...state,
        layers: {
          ...state.layers,
          flights: false,
          military: false,
          disasters: false,
          satellites: false,
          cctv: false,
        },
      }));
      return;
    }

    if (opsLayerSnapshotRef.current) {
      const snapshot = opsLayerSnapshotRef.current;
      useSIGINTStore.setState((state) => ({
        ...state,
        layers: {
          ...state.layers,
          ...snapshot,
        },
      }));
      opsLayerSnapshotRef.current = null;
    }
  }, [activeView]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const main = document.querySelector<HTMLElement>(".si-main-frame");
    const scroll = document.querySelector<HTMLElement>(".si-unified-scroll");
    if (!main || !scroll || !globeSectionRef.current) return;
  }, [globeHeightVh]);

  return (
    <div
      className="si-app"
      data-theme="workstation"
      data-density="ultra"
      data-inspector-open={inspector.open ? "true" : "false"}
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <header className="si-global-header">
        <div className="si-header-left">
          <div className="si-app-wordmark">SIGINT CONSOLE</div>
          <div className="si-header-view-toggle" role="tablist" aria-label="Workspace view mode">
            <button
              type="button"
              role="tab"
              aria-selected={activeView === "ops"}
              className={activeView === "ops" ? "is-active" : ""}
              onClick={() => setActiveView("ops")}
            >
              OPS
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeView === "news"}
              className={activeView === "news" ? "is-active" : ""}
              onClick={() => setActiveView("news")}
            >
              NEWS
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeView === "market"}
              className={activeView === "market" ? "is-active" : ""}
              onClick={() => setActiveView("market")}
            >
              MARKET
            </button>
          </div>
        </div>

        <div className="si-header-center">
          <div className="si-header-status">
            <span
              className={`si-live-dot ${
                activeView === "market"
                  ? "is-ok"
                  : activeView === "news"
                    ? newsLoading
                      ? "is-loading"
                      : newsErrors
                        ? "is-error"
                        : "is-ok"
                    : feedLoading
                      ? "is-loading"
                      : feedErrors
                        ? "is-error"
                        : "is-ok"
              }`}
            />
            {activeView === "market" ? (
              <>
                <span>MARKET READY</span>
                <span>DATA SOURCE PENDING</span>
              </>
            ) : activeView === "news" ? (
              <>
                <span>{newsErrors ? `${newsErrors} NEWS ERR` : "NEWS OK"}</span>
                <span>{newsState.lastUpdated ? `UPDATED ${formatUtc(newsState.lastUpdated)}` : "NO NEWS TS"}</span>
              </>
            ) : (
              <>
                <span>{feedErrors ? `${feedErrors} FEED ERR` : "FEEDS OK"}</span>
                <span>{freshness ? `UPDATED ${formatUtc(freshness)}` : "NO FEED TS"}</span>
              </>
            )}
          </div>
        </div>

        <div className="si-header-right">
          {!isMobile && featureFlags.enablePanelHotkeys ? (
            <Toggle checked={hotkeysEnabled} onChange={setHotkeysEnabled} label="Hotkeys" />
          ) : null}
          {!isMobile && (
            <button
              type="button"
              className="si-inline-action"
              onClick={() => useSIGINTStore.getState().bumpRefreshTick()}
            >
              REFRESH
            </button>
          )}
        </div>
      </header>

      <main className="si-main-frame">
        {/* Always mount NewsWorkspace so the map initializes immediately.
            When not the active view, position it absolutely behind the visible
            view with visibility:hidden — the container still has dimensions
            so MapLibre/Leaflet can create their WebGL/canvas context. */}
        <div
          className="si-news-main-frame"
          role="region"
          aria-label="News workspace"
          style={activeView !== "news" ? {
            visibility: "hidden",
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: -1,
          } : undefined}
        >
          <section className="si-unified-dashboard-section si-news-section">
            <NewsWorkspace />
          </section>
        </div>

        {activeView === "ops" ? (
          <div className="si-unified-scroll" role="region" aria-label="Unified globe and dashboard workspace">
            <section
              ref={globeSectionRef}
              className="si-unified-globe-section"
              style={
                {
                  "--si-globe-height": `${globeHeightVh}vh`,
                } as CSSProperties
              }
            >
              <GlobeWorkspace embedded compact />
            </section>
            <div
              className="si-globe-height-resizer"
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize globe height"
              title="Drag to resize globe section height"
              onDoubleClick={() => setGlobeHeightVh(DEFAULT_GLOBE_HEIGHT_VH)}
              onMouseDown={(event) => {
                event.preventDefault();
                startGlobeResize(event.clientY);
              }}
              onTouchStart={(event) => {
                if (!event.touches.length) return;
                startGlobeResize(event.touches[0].clientY);
              }}
            />
            <section className="si-unified-dashboard-section">
              <DashboardWorkspace embedded />
            </section>
          </div>
        ) : activeView === "market" ? (
          <div className="si-market-main-frame" role="region" aria-label="Market workspace">
            <MarketWorkspace />
          </div>
        ) : null}
      </main>

      <InspectorDrawer />
      <CctvFloatingPanel />
      <TradeRouteCard />
    </div>
  );
}
