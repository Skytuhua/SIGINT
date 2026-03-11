"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type {
  ArmsEmbargoProgramme,
  ArmsEmbargoSource,
} from "../../lib/server/news/armsEmbargo/types";

export interface ArmsEmbargoZoneDetailData {
  countryCode: string;
  countryLabel: string;
  programmes: ArmsEmbargoProgramme[];
  programmeCount: number;
  activeProgrammeCount: number;
  lastUpdated: string | null;
  sourceStatus?: Record<string, "live" | "cached" | "degraded" | "unavailable">;
}

interface ArmsEmbargoZoneDetailCardProps {
  detail: ArmsEmbargoZoneDetailData;
  onClose: () => void;
}

function statusPillClass(status: string): string {
  if (status === "Active") return "is-operating";
  if (status === "Ended") return "is-retired";
  return "is-unknown";
}

function scopePillClass(scope: string): string {
  if (scope === "Full") return "is-decommissioning";
  if (scope === "Partial") return "is-construction";
  return "is-unknown";
}

function pipelineStatusClass(status: string): string {
  if (status === "live") return "is-live";
  if (status === "cached") return "is-cached";
  if (status === "degraded") return "is-degraded";
  return "is-unavailable";
}

function formatSourceLink(source: ArmsEmbargoSource): string {
  return source.sourceName || "Link";
}

export default function ArmsEmbargoZoneDetailCard({
  detail,
  onClose,
}: ArmsEmbargoZoneDetailCardProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setSelectedIdx(0);
  }, [detail.countryCode]);

  if (!mounted) return null;

  const programmes = detail.programmes;
  const prog: ArmsEmbargoProgramme | undefined = programmes[selectedIdx];
  const hasManyProgrammes = programmes.length > 1;

  const updatedLabel =
    detail.lastUpdated
      ? new Date(detail.lastUpdated).toUTCString()
      : "Unknown";

  return createPortal(
    <div className="si-hotspot-card" role="dialog" aria-label="Arms embargo zone detail">
      <div className="si-hotspot-card-hdr">
        <div className="si-hotspot-card-headline">
          <div className="si-hotspot-name">
            ARMS EMBARGO ZONE — {detail.countryLabel.toUpperCase()}
          </div>
          {prog ? (
            <span className={`si-hotspot-tier ${statusPillClass(prog.status)}`}>
              {prog.status}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className="si-hotspot-close"
          onClick={onClose}
          aria-label="Close arms embargo zone details"
        >
          ×
        </button>
      </div>

      {hasManyProgrammes ? (
        <div className="si-hotspot-tags" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            type="button"
            className="si-hotspot-window-btn"
            disabled={selectedIdx <= 0}
            onClick={() => setSelectedIdx((i) => Math.max(0, i - 1))}
            aria-label="Previous programme"
          >
            ◀
          </button>
          <span style={{ fontSize: 11, opacity: 0.7 }}>
            {selectedIdx + 1} / {programmes.length} programme{programmes.length !== 1 ? "s" : ""}
          </span>
          <button
            type="button"
            className="si-hotspot-window-btn"
            disabled={selectedIdx >= programmes.length - 1}
            onClick={() => setSelectedIdx((i) => Math.min(programmes.length - 1, i + 1))}
            aria-label="Next programme"
          >
            ▶
          </button>
        </div>
      ) : null}

      {prog ? (
        <>
          <div className="si-hotspot-tags">{prog.name}</div>

          <div className="si-hotspot-section">
            <div className="si-hotspot-kicker">DETAILS</div>
            <div className="si-hotspot-subscores">
              <div>
                Scope{" "}
                <span className={`si-hotspot-tier ${scopePillClass(prog.scope)}`}>
                  {prog.scope}
                </span>
              </div>
              <div>Authority {prog.authority}</div>
              <div>Start {prog.startDate ?? "Unknown"}</div>
              <div>End {prog.endDate ?? "Ongoing"}</div>
            </div>
          </div>

          {prog.measures.length > 0 ? (
            <div className="si-hotspot-section">
              <div className="si-hotspot-kicker">MEASURES</div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, lineHeight: 1.5 }}>
                {prog.measures.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {prog.legalBasis ? (
            <div className="si-hotspot-section">
              <div className="si-hotspot-kicker">LEGAL BASIS</div>
              <div className="si-hotspot-summary">{prog.legalBasis}</div>
            </div>
          ) : null}

          <div className="si-hotspot-section">
            <div className="si-hotspot-kicker">SOURCE TRACE</div>
            <details className="si-hotspot-trace" open>
              <summary>Sources ({prog.sources.length})</summary>
              <ul>
                {prog.sources.map((src, i) => (
                  <li key={i}>
                    {formatSourceLink(src)} –{" "}
                    <a href={src.sourceUrl} target="_blank" rel="noreferrer">
                      {src.sourceUrl.length > 60
                        ? src.sourceUrl.slice(0, 57) + "…"
                        : src.sourceUrl}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </>
      ) : (
        <div className="si-hotspot-section">
          <div className="si-hotspot-summary">No programme data available</div>
        </div>
      )}

      {detail.sourceStatus ? (
        <div className="si-hotspot-section">
          <div className="si-hotspot-kicker">PIPELINE STATUS</div>
          <div className="si-hotspot-status-row">
            {Object.entries(detail.sourceStatus).map(([source, status]) => (
              <span key={source} className={`si-hotspot-status ${pipelineStatusClass(status)}`}>
                {source}:{status}
              </span>
            ))}
          </div>
          <div className="si-hotspot-updated">Updated: {updatedLabel}</div>
        </div>
      ) : (
        <div className="si-hotspot-section">
          <div className="si-hotspot-kicker">LAST UPDATED</div>
          <div className="si-hotspot-updated">{updatedLabel}</div>
        </div>
      )}

      <div className="si-hotspot-section" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 6 }}>
        <div style={{ fontSize: 9, opacity: 0.45, lineHeight: 1.4 }}>
          Open-source listing. Not legal advice. Verify via linked authority pages.
        </div>
      </div>
    </div>,
    document.body
  );
}
