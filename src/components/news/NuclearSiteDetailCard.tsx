"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { NuclearFacilityStatus } from "../../lib/server/news/nuclearSites/types";

export interface NuclearSiteDetailData {
  id: string;
  name: string;
  type: string;
  status: NuclearFacilityStatus;
  country?: string;
  admin1?: string;
  operator?: string;
  capacityMw?: number;
  reactorCount?: number;
  lat: number;
  lon: number;
  summary: string;
  sourceNames: string[];
  wikidataUrl?: string;
  osmUrl?: string;
  nrcUrl?: string;
  lastUpdated: number | null;
  sourceStatus?: Record<string, "live" | "cached" | "degraded" | "unavailable">;
}

interface NuclearSiteDetailCardProps {
  detail: NuclearSiteDetailData;
  onClose: () => void;
}

function formatLatLon(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew}`;
}

function statusPillClass(status: NuclearFacilityStatus): string {
  const v = status;
  if (v === "Operating") return "is-operating";
  if (v === "Under Construction") return "is-construction";
  if (v === "Planned") return "is-planned";
  if (v === "Decommissioning") return "is-decommissioning";
  if (v === "Retired") return "is-retired";
  return "is-unknown";
}

function pipelineStatusClass(status: string): string {
  if (status === "live") return "is-live";
  if (status === "cached") return "is-cached";
  if (status === "degraded") return "is-degraded";
  return "is-unavailable";
}

export default function NuclearSiteDetailCard({ detail, onClose }: NuclearSiteDetailCardProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const locationLines: string[] = [];
  if (detail.country || detail.admin1) {
    const parts = [detail.admin1, detail.country].filter(Boolean);
    if (parts.length) locationLines.push(parts.join(", "));
  }

  const capacityParts: string[] = [];
  if (typeof detail.capacityMw === "number" && Number.isFinite(detail.capacityMw)) {
    capacityParts.push(`${detail.capacityMw.toLocaleString("en-US")} MW`);
  }
  if (typeof detail.reactorCount === "number" && Number.isFinite(detail.reactorCount)) {
    capacityParts.push(`${detail.reactorCount} reactor${detail.reactorCount === 1 ? "" : "s"}`);
  }

  const sourcesSummary = detail.sourceNames.join(", ");

  const updatedLabel =
    detail.lastUpdated && Number.isFinite(detail.lastUpdated)
      ? new Date(detail.lastUpdated).toUTCString()
      : "Unknown";

  return createPortal(
    <div className="wv-hotspot-card" role="dialog" aria-label="Nuclear facility detail">
      <div className="wv-hotspot-card-hdr">
        <div className="wv-hotspot-card-headline">
          <div className="wv-hotspot-name">{detail.name.toUpperCase()}</div>
          <span className={`wv-hotspot-tier ${statusPillClass(detail.status)}`}>{detail.status}</span>
        </div>
        <button
          type="button"
          className="wv-hotspot-close"
          onClick={onClose}
          aria-label="Close nuclear facility details"
        >
          ×
        </button>
      </div>

      <div className="wv-hotspot-tags">{detail.type}</div>

      <div className="wv-hotspot-section">
        <div className="wv-hotspot-kicker">METADATA</div>
        <div className="wv-hotspot-subscores">
          <div>
            Country{" "}
            {locationLines.length ? locationLines.join(" / ") : detail.country ?? "Unknown"}
          </div>
          <div>Operator {detail.operator ?? "Unknown"}</div>
          <div>Capacity {capacityParts.length ? capacityParts.join(" / ") : "Unknown"}</div>
          <div>Coordinates {formatLatLon(detail.lat, detail.lon)}</div>
        </div>
      </div>

      <div className="wv-hotspot-section">
        <div className="wv-hotspot-kicker">SUMMARY</div>
        <div className="wv-hotspot-summary">{detail.summary}</div>
      </div>

      <div className="wv-hotspot-section">
        <div className="wv-hotspot-kicker">SOURCES</div>
        <div>{sourcesSummary || "Unknown"}</div>
        <details className="wv-hotspot-trace">
          <summary>Source Trace</summary>
          <ul>
            {detail.wikidataUrl ? (
              <li>
                Wikidata –{" "}
                <a href={detail.wikidataUrl} target="_blank" rel="noreferrer">
                  Item
                </a>
              </li>
            ) : null}
            {detail.osmUrl ? (
              <li>
                OSM (verification) –{" "}
                <a href={detail.osmUrl} target="_blank" rel="noreferrer">
                  Element
                </a>
              </li>
            ) : null}
            {detail.nrcUrl ? (
              <li>
                NRC (US) –{" "}
                <a href={detail.nrcUrl} target="_blank" rel="noreferrer">
                  Dataset
                </a>
              </li>
            ) : null}
          </ul>
        </details>
      </div>

      {detail.sourceStatus ? (
        <div className="wv-hotspot-section">
          <div className="wv-hotspot-kicker">PIPELINE STATUS</div>
          <div className="wv-hotspot-status-row">
            {Object.entries(detail.sourceStatus).map(([source, status]) => (
              <span key={source} className={`wv-hotspot-status ${pipelineStatusClass(status)}`}>
                {source}:{status}
              </span>
            ))}
          </div>
          <div className="wv-hotspot-updated">Updated: {updatedLabel}</div>
        </div>
      ) : (
        <div className="wv-hotspot-section">
          <div className="wv-hotspot-kicker">LAST UPDATED</div>
          <div className="wv-hotspot-updated">{updatedLabel}</div>
        </div>
      )}
    </div>,
    document.body
  );
}

