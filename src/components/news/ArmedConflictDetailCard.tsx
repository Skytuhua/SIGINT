"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export interface ArmedConflictDetailData {
  id: string;
  headline: string;
  locationLine: string;
  severityLabel: string;
  severityScore: number;
  confidence: number;
  startTime: number;
  endTime?: number;
  timeWindow: string;
  lat: number;
  lon: number;
  summary: string;
  numSources?: number | null;
  numArticles?: number | null;
  numMentions?: number | null;
  goldsteinScale?: number | null;
  avgTone?: number | null;
  mergedEventsCount?: number;
  actor1Name?: string | null;
  actor2Name?: string | null;
  actor1Country?: string | null;
  actor2Country?: string | null;
  actor1Type?: string | null;
  actor2Type?: string | null;
  sourceUrl?: string;
}

function formatUtc(ts: number | undefined): string {
  if (!ts || !Number.isFinite(ts)) return "Unknown";
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return "Unknown";
  return d.toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
}

function formatCoords(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew}`;
}

function severityClass(label: string): string {
  const v = label.toLowerCase();
  if (v === "severe") return "is-severe";
  if (v === "high") return "is-high";
  if (v === "elevated") return "is-elevated";
  return "is-low";
}

export default function ArmedConflictDetailCard({
  detail,
  onClose,
}: {
  detail: ArmedConflictDetailData;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const titleLeftParts: string[] = [];
  if (detail.actor1Name) titleLeftParts.push(String(detail.actor1Name));
  if (detail.actor2Name) titleLeftParts.push(String(detail.actor2Name));
  const actorTitle =
    titleLeftParts.length === 2
      ? `${titleLeftParts[0]} vs ${titleLeftParts[1]}`
      : titleLeftParts[0] ?? "Armed conflict signal";

  const locationTitle = detail.locationLine || "Unknown location";
  const titleLine = `${actorTitle} — ${locationTitle}`;

  const sevLabel = detail.severityLabel || "Unknown";
  const sevScore = Number.isFinite(detail.severityScore)
    ? `${Math.round(detail.severityScore)}/100`
    : "n/a";

  const confScore = Number.isFinite(detail.confidence)
    ? `${Math.round(detail.confidence)}/100`
    : "n/a";

  const whenLabel = `${formatUtc(detail.startTime)} (window: ${detail.timeWindow || "24h"})`;

  const actorsLines: string[] = [];
  if (detail.actor1Name || detail.actor1Country || detail.actor1Type) {
    const parts = [
      detail.actor1Name,
      detail.actor1Country,
      detail.actor1Type,
    ].filter(Boolean) as string[];
    actorsLines.push(`Actor 1: ${parts.join(" — ")}`);
  }
  if (detail.actor2Name || detail.actor2Country || detail.actor2Type) {
    const parts = [
      detail.actor2Name,
      detail.actor2Country,
      detail.actor2Type,
    ].filter(Boolean) as string[];
    actorsLines.push(`Actor 2: ${parts.join(" — ")}`);
  }

  const coordLabel = formatCoords(detail.lat, detail.lon);

  const numSources =
    typeof detail.numSources === "number" && Number.isFinite(detail.numSources)
      ? detail.numSources
      : null;
  const numArticles =
    typeof detail.numArticles === "number" && Number.isFinite(detail.numArticles)
      ? detail.numArticles
      : null;
  const numMentions =
    typeof detail.numMentions === "number" && Number.isFinite(detail.numMentions)
      ? detail.numMentions
      : null;
  const goldstein =
    typeof detail.goldsteinScale === "number" && Number.isFinite(detail.goldsteinScale)
      ? detail.goldsteinScale
      : null;
  const tone =
    typeof detail.avgTone === "number" && Number.isFinite(detail.avgTone)
      ? detail.avgTone
      : null;

  return createPortal(
    <div className="wv-hotspot-card" role="dialog" aria-label="Armed conflict event detail">
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
          aria-label="Close armed conflict details"
        >
          ×
        </button>
      </div>

      <div className="wv-hotspot-section">
        <div className="wv-hotspot-kicker">SEVERITY</div>
        <div className="wv-hotspot-subscores">
          <div>
            Level {sevLabel} ({sevScore})
          </div>
          <div>Confidence {confScore}</div>
          {detail.mergedEventsCount && detail.mergedEventsCount > 1 ? (
            <div>Merged events {detail.mergedEventsCount}</div>
          ) : null}
        </div>
      </div>

      <div className="wv-hotspot-section">
        <div className="wv-hotspot-kicker">WHEN</div>
        <div className="wv-hotspot-summary">{whenLabel}</div>
      </div>

      <div className="wv-hotspot-section">
        <div className="wv-hotspot-kicker">WHERE</div>
        <div className="wv-hotspot-subscores">
          <div>{locationTitle}</div>
          <div>Coordinates {coordLabel}</div>
        </div>
      </div>

      <div className="wv-hotspot-section">
        <div className="wv-hotspot-kicker">WHAT</div>
        <div className="wv-hotspot-summary">{detail.summary || detail.headline}</div>
      </div>

      <div className="wv-hotspot-section">
        <div className="wv-hotspot-kicker">SIGNALS</div>
        <div className="wv-hotspot-subscores">
          <div>Sources {numSources != null ? numSources : "n/a"}</div>
          <div>Articles {numArticles != null ? numArticles : "n/a"}</div>
          <div>Mentions {numMentions != null ? numMentions : "n/a"}</div>
          <div>Goldstein {goldstein != null ? goldstein.toFixed(1) : "n/a"}</div>
          <div>Tone {tone != null ? tone.toFixed(1) : "n/a"}</div>
        </div>
      </div>

      <div className="wv-hotspot-section">
        <div className="wv-hotspot-kicker">ACTORS</div>
        <div className="wv-hotspot-summary">
          {actorsLines.length ? actorsLines.join("  ") : "Not available from upstream."}
        </div>
      </div>

      <div className="wv-hotspot-section">
        <div className="wv-hotspot-kicker">SOURCE TRACE</div>
        <ul className="wv-hotspot-trace">
          <li>GDELT events record (topic-filtered conflict signals)</li>
          {detail.sourceUrl ? (
            <li>
              <a href={detail.sourceUrl} target="_blank" rel="noreferrer">
                Open related coverage ↗
              </a>
            </li>
          ) : null}
        </ul>
      </div>
    </div>,
    document.body
  );
}

