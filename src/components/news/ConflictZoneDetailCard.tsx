"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ConflictZoneFeatureProperties, ConflictZoneSeverityLabel, ConflictZoneSourceInfo } from "../../lib/server/news/conflictZones/types";

export interface ConflictZoneDetailData extends ConflictZoneFeatureProperties {}

interface ConflictZoneDetailCardProps {
  detail: ConflictZoneDetailData;
  mode: "strict" | "broad";
  verifiedOverlay: boolean;
  sourceStatus?: Record<string, "live" | "cached" | "degraded" | "unavailable">;
  onClose: () => void;
}

function severityClass(label: ConflictZoneSeverityLabel): string {
  switch (label) {
    case "Severe": return "is-severe";
    case "High": return "is-high";
    case "Elevated": return "is-elevated";
    default: return "is-low";
  }
}

function formatLastUpdated(ts: number): string {
  return new Date(ts).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export default function ConflictZoneDetailCard({
  detail,
  mode,
  verifiedOverlay,
  sourceStatus,
  onClose,
}: ConflictZoneDetailCardProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const topLocations = detail.topLocations?.filter(Boolean).slice(0, 5) ?? [];
  const topActors = detail.topActors?.filter(Boolean).slice(0, 5) ?? [];
  const sources = detail.sources ?? [];
  const trendLabel = detail.trend ? (detail.trend === "up" ? "↑" : detail.trend === "down" ? "↓" : "→") : null;

  // Deterministic summary based on stats
  const summaryParts: string[] = [];
  if (topLocations.length > 0) {
    summaryParts.push(`Zone covers ${topLocations.slice(0, 3).join(", ")}${topLocations.length > 3 ? " and nearby areas" : ""}.`);
  }
  summaryParts.push(`Current intensity ${detail.intensity}/100 (${detail.severityLabel}).`);
  if (detail.trend && detail.trend !== "stable" && detail.prevIntensity != null) {
    summaryParts.push(
      detail.trend === "up"
        ? `Intensity increased from ${detail.prevIntensity}/100 in prior window.`
        : `Intensity decreased from ${detail.prevIntensity}/100 in prior window.`
    );
  }
  const summary = summaryParts.join(" ");

  return createPortal(
    <div className="si-hotspot-card" role="dialog" aria-label="Conflict zone detail">
      <div className="si-hotspot-card-hdr">
        <div className="si-hotspot-card-headline">
          <div className="si-hotspot-name">CONFLICT ZONE</div>
          <span className={`si-hotspot-tier ${severityClass(detail.severityLabel)}`}>
            {detail.severityLabel}
          </span>
        </div>
        <button
          type="button"
          className="si-hotspot-close"
          onClick={onClose}
          aria-label="Close conflict zone details"
        >
          ×
        </button>
      </div>

      <div className="si-hotspot-card-body">
        <div className="si-conflict-zone-meta" style={{ display: "flex", gap: "10px", flexWrap: "wrap", opacity: 0.7, fontSize: "0.85em", marginBottom: 8 }}>
          <span>Intensity {detail.intensity}/100</span>
          {trendLabel ? <span className="si-conflict-trend">{trendLabel}</span> : null}
          <span>·</span>
          <span>Window: {detail.timeWindow}</span>
          <span>·</span>
          <span>Updated {formatLastUpdated(detail.lastUpdated)}</span>
        </div>

        <section className="si-conflict-zone-section">
          <h4>KEY NUMBERS</h4>
          <p><strong>Events:</strong> {detail.eventCount}</p>
          {topLocations.length > 0 && (
            <p><strong>Top locations:</strong> {topLocations.join(", ")}</p>
          )}
          {topActors.length > 0 && (
            <p><strong>Top actors:</strong> {topActors.join(", ")}</p>
          )}
        </section>

        <section className="si-conflict-zone-section">
          <h4>SUMMARY</h4>
          <p>{summary}</p>
        </section>

        {detail.docQueryUrl ? (
          <section className="si-conflict-zone-section">
            <h4>SOURCE TRACE</h4>
            <p>
              <a
                href={detail.docQueryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="si-conflict-source-link"
              >
                View GDELT query
              </a>
            </p>
          </section>
        ) : null}

        {sources.length > 0 ? (
          <section className="si-conflict-zone-section">
            <h4>DATA SOURCES</h4>
            <ul className="si-conflict-sources-list">
              {sources.map((s: ConflictZoneSourceInfo, i: number) => (
                <li key={i}>
                  {s.dataset}
                  {s.datasetVersion ? ` (v${s.datasetVersion})` : ""}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="si-conflict-zone-modes" style={{ display: "flex", gap: "10px", opacity: 0.6, fontSize: "0.82em", marginTop: 6 }}>
          <span>Mode: {mode === "broad" ? "Signals+" : "Strict"}</span>
          {verifiedOverlay && <span>· UCDP verified overlay on</span>}
        </div>

        {sourceStatus && Object.keys(sourceStatus).length > 0 ? (
          <div className="si-conflict-zone-status">
            {Object.entries(sourceStatus).map(([k, v]) => (
              <span key={k} className={`si-status-pill is-${v}`}>{k}: {v}</span>
            ))}
          </div>
        ) : null}

        <p className="si-conflict-zone-disclaimer">
          Situational awareness from public reporting and structured datasets. Not intelligence or targeting guidance.
        </p>
      </div>
    </div>,
    document.body
  );
}
