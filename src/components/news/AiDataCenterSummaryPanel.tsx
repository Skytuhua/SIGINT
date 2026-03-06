"use client";

import { useMemo } from "react";

export interface AiDataCenterClusterSummary {
  name: string;
  country: string;
  operators: string[];
  siteCount: number;
  importance: number;
}

interface Props {
  clusters: AiDataCenterClusterSummary[];
  loading?: boolean;
  degraded?: boolean;
}

function generateBriefing(clusters: AiDataCenterClusterSummary[]): string {
  if (clusters.length === 0) return "";

  const totalSites = clusters.reduce((sum, c) => sum + c.siteCount, 0);
  const countries = new Set(clusters.map((c) => c.country).filter(Boolean));

  // Top operators by frequency
  const opCount = new Map<string, number>();
  for (const c of clusters) {
    for (const op of c.operators) {
      opCount.set(op, (opCount.get(op) ?? 0) + c.siteCount);
    }
  }
  const topOps = Array.from(opCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  // Top regions
  const regionCount = new Map<string, number>();
  for (const c of clusters) {
    if (c.country) regionCount.set(c.country, (regionCount.get(c.country) ?? 0) + 1);
  }
  const topRegions = Array.from(regionCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const parts: string[] = [];

  parts.push(
    `${clusters.length} AI/compute cluster${clusters.length === 1 ? "" : "s"} visible containing ${totalSites} facilit${totalSites === 1 ? "y" : "ies"} across ${countries.size} countr${countries.size === 1 ? "y" : "ies"}.`,
  );

  if (topOps.length > 0) {
    const opStr = topOps
      .map(([name, count]) => `${name} (${count})`)
      .join(", ");
    parts.push(`Leading operators: ${opStr}.`);
  }

  if (topRegions.length > 0) {
    const first = topRegions[0];
    let regionStr = `Highest concentration in ${first[0]} (${first[1]} cluster${first[1] === 1 ? "" : "s"})`;
    if (topRegions.length > 1) {
      const rest = topRegions
        .slice(1)
        .map(([name, count]) => `${name} (${count})`)
        .join(" and ");
      regionStr += `, followed by ${rest}`;
    }
    parts.push(`${regionStr}.`);
  }

  return parts.join(" ");
}

export default function AiDataCenterSummaryPanel({ clusters, loading, degraded }: Props) {
  const briefing = useMemo(() => generateBriefing(clusters), [clusters]);
  const totalSites = useMemo(
    () => clusters.reduce((sum, c) => sum + c.siteCount, 0),
    [clusters],
  );
  const distinctOps = useMemo(() => {
    const ops = new Set<string>();
    for (const c of clusters) for (const op of c.operators) ops.add(op);
    return ops.size;
  }, [clusters]);
  const topRegion = useMemo(() => {
    const regionCount = new Map<string, number>();
    for (const c of clusters) {
      if (c.country) regionCount.set(c.country, (regionCount.get(c.country) ?? 0) + 1);
    }
    return Array.from(regionCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "\u2014";
  }, [clusters]);

  return (
    <div className="wv-news-layers-group">
      <div className="wv-news-layers-group-label">
        AI DATA CENTERS SUMMARY
        {loading && <span style={{ marginLeft: 6, opacity: 0.5, fontSize: 9 }}>(loading\u2026)</span>}
        {degraded && <span style={{ marginLeft: 6, opacity: 0.5, fontSize: 9 }}>(snapshot)</span>}
      </div>

      {/* Briefing */}
      <div style={{ padding: "4px 8px", fontSize: 11 }}>
        {briefing ? (
          <p style={{ margin: 0, lineHeight: 1.5 }}>{briefing}</p>
        ) : clusters.length === 0 ? (
          <p style={{ margin: 0, opacity: 0.6 }}>No AI data center clusters in view.</p>
        ) : (
          <p style={{ margin: 0, opacity: 0.6 }}>Summary not yet available.</p>
        )}
      </div>

      {/* Key numbers */}
      {clusters.length > 0 && (
        <div style={{ padding: "0 8px 4px", fontSize: 11, lineHeight: 1.6 }}>
          <div style={{ fontWeight: 600, marginBottom: 2, opacity: 0.7, fontSize: 9, letterSpacing: "0.08em" }}>
            KEY NUMBERS
          </div>
          <div>Clusters: {clusters.length}</div>
          <div>Total Sites: {totalSites}</div>
          <div>Distinct Operators: {distinctOps}</div>
          <div>Top Region: {topRegion}</div>
        </div>
      )}
    </div>
  );
}
