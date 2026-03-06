"use client";

import type { LayerFeatureCollection, LayerHealthState } from "../../lib/newsLayers/types";

interface Props {
  flows: LayerFeatureCollection | null;
  health: LayerHealthState | null;
  loading?: boolean;
}

interface FlowSummaryStats {
  totalPersons: number;
  flowCount: number;
  topOrigins: { name: string; value: number }[];
  topHosts: { name: string; value: number }[];
  topCorridors: { name: string; value: number; formatted: string }[];
  sourceNames: string[];
  lastUpdated: number | null;
}

function computeStats(flows: LayerFeatureCollection): FlowSummaryStats {
  const byOrigin = new Map<string, number>();
  const byDest = new Map<string, number>();
  const corridors: { name: string; value: number; formatted: string }[] = [];
  const sources = new Set<string>();
  let lastUpdated: number | null = null;
  let totalPersons = 0;

  for (const f of flows.features) {
    const p = f.properties as Record<string, unknown>;
    const value = Number(p.value ?? 0);
    if (!value) continue;
    totalPersons += value;

    const origin = String(p.originName ?? "");
    const dest = String(p.destinationName ?? "");
    const corridorName = String(p.corridorName ?? `${origin} → ${dest}`);
    const formatted = String(p.valueFormatted ?? value.toLocaleString());
    const sourceName = String(p.sourceName ?? "");
    const lu = Number(p.lastUpdated ?? 0);

    byOrigin.set(origin, (byOrigin.get(origin) ?? 0) + value);
    byDest.set(dest, (byDest.get(dest) ?? 0) + value);
    corridors.push({ name: corridorName, value, formatted });
    if (sourceName) sources.add(sourceName);
    if (lu > 0 && (lastUpdated === null || lu < lastUpdated)) lastUpdated = lu;
  }

  const topOrigins = Array.from(byOrigin.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, value]) => ({ name, value }));

  const topHosts = Array.from(byDest.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, value]) => ({ name, value }));

  corridors.sort((a, b) => b.value - a.value);

  return {
    totalPersons,
    flowCount: flows.features.length,
    topOrigins,
    topHosts,
    topCorridors: corridors.slice(0, 3),
    sourceNames: Array.from(sources),
    lastUpdated,
  };
}

function formatLarge(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toLocaleString();
}

function formatTs(ts: number | null): string {
  if (!ts || !Number.isFinite(ts)) return "n/a";
  return new Date(ts).toISOString().slice(0, 10);
}

export default function DisplacementFlowSummaryPanel({ flows, health, loading }: Props) {
  const hasData = flows && flows.features.length > 0;
  const stats = hasData ? computeStats(flows!) : null;
  const isDegraded = health?.status === "degraded" || health?.status === "cached";

  return (
    <div className="wv-news-layers-group" style={{ marginBottom: 8 }}>
      <div className="wv-news-layers-group-label">
        DISPLACEMENT SUMMARY
        {loading && <span style={{ marginLeft: 6, opacity: 0.5, fontSize: 10 }}>loading…</span>}
        {isDegraded && !loading && (
          <span style={{ marginLeft: 6, opacity: 0.5, fontSize: 10 }}>(cached)</span>
        )}
      </div>

      {!hasData || !stats ? (
        <div style={{ padding: "4px 8px", fontSize: 11, opacity: 0.55, lineHeight: 1.5 }}>
          No displacement flows in view.
        </div>
      ) : (
        <>
          {/* Auto-briefing */}
          <div style={{ padding: "4px 8px 2px", fontSize: 11, lineHeight: 1.55, opacity: 0.85 }}>
            <p style={{ margin: "0 0 4px" }}>
              Showing{" "}
              <strong style={{ color: "#c8dff5" }}>
                {formatLarge(stats.totalPersons)} persons
              </strong>{" "}
              across {stats.flowCount} displacement corridor{stats.flowCount !== 1 ? "s" : ""}.
              {stats.topOrigins.length > 0 && (
                <> Top origins: {stats.topOrigins.map((o) => o.name).join(", ")}.</>
              )}
              {stats.topHosts.length > 0 && (
                <> Largest hosts: {stats.topHosts.map((h) => h.name).join(", ")}.</>
              )}
            </p>
          </div>

          {/* Key numbers */}
          <div style={{ padding: "0 8px 4px", fontSize: 11, lineHeight: 1.6 }}>
            <div
              style={{ fontWeight: 600, marginBottom: 2, opacity: 0.7, letterSpacing: 0.5 }}
            >
              KEY NUMBERS
            </div>
            <div>Total displaced: {formatLarge(stats.totalPersons)}</div>
            <div>Corridors visible: {stats.flowCount}</div>
            {stats.topCorridors.length > 0 && (
              <div>
                Biggest corridors:{" "}
                {stats.topCorridors
                  .map((c) => `${c.name} (${c.formatted})`)
                  .join("; ")}
              </div>
            )}
          </div>

          {/* Source trace */}
          <div style={{ padding: "0 8px 6px", fontSize: 10, lineHeight: 1.5, opacity: 0.5 }}>
            <div
              style={{ fontWeight: 600, marginBottom: 2, letterSpacing: 0.5 }}
            >
              SOURCE TRACE
            </div>
            <div>{stats.sourceNames.join(" / ") || "UNHCR / IDMC"}</div>
            <div>Data as of: {formatTs(stats.lastUpdated)}</div>
            {health?.lastSuccessAt && (
              <div>Refreshed: {formatTs(health.lastSuccessAt)}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
