"use client";

import { useEffect, useState } from "react";

interface SourceStatusEntry {
  status: string;
  lastUpdated: number | null;
  rowCount: number;
  datasetVersion: string | null;
  errorCode?: string | null;
}

interface AggregatedHealth {
  status: string;
  lastSuccessAt: number | null;
}

function statusDot(status: string): string {
  if (status === "live") return "🟢";
  if (status === "cached") return "🟡";
  if (status === "degraded") return "🟠";
  return "🔴";
}

function formatAge(ts: number | null): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function ComplianceDataStatusPanel() {
  const [sanctionsSources, setSanctionsSources] = useState<Record<string, SourceStatusEntry>>({});
  const [embargoSources, setEmbargoSources] = useState<Record<string, SourceStatusEntry>>({});
  const [sanctionsAgg, setSanctionsAgg] = useState<AggregatedHealth | null>(null);
  const [embargoAgg, setEmbargoAgg] = useState<AggregatedHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [sRes, eRes] = await Promise.allSettled([
          fetch("/api/news/sanctions/status", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/news/layers/arms-embargo-zones/status", { cache: "no-store" }).then((r) => r.json()),
        ]);
        if (cancelled) return;
        if (sRes.status === "fulfilled") {
          const s = sRes.value as { sources?: Record<string, SourceStatusEntry>; aggregated?: AggregatedHealth };
          setSanctionsSources(s.sources ?? {});
          setSanctionsAgg(s.aggregated ?? null);
        }
        if (eRes.status === "fulfilled") {
          const e = eRes.value as { sources?: Record<string, SourceStatusEntry>; aggregated?: AggregatedHealth };
          setEmbargoSources(e.sources ?? {});
          setEmbargoAgg(e.aggregated ?? null);
        }
      } catch {
        // non-blocking
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const allSources = [
    ...Object.entries(sanctionsSources).map(([k, v]) => ({ pipeline: "SANCTIONS", key: k, ...v })),
    ...Object.entries(embargoSources).map(([k, v]) => ({ pipeline: "EMBARGO", key: k, ...v })),
  ];

  const latestSuccess = [sanctionsAgg?.lastSuccessAt, embargoAgg?.lastSuccessAt]
    .filter((t): t is number => typeof t === "number" && t > 0)
    .sort((a, b) => b - a)[0] ?? null;

  return (
    <div style={{ fontSize: "0.62rem", color: "#999", padding: "4px 8px" }}>
      <div style={{ fontWeight: 700, marginBottom: 3, color: "#bbb", letterSpacing: "0.04em" }}>
        COMPLIANCE DATA STATUS
      </div>
      {loading ? (
        <div style={{ color: "#666" }}>Loading status...</div>
      ) : (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #333" }}>
                <th style={{ textAlign: "left", padding: "1px 4px", fontWeight: 600 }}>PIPELINE</th>
                <th style={{ textAlign: "left", padding: "1px 4px", fontWeight: 600 }}>SRC</th>
                <th style={{ textAlign: "center", padding: "1px 4px", fontWeight: 600 }}>ST</th>
                <th style={{ textAlign: "right", padding: "1px 4px", fontWeight: 600 }}>ROWS</th>
                <th style={{ textAlign: "right", padding: "1px 4px", fontWeight: 600 }}>AGE</th>
                <th style={{ textAlign: "right", padding: "1px 4px", fontWeight: 600 }}>VER</th>
              </tr>
            </thead>
            <tbody>
              {allSources.map((src) => (
                <tr key={`${src.pipeline}-${src.key}`} style={{ borderBottom: "1px solid #222" }}>
                  <td style={{ padding: "1px 4px" }}>{src.pipeline}</td>
                  <td style={{ padding: "1px 4px", textTransform: "uppercase" }}>{src.key}</td>
                  <td style={{ padding: "1px 4px", textAlign: "center" }}>{statusDot(src.status)}</td>
                  <td style={{ padding: "1px 4px", textAlign: "right" }}>{src.rowCount ?? 0}</td>
                  <td style={{ padding: "1px 4px", textAlign: "right" }}>{formatAge(src.lastUpdated)}</td>
                  <td style={{ padding: "1px 4px", textAlign: "right", color: "#666", maxWidth: 50, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {src.datasetVersion ?? "—"}
                  </td>
                </tr>
              ))}
              {allSources.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: "4px", textAlign: "center", color: "#555" }}>
                    No compliance sources available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {latestSuccess && (
            <div style={{ marginTop: 3, color: "#666" }}>
              Latest refresh: {formatAge(latestSuccess)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
