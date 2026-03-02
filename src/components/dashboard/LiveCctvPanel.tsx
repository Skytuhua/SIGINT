"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CctvCamera, CctvRegion } from "../../lib/providers/types";
import { useWorldViewStore } from "../../store";
import CctvFeedView from "./inspector/CctvFeedView";
import Panel from "./panel/Panel";
import PanelBody from "./panel/PanelBody";
import PanelControls from "./panel/PanelControls";
import PanelFooter from "./panel/PanelFooter";
import PanelHeader from "./panel/PanelHeader";

const REGIONS = [
  { value: "all" as const, label: "ALL" },
  { value: "mideast" as const, label: "MIDEAST" },
  { value: "europe" as const, label: "EUROPE" },
  { value: "americas" as const, label: "AMERICAS" },
  { value: "asia" as const, label: "ASIA" },
];

const CYCLE_INTERVAL_MS = 45_000;

function getYoutubeIdFromUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.pathname.startsWith("/embed/")) {
      const parts = u.pathname.split("/");
      return parts[2] || null;
    }
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.slice(1).split("/")[0];
      return id || null;
    }
    const v = u.searchParams.get("v");
    return v || null;
  } catch {
    return null;
  }
}

interface LiveCctvPanelProps {
  panelId: string;
  cameras: CctvCamera[];
  lockHeaderProps: { locked: boolean; onToggleLock: () => void };
  onRefresh: () => void;
  loading: boolean;
}

export default function LiveCctvPanel({
  panelId,
  cameras,
  lockHeaderProps,
  onRefresh,
  loading,
}: LiveCctvPanelProps) {
  const brokenIds = useWorldViewStore((s) => s.cctv.brokenIds);
  const markCctvBroken = useWorldViewStore((s) => s.markCctvBroken);
  const [selectedRegion, setSelectedRegion] = useState<"all" | CctvRegion>("all");
  const [viewMode, setViewMode] = useState<"grid" | "single">("grid");
  const [cycleIndex, setCycleIndex] = useState(0);

  const healthyCameras = useMemo(() => {
    const seenVideoIds = new Set<string>();
    const result: CctvCamera[] = [];

    for (const cam of cameras) {
      if (!cam.snapshotUrl) continue;
      if (brokenIds[cam.id]) continue;
      if (cam.streamFormat !== "YOUTUBE") continue;

      const videoId = getYoutubeIdFromUrl(cam.streamUrl) ?? cam.id;
      if (seenVideoIds.has(videoId)) continue;
      seenVideoIds.add(videoId);
      result.push(cam);
    }

    return result;
  }, [cameras, brokenIds]);

  const filteredCameras = useMemo(() => {
    if (!healthyCameras.length) return [];
    if (selectedRegion === "all") return healthyCameras;

    const regional = healthyCameras.filter((c) => c.region === selectedRegion);
    // If a region has no healthy cameras, fall back to the global pool so the panel
    // always has something to show (as you requested: "just pick some working cameras").
    return regional.length > 0 ? regional : healthyCameras;
  }, [healthyCameras, selectedRegion]);

  const displayedCameras = useMemo(() => {
    if (filteredCameras.length === 0) return [];
    const start = cycleIndex % filteredCameras.length;
    const count = Math.min(4, filteredCameras.length);
    const result: CctvCamera[] = [];
    for (let i = 0; i < count; i++) {
      result.push(filteredCameras[(start + i) % filteredCameras.length]);
    }
    return result;
  }, [filteredCameras, cycleIndex]);

  useEffect(() => {
    if (filteredCameras.length === 0) return;
    const timer = setInterval(() => {
      setCycleIndex((prev) => (prev + 4) % Math.max(1, filteredCameras.length));
    }, CYCLE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [filteredCameras.length]);

  const advanceCycle = useCallback(() => {
    if (filteredCameras.length === 0) return;
    setCycleIndex((prev) => (prev + 4) % Math.max(1, filteredCameras.length));
  }, [filteredCameras.length]);

  const handleNextSet = useCallback(() => {
    advanceCycle();
    onRefresh();
  }, [advanceCycle, onRefresh]);

  const regionTabs = (
    <div className="wv-cctv-live-tabs" role="tablist" aria-label="Region filter">
      {REGIONS.map((r) => (
        <button
          key={r.value}
          type="button"
          role="tab"
          aria-selected={selectedRegion === r.value}
          className={`wv-cctv-live-tab ${selectedRegion === r.value ? "is-active" : ""}`}
          onClick={() => setSelectedRegion(r.value)}
        >
          {r.label}
        </button>
      ))}
    </div>
  );

  const viewModeControls = (
    <div className="wv-cctv-live-view-mode" aria-label="View mode">
      <button
        type="button"
        className={`wv-cctv-live-view-btn ${viewMode === "grid" ? "is-active" : ""}`}
        onClick={() => setViewMode("grid")}
        aria-label="2x2 grid view"
        title="2x2 grid"
      >
        <svg width={14} height={14} viewBox="0 0 14 14" fill="currentColor" aria-hidden>
          <rect x="0" y="0" width="6" height="6" />
          <rect x="8" y="0" width="6" height="6" />
          <rect x="0" y="8" width="6" height="6" />
          <rect x="8" y="8" width="6" height="6" />
        </svg>
      </button>
      <button
        type="button"
        className={`wv-cctv-live-view-btn ${viewMode === "single" ? "is-active" : ""}`}
        onClick={() => setViewMode("single")}
        aria-label="Single large view"
        title="Single view"
      >
        <svg width={14} height={14} viewBox="0 0 14 14" fill="currentColor" aria-hidden>
          <rect x="0" y="0" width="14" height="14" />
        </svg>
      </button>
    </div>
  );

  return (
    <Panel panelId={panelId}>
      <PanelHeader
        title="LIVE WEBCAMS"
        subtitle="Cycling feeds from YouTube public webcams"
        filters={regionTabs}
        {...lockHeaderProps}
        controls={
          <>
            {viewModeControls}
            <PanelControls
              onRefresh={handleNextSet}
              loading={loading}
              refreshText="NEXT SET"
              refreshLoadingText="UPDATING"
            />
          </>
        }
      />
      <PanelBody noPadding>
        <div className="wv-cctv-live-body">
          {filteredCameras.length === 0 ? (
            <div className="wv-cctv-live-empty">
              No cameras available for this region.
            </div>
          ) : viewMode === "grid" ? (
            <div className="wv-cctv-live-grid">
              {displayedCameras.map((cam) => (
                <div key={cam.id} className="wv-cctv-live-cell">
                  <div className="wv-cctv-live-cell-label">
                    <span className="wv-cctv-live-dot" aria-hidden />
                    {cam.city.toUpperCase()}
                  </div>
                  <div className="wv-cctv-live-cell-feed">
                    <CctvFeedView
                      camera={cam}
                      compact
                      onSnapshotError={markCctvBroken}
                      onStreamError={markCctvBroken}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="wv-cctv-live-single">
              <div className="wv-cctv-live-cell-label">
                <span className="wv-cctv-live-dot" aria-hidden />
                {displayedCameras[0]?.city.toUpperCase() ?? "—"}
              </div>
              <div className="wv-cctv-live-cell-feed">
                {displayedCameras[0] ? (
                  <CctvFeedView
                    camera={displayedCameras[0]}
                    compact={false}
                    onSnapshotError={markCctvBroken}
                    onStreamError={markCctvBroken}
                  />
                ) : (
                  <div className="wv-cctv-feed-error">No feed available</div>
                )}
              </div>
            </div>
          )}
        </div>
      </PanelBody>
      <PanelFooter
        source="CCTV mesh"
        updatedAt={Date.now()}
        health={loading ? "loading" : "ok"}
        message={`${filteredCameras.length} cameras · Cycles every ${CYCLE_INTERVAL_MS / 1000}s`}
      />
    </Panel>
  );
}
