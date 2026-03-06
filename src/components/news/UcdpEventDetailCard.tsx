"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export interface UcdpEventDetailData {
  id: string;
  violenceType: string;
  conflictId: number;
  conflictName: string;
  actor1Name: string;
  actor2Name: string | null;
  country: string;
  admin1: string;
  locationName: string;
  lat: number;
  lon: number;
  date: string;
  fatalities_best: number;
  fatalities_low: number;
  fatalities_high: number;
  severity: number;
  severityLabel: string;
  sourceDatasetVersion: string;
  sourceUrl: string;
  lastUpdated: number;
}

function formatCoords(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew}`;
}

function violenceLabel(vt: string): string {
  if (vt === "state-based") return "State-based conflict";
  if (vt === "non-state") return "Non-state conflict";
  if (vt === "one-sided") return "One-sided violence";
  return vt;
}

function severityClass(label: string): string {
  const v = label.toLowerCase();
  if (v === "severe") return "is-severe";
  if (v === "high") return "is-high";
  if (v === "moderate") return "is-elevated";
  return "is-low";
}

export default function UcdpEventDetailCard({
  detail,
  onClose,
}: {
  detail: UcdpEventDetailData;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const actorParts: string[] = [];
  if (detail.actor1Name) actorParts.push(detail.actor1Name);
  if (detail.actor2Name) actorParts.push(detail.actor2Name);
  const actorTitle =
    actorParts.length === 2
      ? `${actorParts[0]} vs ${actorParts[1]}`
      : actorParts[0] || "";

  const locParts: string[] = [];
  if (detail.locationName) locParts.push(detail.locationName);
  else if (detail.admin1) locParts.push(detail.admin1);
  if (detail.country && !locParts.includes(detail.country))
    locParts.push(detail.country);
  const locationTitle = locParts.join(", ");

  const hasConflictName = Boolean(detail.conflictName);
  const titleLine = hasConflictName
    ? detail.conflictName
    : actorTitle && locationTitle
      ? `${actorTitle} — ${locationTitle}`
      : actorTitle || locationTitle || "Conflict Event";
  const sevLabel = detail.severityLabel || "Low";
  const sevScore = Number.isFinite(detail.severity)
    ? `${Math.round(detail.severity)}/100`
    : "n/a";

  return createPortal(
    <div
      className="wv-hotspot-card"
      role="dialog"
      aria-label="UCDP event detail"
    >
      <div className="wv-hotspot-card-hdr">
        <div className="wv-hotspot-card-headline">
          <div className="wv-hotspot-name">{titleLine}</div>
          <span className={`wv-hotspot-tier ${severityClass(sevLabel)}`}>
            {sevLabel.toUpperCase()}
          </span>
        </div>
        <button
          type="button"
          className="wv-hotspot-close"
          onClick={onClose}
          aria-label="Close UCDP event details"
        >
          ×
        </button>
      </div>

      {detail.violenceType ? (
        <div className="wv-hotspot-section">
          <div className="wv-hotspot-kicker">VIOLENCE TYPE</div>
          <div className="wv-hotspot-summary">
            {violenceLabel(detail.violenceType)}
          </div>
        </div>
      ) : null}

      {actorTitle ? (
        <div className="wv-hotspot-section">
          <div className="wv-hotspot-kicker">ACTORS</div>
          <div className="wv-hotspot-summary">{actorTitle}</div>
        </div>
      ) : null}

      {detail.date ? (
        <div className="wv-hotspot-section">
          <div className="wv-hotspot-kicker">DATE</div>
          <div className="wv-hotspot-summary">{detail.date}</div>
        </div>
      ) : null}

      {detail.fatalities_best > 0 ? (
        <div className="wv-hotspot-section">
          <div className="wv-hotspot-kicker">FATALITIES</div>
          <div className="wv-hotspot-subscores">
            <div>Best estimate: {detail.fatalities_best}</div>
            <div>
              Range: {detail.fatalities_low}–{detail.fatalities_high}
            </div>
          </div>
        </div>
      ) : null}

      <div className="wv-hotspot-section">
        <div className="wv-hotspot-kicker">SEVERITY</div>
        <div className="wv-hotspot-subscores">
          <div>
            {sevLabel} ({sevScore})
          </div>
        </div>
      </div>

      {locationTitle ? (
        <div className="wv-hotspot-section">
          <div className="wv-hotspot-kicker">LOCATION</div>
          <div className="wv-hotspot-subscores">
            {(detail.admin1 || detail.country) && (
              <div>
                {[detail.admin1, detail.country].filter(Boolean).join(", ")}
              </div>
            )}
            <div>{formatCoords(detail.lat, detail.lon)}</div>
          </div>
        </div>
      ) : null}

      <div className="wv-hotspot-section">
        <div className="wv-hotspot-kicker">SOURCE</div>
        <ul className="wv-hotspot-trace">
          <li>UCDP GED — Verified (Fatality-Coded)</li>
          {detail.sourceDatasetVersion ? (
            <li>Dataset v{detail.sourceDatasetVersion}</li>
          ) : null}
          {detail.sourceUrl ? (
            <li>
              <a href={detail.sourceUrl} target="_blank" rel="noreferrer">
                UCDP Downloads ↗
              </a>
            </li>
          ) : null}
        </ul>
      </div>
    </div>,
    document.body
  );
}
