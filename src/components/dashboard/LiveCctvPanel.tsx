"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CctvCamera, CctvRegion } from "../../lib/providers/types";
import { useSIGINTStore } from "../../store";
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
  { value: "africa" as const, label: "AFRICA" },
  { value: "oceania" as const, label: "OCEANIA" },
];

const DISPLAY_COUNT = 4;

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
  const brokenIds = useSIGINTStore((s) => s.cctv.brokenIds);
  const markCctvBroken = useSIGINTStore((s) => s.markCctvBroken);
  const [selectedRegion, setSelectedRegion] = useState<"all" | CctvRegion>("all");
  const [viewMode, setViewMode] = useState<"grid" | "single">("grid");
  const [cycleIndex, setCycleIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [remoteResults, setRemoteResults] = useState<CctvCamera[]>([]);
  const [searching, setSearching] = useState(false);
  const searchAbort = useRef<AbortController | null>(null);

  // Debounced remote search against insecam.org
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setRemoteResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timer = setTimeout(async () => {
      searchAbort.current?.abort();
      const ac = new AbortController();
      searchAbort.current = ac;

      try {
        const resp = await fetch(`/api/cctv/insecam/search?q=${encodeURIComponent(q)}`, {
          signal: ac.signal,
        });
        if (resp.ok) {
          const data: CctvCamera[] = await resp.json();
          if (!ac.signal.aborted) setRemoteResults(data);
        }
      } catch {
        // aborted or network error — ignore
      } finally {
        if (!ac.signal.aborted) setSearching(false);
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      searchAbort.current?.abort();
    };
  }, [searchQuery]);

  const healthyCameras = useMemo(() => {
    const ALLOWED_FORMATS = new Set(["JPEG", "IMAGE_STREAM"]);
    const seenIds = new Set<string>();
    const result: CctvCamera[] = [];

    for (const cam of cameras) {
      if (!cam.snapshotUrl) continue;
      if (brokenIds[cam.id]) continue;
      if (!ALLOWED_FORMATS.has(cam.streamFormat ?? "")) continue;
      // Only allow proxied cameras (snapshotUrl via /api/) to avoid raw HTTP
      // URLs that fail due to CORS/mixed-content
      if (!cam.snapshotUrl.startsWith("/api/")) continue;

      if (seenIds.has(cam.id)) continue;
      seenIds.add(cam.id);
      result.push(cam);
    }

    return result;
  }, [cameras, brokenIds]);

  const filteredCameras = useMemo(() => {
    // Search takes priority — matches across all regions + remote results
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      const localMatches = healthyCameras.filter(
        (c) =>
          c.city.toLowerCase().includes(q) ||
          (c.name?.toLowerCase().includes(q)) ||
          (c.section?.toLowerCase().includes(q)),
      );

      // Merge remote results, dedup by ID
      const seenIds = new Set(localMatches.map((c) => c.id));
      const merged = [...localMatches];
      for (const cam of remoteResults) {
        if (!seenIds.has(cam.id)) {
          seenIds.add(cam.id);
          merged.push(cam);
        }
      }
      return merged;
    }

    if (!healthyCameras.length) return [];
    if (selectedRegion === "all") return healthyCameras;

    const regional = healthyCameras.filter((c) => c.region === selectedRegion);
    return regional.length > 0 ? regional : healthyCameras;
  }, [healthyCameras, selectedRegion, searchQuery, remoteResults]);

  useEffect(() => {
    setCycleIndex(0);
  }, [selectedRegion, searchQuery]);

  const displayedCameras = useMemo(() => {
    if (filteredCameras.length === 0) return [];
    const start = cycleIndex % filteredCameras.length;
    const count = Math.min(DISPLAY_COUNT, filteredCameras.length);
    const result: CctvCamera[] = [];
    for (let i = 0; i < count; i++) {
      result.push(filteredCameras[(start + i) % filteredCameras.length]);
    }
    return result;
  }, [filteredCameras, cycleIndex]);

  const advanceCycle = useCallback(() => {
    if (filteredCameras.length === 0) return;
    setCycleIndex((prev) => (prev + DISPLAY_COUNT) % Math.max(1, filteredCameras.length));
  }, [filteredCameras.length]);

  const handleNextSet = useCallback(() => {
    advanceCycle();
  }, [advanceCycle]);

  const regionTabs = (
    <div className="si-cctv-live-filters">
      <div className="si-cctv-live-tabs" role="tablist" aria-label="Region filter">
        {REGIONS.map((r) => (
          <button
            key={r.value}
            type="button"
            role="tab"
            aria-selected={selectedRegion === r.value}
            className={`si-cctv-live-tab ${selectedRegion === r.value ? "is-active" : ""}`}
            onClick={() => setSelectedRegion(r.value)}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="si-cctv-live-search">
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="text"
          placeholder="Search city..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="si-cctv-live-search-input"
          aria-label="Search cameras by city"
        />
        {searchQuery && (
          <button
            type="button"
            className="si-cctv-live-search-clear"
            onClick={() => setSearchQuery("")}
            aria-label="Clear search"
          >
            &times;
          </button>
        )}
      </div>
    </div>
  );

  const viewModeControls = (
    <div className="si-cctv-live-view-mode" aria-label="View mode">
      <button
        type="button"
        className={`si-cctv-live-view-btn ${viewMode === "grid" ? "is-active" : ""}`}
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
        className={`si-cctv-live-view-btn ${viewMode === "single" ? "is-active" : ""}`}
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
        subtitle="Live Feeds"
        filters={regionTabs}
        {...lockHeaderProps}
        controls={
          <>
            {viewModeControls}
            <PanelControls
              onRefresh={handleNextSet}
              loading={loading}
              refreshText="NEXT SET"
              refreshLoadingText="LOADING"
            />
          </>
        }
      />
      <PanelBody noPadding>
        <div className="si-cctv-live-body">
          {filteredCameras.length === 0 ? (
            <div className="si-cctv-live-empty">
              <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <path d="M10 9l5 3-5 3V9z" fill="currentColor" stroke="none" />
              </svg>
              <span>{searching ? "Searching insecam.org..." : "No live streams for this region"}</span>
            </div>
          ) : viewMode === "grid" ? (
            <div className="si-cctv-live-grid">
              {displayedCameras.map((cam) => (
                <div key={cam.id} className="si-cctv-live-cell">
                  <div className="si-cctv-live-cell-feed">
                    <CctvFeedView
                      camera={cam}
                      mosaic
                      onSnapshotError={markCctvBroken}
                      onStreamError={markCctvBroken}
                    />
                  </div>
                  <div className="si-cctv-live-cell-overlay">
                    <div className="si-cctv-live-badge">
                      <span className="si-cctv-live-dot" aria-hidden />
                      LIVE
                    </div>
                    <div className="si-cctv-live-cell-info">
                      <span className="si-cctv-live-cell-city">{cam.city.toUpperCase()}</span>
                      {cam.name && cam.name !== cam.city && (
                        <span className="si-cctv-live-cell-name">{cam.name}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="si-cctv-live-single">
              <div className="si-cctv-live-single-feed">
                {displayedCameras[0] ? (
                  <>
                    <CctvFeedView
                      camera={displayedCameras[0]}
                      compact={false}
                      onSnapshotError={markCctvBroken}
                      onStreamError={markCctvBroken}
                    />
                    <div className="si-cctv-live-cell-overlay">
                      <div className="si-cctv-live-badge">
                        <span className="si-cctv-live-dot" aria-hidden />
                        LIVE
                      </div>
                      <div className="si-cctv-live-cell-info">
                        <span className="si-cctv-live-cell-city">{displayedCameras[0].city.toUpperCase()}</span>
                        {displayedCameras[0].name && displayedCameras[0].name !== displayedCameras[0].city && (
                          <span className="si-cctv-live-cell-name">{displayedCameras[0].name}</span>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="si-cctv-feed-error">No feed available</div>
                )}
              </div>
            </div>
          )}
        </div>
      </PanelBody>
      <PanelFooter
        source="Insecam"
        updatedAt={Date.now()}
        health={loading || searching ? "loading" : "ok"}
        message={`${filteredCameras.length} streams${searching ? " (searching...)" : ""}`}
      />
    </Panel>
  );
}
