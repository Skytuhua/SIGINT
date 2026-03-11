"use client";

import type { LayerHealthState } from "../../lib/newsLayers/types";

export interface SelectedNewsBase {
  id: string;
  name?: string;
  props: Record<string, unknown>;
  lat: number;
  lon: number;
}

interface NewsBaseDetailPanelProps {
  base: SelectedNewsBase;
  onClose: () => void;
  health?: LayerHealthState | null;
}

function formatCoord(value: number): string {
  if (!Number.isFinite(value)) return "Unknown";
  return value.toFixed(2);
}

export default function NewsBaseDetailPanel({ base, onClose }: NewsBaseDetailPanelProps) {
  const name =
    typeof base.name === "string" && base.name.trim().length > 0
      ? base.name.trim()
      : typeof base.props.name === "string" && base.props.name.trim().length > 0
      ? (base.props.name as string).trim()
      : "Military Base";

  const latLabel = formatCoord(base.lat);
  const lonLabel = formatCoord(base.lon);

  return (
    <div className="si-news-base-panel" role="dialog" aria-label="Military base details">
      <div className="si-news-base-panel-header">
        <span className="si-news-base-panel-kicker">MILITARY BASE</span>
        <button
          type="button"
          className="si-news-base-panel-close"
          onClick={onClose}
          aria-label="Close base details"
        >
          ×
        </button>
      </div>
      <div className="si-news-base-panel-body">
        <div className="si-news-base-panel-name">{name}</div>
        <div className="si-news-base-panel-row">
          <span className="si-news-base-panel-label">Location</span>
          <span className="si-news-base-panel-value">
            {latLabel}, {lonLabel}
          </span>
        </div>
        <div className="si-news-base-panel-row">
          <span className="si-news-base-panel-label">Source</span>
          <span className="si-news-base-panel-value">SIGINT Military Bases snapshot</span>
        </div>
      </div>
    </div>
  );
}

