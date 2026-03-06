"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Panel from "../dashboard/panel/Panel";
import PanelBody from "../dashboard/panel/PanelBody";
import PanelFooter from "../dashboard/panel/PanelFooter";
import PanelHeader from "../dashboard/panel/PanelHeader";
import PanelControls from "../dashboard/panel/PanelControls";
import { useWorldViewStore } from "../../store";
import type { SanctionsEntity, SanctionsSourceStatusMap } from "../../lib/server/news/sanctions/types";
import ComplianceDataStatusPanel from "./ComplianceDataStatusPanel";

interface CompliancePanelProps {
  lockHeaderProps: {
    locked: boolean;
    onToggleLock: () => void;
  };
}

type SanctionsMode = "list" | "map";

const AUTHORITIES = ["OFAC", "EU", "UK", "UN"] as const;
const ENTITY_TYPES = ["Individual", "Organization", "Company", "Bank", "Vessel", "Aircraft", "Government", "Other"] as const;

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: "#ea80fc44", color: "inherit", padding: 0 }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}


export default function CompliancePanel({ lockHeaderProps }: CompliancePanelProps) {
  const [mode, setMode] = useState<SanctionsMode>("list");
  const [entities, setEntities] = useState<SanctionsEntity[]>([]);
  const [total, setTotal] = useState(0);
  const [sources, setSources] = useState<SanctionsSourceStatusMap>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [authorityFilter, setAuthorityFilter] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [programFilter, setProgramFilter] = useState("");
  const [hasIdFilter, setHasIdFilter] = useState(false);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const setNewsLayerToggle = useWorldViewStore((s) => s.setNewsLayerToggle);

  const fetchEntities = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", "200");
      if (searchQuery) params.set("q", searchQuery);
      if (authorityFilter.size) params.set("authority", Array.from(authorityFilter).join(","));
      if (typeFilter.size) params.set("entityType", Array.from(typeFilter).join(","));
      if (statusFilter) params.set("status", statusFilter);
      if (programFilter) params.set("program", programFilter);
      if (hasIdFilter) params.set("hasIdentifier", "1");

      const res = await fetch(`/api/news/sanctions/entities?${params.toString()}`, {
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json() as {
        entities: SanctionsEntity[];
        total: number;
        sources: SanctionsSourceStatusMap;
      };
      setEntities(data.entities ?? []);
      setTotal(data.total ?? 0);
      setSources(data.sources ?? {});
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("[compliance] fetch failed", err);
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, [page, searchQuery, authorityFilter, typeFilter, statusFilter, programFilter, hasIdFilter]);

  useEffect(() => {
    void fetchEntities();
    return () => { abortRef.current?.abort(); };
  }, [fetchEntities]);

  const filteredLocal = useMemo(() => {
    if (!searchQuery) return entities;
    const q = searchQuery.toLowerCase();
    return entities.filter((e) =>
      e.name.toLowerCase().includes(q) ||
      e.aliases?.some((a) => a.toLowerCase().includes(q)) ||
      e.id.toLowerCase().includes(q)
    );
  }, [entities, searchQuery]);

  const toggleAuthority = (auth: string) => {
    setAuthorityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(auth)) next.delete(auth); else next.add(auth);
      return next;
    });
    setPage(1);
  };

  const toggleType = (t: string) => {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
    setPage(1);
  };

  const handleMapMode = () => {
    setMode("map");
    setNewsLayerToggle("sanctions-entities", true);
  };

  const sourceEntries = Object.entries(sources) as Array<[string, { status: string; rowCount: number; datasetVersion: string | null; lastUpdated: number | null } | null]>;

  return (
    <Panel panelId="news-compliance" workspace="news">
      <PanelHeader
        title="SANCTIONS ENTITIES"
        subtitle={loading ? "Loading..." : `${total} entities`}
        {...lockHeaderProps}
        controls={
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              type="button"
              onClick={() => (mode === "list" ? handleMapMode() : setMode("list"))}
              style={{ fontSize: "0.65rem", padding: "1px 6px", cursor: "pointer", background: mode === "map" ? "#ea80fc44" : "transparent", border: "1px solid #555", color: "#ddd", borderRadius: 2 }}
            >
              {mode === "list" ? "MAP" : "LIST"}
            </button>
            <PanelControls onRefresh={() => void fetchEntities()} />
          </div>
        }
      />
      <PanelBody noPadding className="wv-compliance-panel-body">
        <div style={{ padding: "4px 8px", display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", borderBottom: "1px solid #333" }}>
          <input
            type="text"
            placeholder="Search name, alias, ID..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            style={{ flex: 1, minWidth: 120, fontSize: "0.7rem", padding: "2px 6px", background: "#111", color: "#ddd", border: "1px solid #444", borderRadius: 2 }}
          />
          <label style={{ fontSize: "0.6rem", color: "#999", display: "flex", alignItems: "center", gap: 2 }}>
            <input type="checkbox" checked={hasIdFilter} onChange={(e) => { setHasIdFilter(e.target.checked); setPage(1); }} />
            Has ID
          </label>
        </div>

        <div style={{ padding: "2px 8px", display: "flex", flexWrap: "wrap", gap: 3, borderBottom: "1px solid #333" }}>
          {AUTHORITIES.map((auth) => (
            <button
              key={auth}
              type="button"
              onClick={() => toggleAuthority(auth)}
              style={{
                fontSize: "0.6rem", padding: "1px 5px", cursor: "pointer",
                background: authorityFilter.has(auth) ? "#ea80fc44" : "transparent",
                border: "1px solid #555", color: "#ccc", borderRadius: 2,
              }}
            >
              {auth}
            </button>
          ))}
          <span style={{ borderLeft: "1px solid #555", margin: "0 2px" }} />
          {ENTITY_TYPES.slice(0, 5).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleType(t)}
              style={{
                fontSize: "0.6rem", padding: "1px 5px", cursor: "pointer",
                background: typeFilter.has(t) ? "#4fc3f744" : "transparent",
                border: "1px solid #555", color: "#ccc", borderRadius: 2,
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {mode === "map" && (
          <div style={{ padding: "4px 8px", fontSize: "0.65rem", color: "#999", borderBottom: "1px solid #333" }}>
            Showing High/Medium confidence markers on map. Low-confidence entities are list-only.
          </div>
        )}

        <div style={{ flex: 1, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.68rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #444", position: "sticky", top: 0, background: "#0a0a0a", zIndex: 1 }}>
                <th style={{ textAlign: "left", padding: "3px 6px", color: "#888", fontWeight: 600 }}>NAME</th>
                <th style={{ textAlign: "left", padding: "3px 4px", color: "#888", fontWeight: 600, width: 40 }}>AUTH</th>
                <th style={{ textAlign: "left", padding: "3px 4px", color: "#888", fontWeight: 600, width: 65 }}>TYPE</th>
                <th style={{ textAlign: "left", padding: "3px 4px", color: "#888", fontWeight: 600, width: 90 }}>PROGRAM</th>
                <th style={{ textAlign: "center", padding: "3px 4px", color: "#888", fontWeight: 600, width: 30 }}>GEO</th>
              </tr>
            </thead>
            <tbody>
              {filteredLocal.map((entity) => (
                <tr
                  key={entity.id}
                  onClick={() => setSelectedId(selectedId === entity.id ? null : entity.id)}
                  style={{
                    borderBottom: "1px solid #222",
                    cursor: "pointer",
                    background: selectedId === entity.id ? "#ea80fc11" : "transparent",
                  }}
                >
                  <td style={{ padding: "3px 6px", color: "#ddd" }}>
                    {highlightMatch(entity.name, searchQuery)}
                  </td>
                  <td style={{ padding: "3px 4px", color: "#aaa" }}>{entity.authority}</td>
                  <td style={{ padding: "3px 4px", color: "#aaa" }}>{entity.entityType}</td>
                  <td style={{ padding: "3px 4px", color: "#aaa", maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {entity.program}
                  </td>
                  <td style={{ padding: "3px 4px", textAlign: "center", fontSize: "0.6rem" }}>
                    {entity.geo ? (entity.geo.geoConfidence === "High" ? "🟢" : entity.geo.geoConfidence === "Medium" ? "🟡" : "⚫") : "—"}
                  </td>
                </tr>
              ))}
              {!filteredLocal.length && (
                <tr>
                  <td colSpan={5} style={{ padding: "12px 6px", textAlign: "center", color: "#666" }}>
                    {loading ? "Loading sanctions entities..." : "No entities match current filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {total > 200 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "4px 0", borderTop: "1px solid #333" }}>
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} style={{ fontSize: "0.65rem", color: "#ccc", cursor: "pointer", background: "none", border: "none" }}>
              ◀ PREV
            </button>
            <span style={{ fontSize: "0.65rem", color: "#888" }}>
              Page {page} of {Math.ceil(total / 200)}
            </span>
            <button type="button" disabled={page >= Math.ceil(total / 200)} onClick={() => setPage((p) => p + 1)} style={{ fontSize: "0.65rem", color: "#ccc", cursor: "pointer", background: "none", border: "none" }}>
              NEXT ▶
            </button>
          </div>
        )}

        <div style={{ borderTop: "1px solid #333" }}>
          <ComplianceDataStatusPanel />
        </div>
      </PanelBody>
      <PanelFooter
        source="SANCTIONS"
        updatedAt={Date.now()}
        health={loading ? "loading" : (total > 0 ? "ok" : "stale")}
        message={loading ? "Fetching..." : `${total} entities from ${sourceEntries.filter(([, v]) => v?.status === "live").length} live sources`}
      />
    </Panel>
  );
}
