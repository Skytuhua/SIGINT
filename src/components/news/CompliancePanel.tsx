"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Panel from "../dashboard/panel/Panel";
import PanelBody from "../dashboard/panel/PanelBody";
import PanelFooter from "../dashboard/panel/PanelFooter";
import PanelHeader from "../dashboard/panel/PanelHeader";
import PanelControls from "../dashboard/panel/PanelControls";
import { useSIGINTStore } from "../../store";
import type { SanctionsEntity, SanctionsSourceStatusMap } from "../../lib/server/news/sanctions/types";
import ComplianceDataStatusPanel from "./ComplianceDataStatusPanel";
import { useIsMobile } from "../../hooks/useIsMobile";
import PhoneOverlayShell from "../ui/PhoneOverlayShell";

interface CompliancePanelProps {
  lockHeaderProps: {
    locked: boolean;
    onToggleLock: () => void;
  };
}

type SanctionsMode = "list" | "map";

const AUTHORITIES = ["OFAC", "EU", "UK", "UN"] as const;
const ENTITY_TYPES = ["Individual", "Organization", "Company", "Bank", "Vessel", "Aircraft", "Government", "Other"] as const;
const PAGE_SIZE = 200;
const MOBILE_PREVIEW_COUNT = 8;

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

function geoConfidenceLabel(entity: SanctionsEntity): string {
  if (!entity.geo) return "--";
  if (entity.geo.geoConfidence === "High") return "H";
  if (entity.geo.geoConfidence === "Medium") return "M";
  return "L";
}

export default function CompliancePanel({ lockHeaderProps }: CompliancePanelProps) {
  const isMobile = useIsMobile();
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
  const [showFullList, setShowFullList] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const setNewsLayerToggle = useSIGINTStore((s) => s.setNewsLayerToggle);

  const fetchEntities = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
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
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchEntities]);

  const filteredLocal = useMemo(() => {
    if (!searchQuery) return entities;
    const q = searchQuery.toLowerCase();
    return entities.filter((entity) =>
      entity.name.toLowerCase().includes(q) ||
      entity.aliases?.some((alias) => alias.toLowerCase().includes(q)) ||
      entity.id.toLowerCase().includes(q)
    );
  }, [entities, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const sourceEntries = Object.entries(sources) as Array<
    [string, { status: string; rowCount: number; datasetVersion: string | null; lastUpdated: number | null } | null]
  >;
  const mobilePreviewEntities = filteredLocal.slice(0, MOBILE_PREVIEW_COUNT);

  const toggleAuthority = (auth: string) => {
    setAuthorityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(auth)) next.delete(auth);
      else next.add(auth);
      return next;
    });
    setPage(1);
  };

  const toggleType = (type: string) => {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
    setPage(1);
  };

  const handleMapMode = () => {
    setMode("map");
    setNewsLayerToggle("sanctions-entities", true);
  };

  const mobileActionButtonStyle = {
    minHeight: 44,
    padding: "8px 10px",
    border: "1px solid #243246",
    background: "#111a27",
    color: "#d7e3ef",
    fontSize: 11,
    letterSpacing: "0.05em",
    textTransform: "uppercase" as const,
  };

  const mobileSourceCards = (
    <div style={{ display: "grid", gap: 8 }}>
      {sourceEntries.map(([name, entry]) => (
        <div
          key={name}
          style={{
            display: "grid",
            gap: 4,
            padding: 10,
            border: "1px solid #243246",
            background: "#0d1521",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <strong style={{ color: "#d7e3ef", fontSize: 12, letterSpacing: "0.04em" }}>{name.toUpperCase()}</strong>
            <span
              style={{
                fontSize: 10,
                letterSpacing: "0.06em",
                color:
                  entry?.status === "live"
                    ? "#69f0ae"
                    : entry?.status === "degraded"
                      ? "#ffc107"
                      : entry?.status === "unavailable"
                        ? "#ff5252"
                        : "#8da3b8",
              }}
            >
              {entry?.status?.toUpperCase() ?? "UNKNOWN"}
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 10, color: "#8da3b8" }}>
            <span>{entry?.rowCount ?? 0} rows</span>
            {entry?.lastUpdated ? <span>{new Date(entry.lastUpdated).toISOString().slice(11, 19)} UTC</span> : null}
          </div>
        </div>
      ))}
    </div>
  );

  const mobileEntityCards = (entitiesToRender: SanctionsEntity[]) => (
    <div style={{ display: "grid", gap: 8 }}>
      {entitiesToRender.length ? (
        entitiesToRender.map((entity) => (
          (() => {
            const isSelected = selectedId === entity.id;
            return (
              <button
                key={entity.id}
                type="button"
                onClick={() => setSelectedId(isSelected ? null : entity.id)}
                style={{
                  display: "grid",
                  gap: 6,
                  width: "100%",
                  padding: 10,
                  border: isSelected ? "1px solid rgba(137,229,255,0.45)" : "1px solid #243246",
                  background: isSelected ? "rgba(137,229,255,0.06)" : "#0d1521",
                  color: "#d7e3ef",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    lineHeight: 1.4,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {highlightMatch(entity.name, searchQuery)}
                </span>
                <span style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 10, color: "#8da3b8" }}>
                  <span>{entity.authority}</span>
                  <span>{entity.entityType}</span>
                  <span>GEO {geoConfidenceLabel(entity)}</span>
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: "#6e849d",
                    display: "-webkit-box",
                    WebkitLineClamp: isSelected ? 3 : 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    lineHeight: 1.35,
                  }}
                >
                  {entity.program || "No program label"}
                </span>
                {isSelected ? (
                  <div
                    style={{
                      display: "grid",
                      gap: 4,
                      paddingTop: 6,
                      borderTop: "1px solid rgba(137,229,255,0.12)",
                      fontSize: 10,
                      color: "#8da3b8",
                      lineHeight: 1.4,
                    }}
                  >
                    <span>ID {entity.id}</span>
                    {entity.aliases?.length ? (
                      <span
                        style={{
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        Aliases: {entity.aliases.slice(0, 4).join(", ")}
                      </span>
                    ) : null}
                    {entity.geo ? (
                      <span>
                        GEO {entity.jurisdictionCountry ?? entity.geo.placeName ?? "--"}
                        {entity.geo.lat != null && entity.geo.lon != null
                          ? ` / ${entity.geo.lat.toFixed(2)}, ${entity.geo.lon.toFixed(2)}`
                          : ""}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </button>
            );
          })()
        ))
      ) : (
        <div style={{ padding: "12px 0", textAlign: "center", color: "#6e849d", fontSize: 12 }}>
          {loading ? "Loading sanctions entities..." : "No entities match current filters."}
        </div>
      )}
    </div>
  );

  return (
    <Panel panelId="news-compliance" workspace="news">
      <PanelHeader
        title="COMPLIANCE"
        subtitle={loading ? "Loading..." : `${total} entities / sanctions monitoring`}
        {...lockHeaderProps}
        controls={
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              type="button"
              onClick={() => (mode === "list" ? handleMapMode() : setMode("list"))}
              style={{
                fontSize: "0.65rem",
                padding: "1px 6px",
                cursor: "pointer",
                background: mode === "map" ? "#ea80fc44" : "transparent",
                border: "1px solid #555",
                color: "#ddd",
                borderRadius: 2,
              }}
            >
              {mode === "list" ? "MAP" : "LIST"}
            </button>
            <PanelControls onRefresh={() => void fetchEntities()} />
          </div>
        }
      />
      <PanelBody noPadding className="si-compliance-panel-body">
        {isMobile ? (
          <div style={{ display: "grid", gap: 10, padding: 10 }}>
            <input
              type="text"
              placeholder="Search sanction entities..."
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setPage(1);
              }}
              style={{
                width: "100%",
                minHeight: 44,
                padding: "0 12px",
                fontSize: 12,
                background: "#0d1521",
                color: "#ddd",
                border: "1px solid #243246",
              }}
            />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
              <button type="button" style={mobileActionButtonStyle} onClick={() => setShowFullList(true)}>
                Open Full List
              </button>
              <button
                type="button"
                style={mobileActionButtonStyle}
                onClick={() => (mode === "list" ? handleMapMode() : setMode("list"))}
              >
                {mode === "list" ? "Show Map" : "Show List"}
              </button>
            </div>
            {mode === "map" ? (
              <div style={{ fontSize: 11, lineHeight: 1.45, color: "#8da3b8" }}>
                High and medium confidence sanctions markers are visible on the news map.
              </div>
            ) : null}
            {mobileSourceCards}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", fontSize: 10, color: "#8da3b8" }}>
              <span>
                Previewing {mobilePreviewEntities.length} of {filteredLocal.length || total}
              </span>
              {(filteredLocal.length > MOBILE_PREVIEW_COUNT || total > MOBILE_PREVIEW_COUNT) ? (
                <button
                  type="button"
                  onClick={() => setShowFullList(true)}
                  style={{
                    border: "1px solid #243246",
                    background: "transparent",
                    color: "#89e5ff",
                    padding: "6px 10px",
                    fontSize: 10,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  Open Full List
                </button>
              ) : null}
            </div>
            {mobileEntityCards(mobilePreviewEntities)}
          </div>
        ) : (
          <>
            <div style={{ padding: "4px 8px", display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", borderBottom: "1px solid #333" }}>
              <input
                type="text"
                placeholder="Search name, alias, ID..."
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setPage(1);
                }}
                style={{
                  flex: 1,
                  minWidth: 120,
                  fontSize: "0.7rem",
                  padding: "2px 6px",
                  background: "#111",
                  color: "#ddd",
                  border: "1px solid #444",
                  borderRadius: 2,
                }}
              />
              <label style={{ fontSize: "0.6rem", color: "#999", display: "flex", alignItems: "center", gap: 2 }}>
                <input
                  type="checkbox"
                  checked={hasIdFilter}
                  onChange={(event) => {
                    setHasIdFilter(event.target.checked);
                    setPage(1);
                  }}
                />
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
                    fontSize: "0.6rem",
                    padding: "1px 5px",
                    cursor: "pointer",
                    background: authorityFilter.has(auth) ? "#ea80fc44" : "transparent",
                    border: "1px solid #555",
                    color: "#ccc",
                    borderRadius: 2,
                  }}
                >
                  {auth}
                </button>
              ))}
              <span style={{ borderLeft: "1px solid #555", margin: "0 2px" }} />
              {ENTITY_TYPES.slice(0, 5).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleType(type)}
                  style={{
                    fontSize: "0.6rem",
                    padding: "1px 5px",
                    cursor: "pointer",
                    background: typeFilter.has(type) ? "#4fc3f744" : "transparent",
                    border: "1px solid #555",
                    color: "#ccc",
                    borderRadius: 2,
                  }}
                >
                  {type}
                </button>
              ))}
            </div>

            {mode === "map" ? (
              <div style={{ padding: "4px 8px", fontSize: "0.65rem", color: "#999", borderBottom: "1px solid #333" }}>
                Showing high and medium confidence markers on the map.
              </div>
            ) : null}

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
                        {geoConfidenceLabel(entity)}
                      </td>
                    </tr>
                  ))}
                  {!filteredLocal.length ? (
                    <tr>
                      <td colSpan={5} style={{ padding: "12px 6px", textAlign: "center", color: "#666" }}>
                        {loading ? "Loading sanctions entities..." : "No entities match current filters."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {total > PAGE_SIZE ? (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "4px 0", borderTop: "1px solid #333" }}>
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((prev) => prev - 1)}
                  style={{ fontSize: "0.65rem", color: "#ccc", cursor: "pointer", background: "none", border: "none" }}
                >
                  PREV
                </button>
                <span style={{ fontSize: "0.65rem", color: "#888" }}>Page {page} of {totalPages}</span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((prev) => prev + 1)}
                  style={{ fontSize: "0.65rem", color: "#ccc", cursor: "pointer", background: "none", border: "none" }}
                >
                  NEXT
                </button>
              </div>
            ) : null}

            <div style={{ borderTop: "1px solid #333" }}>
              <ComplianceDataStatusPanel />
            </div>
          </>
        )}
      </PanelBody>
      <PanelFooter
        source="SANCTIONS"
        updatedAt={Date.now()}
        health={loading ? "loading" : total > 0 ? "ok" : "stale"}
        message={
          loading
            ? "Fetching..."
            : isMobile
              ? `${Math.min(mobilePreviewEntities.length, filteredLocal.length || total)} preview cards / ${sourceEntries.filter(([, value]) => value?.status === "live").length} live sources`
              : `${total} entities from ${sourceEntries.filter(([, value]) => value?.status === "live").length} live sources`
        }
      />
      {isMobile && showFullList ? (
        <PhoneOverlayShell
          title={`Compliance | ${filteredLocal.length || total} entities`}
          onClose={() => setShowFullList(false)}
          footer={
            total > PAGE_SIZE ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                <button
                  type="button"
                  className="si-phone-overlay-action"
                  disabled={page <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  style={{ width: "100%", opacity: page <= 1 ? 0.45 : 1 }}
                >
                  Prev
                </button>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#8da3b8" }}>
                  Page {page} / {totalPages}
                </div>
                <button
                  type="button"
                  className="si-phone-overlay-action"
                  disabled={page >= totalPages}
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  style={{ width: "100%", opacity: page >= totalPages ? 0.45 : 1 }}
                >
                  Next
                </button>
              </div>
            ) : null
          }
        >
          <div style={{ display: "grid", gap: 10 }}>
            <input
              type="text"
              placeholder="Search name, alias, or ID..."
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setPage(1);
              }}
              style={{
                width: "100%",
                minHeight: 44,
                padding: "0 12px",
                fontSize: 12,
                background: "#0d1521",
                color: "#ddd",
                border: "1px solid #243246",
              }}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {AUTHORITIES.map((auth) => (
                <button
                  key={auth}
                  type="button"
                  onClick={() => toggleAuthority(auth)}
                  style={{
                    minHeight: 40,
                    padding: "0 12px",
                    border: "1px solid #243246",
                    background: authorityFilter.has(auth) ? "rgba(234,128,252,0.2)" : "#111a27",
                    color: "#d7e3ef",
                    fontSize: 11,
                  }}
                >
                  {auth}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {ENTITY_TYPES.slice(0, 5).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleType(type)}
                  style={{
                    minHeight: 40,
                    padding: "0 12px",
                    border: "1px solid #243246",
                    background: typeFilter.has(type) ? "rgba(79,195,247,0.18)" : "#111a27",
                    color: "#d7e3ef",
                    fontSize: 11,
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#8da3b8" }}>
              <input
                type="checkbox"
                checked={hasIdFilter}
                onChange={(event) => {
                  setHasIdFilter(event.target.checked);
                  setPage(1);
                }}
              />
              Has identifier
            </label>
            {mobileEntityCards(filteredLocal)}
          </div>
        </PhoneOverlayShell>
      ) : null}
    </Panel>
  );
}
