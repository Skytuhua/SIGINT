"use client";

import type { UcdpAggregatedStats } from "../../lib/ucdp/aggregation";

export interface UcdpSummaryMeta {
  datasetVersion: string;
  releaseDate: string;
  lastRefresh: number;
}

interface UcdpSummaryPanelProps {
  briefing: string | null;
  stats: UcdpAggregatedStats | null;
  meta: UcdpSummaryMeta | null;
  loading?: boolean;
  degraded?: boolean;
}

function formatTimestamp(ts: number): string {
  if (!ts || !Number.isFinite(ts)) return "n/a";
  return new Date(ts).toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
}

export default function UcdpSummaryPanel({
  briefing,
  stats,
  meta,
  loading,
  degraded,
}: UcdpSummaryPanelProps) {
  const hasStats = stats && stats.eventCount > 0;

  return (
    <div className="wv-news-layers-group" style={{ marginBottom: 8 }}>
      <div className="wv-news-layers-group-label">
        UCDP SUMMARY
        {loading ? (
          <span style={{ marginLeft: 6, opacity: 0.5, fontSize: 10 }}>loading…</span>
        ) : null}
        {degraded ? (
          <span style={{ marginLeft: 6, opacity: 0.5, fontSize: 10 }}>(template)</span>
        ) : null}
      </div>

      <div style={{ padding: "4px 8px", fontSize: 11, lineHeight: 1.5, opacity: 0.85 }}>
        {briefing ? (
          <p style={{ margin: "0 0 6px" }}>{briefing}</p>
        ) : hasStats ? (
          <p style={{ margin: "0 0 6px", opacity: 0.6 }}>
            Summary not yet available.
          </p>
        ) : (
          <p style={{ margin: "0 0 6px", opacity: 0.6 }}>
            No UCDP events in view.
          </p>
        )}
      </div>

      {hasStats ? (
        <div style={{ padding: "0 8px 4px", fontSize: 11, lineHeight: 1.6 }}>
          <div style={{ fontWeight: 600, marginBottom: 2, opacity: 0.7, letterSpacing: 0.5 }}>
            KEY NUMBERS
          </div>
          <div>Events: {stats.eventCount}</div>
          <div>Fatalities (best): {stats.fatalitiesBestTotal.toLocaleString()}</div>
          {stats.highestDay ? (
            <div>
              Highest-day fatalities: {stats.highestDay.fatalitiesBest.toLocaleString()} ({stats.highestDay.date})
            </div>
          ) : null}
          {stats.topLocations.length > 0 ? (
            <div>
              Top locations:{" "}
              {stats.topLocations.map((l) => l.name || l.country).join(", ")}
            </div>
          ) : null}
        </div>
      ) : null}

      {meta ? (
        <div style={{ padding: "0 8px 6px", fontSize: 10, lineHeight: 1.5, opacity: 0.5 }}>
          <div style={{ fontWeight: 600, marginBottom: 2, letterSpacing: 0.5 }}>
            SOURCE TRACE
          </div>
          <div>
            UCDP GED v{meta.datasetVersion} ({meta.releaseDate})
          </div>
          <div>Last refresh: {formatTimestamp(meta.lastRefresh)}</div>
        </div>
      ) : null}
    </div>
  );
}
