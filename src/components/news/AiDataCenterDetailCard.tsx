"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

export interface AiDataCenterDetailData {
  id: string;
  name: string;
  country: string;
  countryIso2?: string;
  admin1?: string;
  centroidLat: number;
  centroidLon: number;
  operators: string[];
  operatorTypes: string[];
  siteCount: number;
  confidence: number;
  importance: number;
  importanceBreakdown: {
    operatorDiversity: number;
    hyperscalerPresence: number;
    siteScale: number;
    regionWeight: number;
  };
  sites: Array<{ name: string; operator: string; sourceType: string; sourceId: string }>;
  notes: string;
  sourceTrace: {
    wikidataQids: string[];
    osmIds: string[];
    overpassQuery: string;
    lastUpdated: { wikidata: number; overpass: number };
  } | null;
  lastUpdated: number | null;
}

interface Props {
  detail: AiDataCenterDetailData;
  onClose: () => void;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function formatLatLon(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}${ns}  ${Math.abs(lon).toFixed(4)}${ew}`;
}

function computeDayNight(lat: number, lon: number): "DAY" | "NIGHT" {
  const utcHour = new Date().getUTCHours() + new Date().getUTCMinutes() / 60;
  const localHour = (utcHour + lon / 15 + 24) % 24;
  const latAdj = lat > 45 || lat < -45 ? 1 : 0;
  return localHour >= 6 + latAdj && localHour < 18 - latAdj ? "DAY" : "NIGHT";
}

function importanceTier(importance: number): "HIGH" | "MED" | "LOW" {
  if (importance >= 70) return "HIGH";
  if (importance >= 40) return "MED";
  return "LOW";
}

function tierLabel(tier: "HIGH" | "MED" | "LOW"): string {
  if (tier === "HIGH") return "MAJOR HUB";
  if (tier === "MED") return "SIGNIFICANT";
  return "REGIONAL";
}

function confidenceLabel(c: number): string {
  if (c >= 75) return "HIGH";
  if (c >= 50) return "MEDIUM";
  return "LOW";
}

function formatAge(ts: number): string {
  if (!Number.isFinite(ts) || ts === 0) return "\u2014";
  const ms = Date.now() - ts;
  if (ms < 0) return "just now";
  const m = Math.max(1, Math.round(ms / 60_000));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function sourceStatusFromTs(ts: number, maxStaleMs = 12 * 3_600_000): "live" | "cached" | "degraded" | "unavailable" {
  if (!Number.isFinite(ts) || ts === 0) return "unavailable";
  const age = Date.now() - ts;
  if (age < maxStaleMs) return "live";
  if (age < maxStaleMs * 4) return "cached";
  return "degraded";
}

function sourceStatusClass(s: "live" | "cached" | "degraded" | "unavailable"): string {
  if (s === "live") return "is-live";
  if (s === "cached") return "is-cached";
  if (s === "degraded") return "is-degraded";
  return "is-unavailable";
}

function ScoreBar({ value, color }: { value: number; color: string }) {
  const filled = Math.max(0, Math.min(10, Math.round(value / 10)));
  return (
    <span style={{ fontFamily: "monospace", fontSize: 9, letterSpacing: "0.02em", color }}>
      {"\u2588".repeat(filled)}
      <span style={{ opacity: 0.25 }}>{"\u2591".repeat(10 - filled)}</span>
    </span>
  );
}

function deriveTags(detail: AiDataCenterDetailData): string[] {
  const tags: string[] = [];
  const hasHyperscaler = detail.operatorTypes.includes("hyperscaler");
  if (hasHyperscaler) tags.push("HYPERSCALER HUB");
  if (detail.operators.length > 1) tags.push("MULTI-OPERATOR");
  if (detail.operatorTypes.includes("colocation")) tags.push("COLOCATION");
  if (detail.siteCount >= 5) tags.push("HIGH DENSITY");
  if (detail.confidence >= 80) tags.push("HIGH CONFIDENCE");
  return tags;
}

function operatorBreakdown(operators: string[], operatorTypes: string[]): string {
  const counts: Record<string, number> = {};
  for (const t of operatorTypes) {
    counts[t] = (counts[t] ?? 0) + 1;
  }
  const parts: string[] = [];
  if (counts["hyperscaler"]) parts.push(`${counts["hyperscaler"]} hyperscaler${counts["hyperscaler"] > 1 ? "s" : ""}`);
  if (counts["colocation"]) parts.push(`${counts["colocation"]} colocation`);
  const other = operators.length - (counts["hyperscaler"] ?? 0) - (counts["colocation"] ?? 0);
  if (other > 0) parts.push(`${other} other`);
  return parts.join(" · ");
}

function strategicContext(tier: "HIGH" | "MED" | "LOW", detail: AiDataCenterDetailData): string {
  const hyperscalers = detail.operators.filter((_, i) => detail.operatorTypes[i] === "hyperscaler");
  if (tier === "HIGH") {
    return `Major compute hub with ${detail.siteCount} facilities. ${hyperscalers.length > 0 ? `Hyperscaler presence (${hyperscalers.slice(0, 3).join(", ")}) indicates significant cloud infrastructure concentration.` : ""} Critical node for regional AI and cloud workload routing.`;
  }
  if (tier === "MED") {
    return `Significant regional data center concentration with ${detail.siteCount} facilities. ${hyperscalers.length > 0 ? `Includes ${hyperscalers.length} hyperscaler operator${hyperscalers.length > 1 ? "s" : ""}.` : "Mix of colocation providers."} Notable for regional cloud capacity.`;
  }
  return `Regional data center cluster with ${detail.siteCount} facilit${detail.siteCount === 1 ? "y" : "ies"} in ${detail.country}. Serves local cloud and enterprise compute demand.`;
}

// ── component ────────────────────────────────────────────────────────────────

export default function AiDataCenterDetailCard({ detail, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  const [showAllSites, setShowAllSites] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const tier = useMemo(() => importanceTier(detail.importance), [detail.importance]);
  const tags = useMemo(() => deriveTags(detail), [detail]);
  const dayNight = useMemo(() => computeDayNight(detail.centroidLat, detail.centroidLon), [detail.centroidLat, detail.centroidLon]);
  const opBreakdown = useMemo(() => operatorBreakdown(detail.operators, detail.operatorTypes), [detail.operators, detail.operatorTypes]);
  const context = useMemo(() => strategicContext(tier, detail), [tier, detail]);
  const osmMapUrl = `https://www.openstreetmap.org/?mlat=${detail.centroidLat.toFixed(5)}&mlon=${detail.centroidLon.toFixed(5)}#map=11/${detail.centroidLat.toFixed(5)}/${detail.centroidLon.toFixed(5)}`;
  const googleMapsUrl = `https://www.google.com/maps/@${detail.centroidLat.toFixed(5)},${detail.centroidLon.toFixed(5)},12z`;

  const wdStatus = useMemo(
    () => sourceStatusFromTs(detail.sourceTrace?.lastUpdated.wikidata ?? 0),
    [detail.sourceTrace],
  );
  const osmStatus = useMemo(
    () => sourceStatusFromTs(detail.sourceTrace?.lastUpdated.overpass ?? 0),
    [detail.sourceTrace],
  );

  const updatedLabel =
    detail.lastUpdated && Number.isFinite(detail.lastUpdated)
      ? new Date(detail.lastUpdated).toUTCString()
      : "\u2014";

  const visibleSites = showAllSites ? detail.sites : detail.sites.slice(0, 5);
  const hiddenCount = detail.sites.length - 5;

  // Evidence bullets
  const evidence = useMemo(() => {
    const items: string[] = [];
    const wdCount = detail.sourceTrace?.wikidataQids.length ?? 0;
    const osmCount = detail.sourceTrace?.osmIds.length ?? 0;
    if (wdCount > 0) items.push(`${wdCount} Wikidata data_center entit${wdCount === 1 ? "y" : "ies"}`);
    if (osmCount > 0) items.push(`${osmCount} OSM datacenter feature${osmCount === 1 ? "" : "s"}`);
    if (detail.operatorTypes.includes("hyperscaler")) {
      const hs = detail.operators.filter((_, i) => detail.operatorTypes[i] === "hyperscaler");
      if (hs.length > 0) items.push(`${hs.length} hyperscaler operator${hs.length === 1 ? "" : "s"} present`);
    }
    if (detail.confidence >= 80) items.push("High confidence: multi-source corroboration");
    return items;
  }, [detail]);

  if (!mounted) return null;

  return createPortal(
    <div className="si-hotspot-card" role="dialog" aria-label="AI data center cluster detail">

      {/* Header */}
      <div className="si-hotspot-card-hdr">
        <div className="si-hotspot-card-headline">
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", opacity: 0.5, marginBottom: 2 }}>
            AI DATA CENTER CLUSTER
          </div>
          <div className="si-hotspot-name">{detail.name.toUpperCase()}</div>
          <span className={`si-hotspot-tier tier-${tier.toLowerCase()}`}>
            {tierLabel(tier)}
          </span>
        </div>
        <button
          type="button"
          className="si-hotspot-close"
          onClick={onClose}
          aria-label="Close data center details"
        >
          ×
        </button>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="si-hotspot-tags">{tags.join(" / ")}</div>
      )}

      {/* Location */}
      <div style={{ marginTop: 2, color: "var(--si-text-muted)", fontSize: 9 }}>
        {[detail.admin1, detail.country].filter(Boolean).join(", ")}
        {" \u00b7 "}
        {formatLatLon(detail.centroidLat, detail.centroidLon)}
        {" \u00b7 LOCAL "}
        <span style={{ color: dayNight === "DAY" ? "#ffbf47" : "#76b1ff", fontWeight: 700 }}>
          {dayNight}
        </span>
      </div>

      {/* Description */}
      {detail.notes && detail.notes.trim() && (
        <div className="si-hotspot-section">
          <div className="si-hotspot-kicker">DESCRIPTION</div>
          <div className="si-hotspot-summary">{detail.notes}</div>
        </div>
      )}

      {/* Strategic Context */}
      <div className="si-hotspot-section">
        <div className="si-hotspot-kicker">STRATEGIC CONTEXT</div>
        <div className="si-hotspot-summary">{context}</div>
      </div>

      {/* Compute Importance */}
      <div className="si-hotspot-section">
        <div className="si-hotspot-kicker">COMPUTE IMPORTANCE</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <div className="si-hotspot-score">
            {detail.importance}<span style={{ fontSize: 11, fontWeight: 400 }}>/100</span>
          </div>
          <div className="si-hotspot-trend">
            CONFIDENCE: {confidenceLabel(detail.confidence)}
          </div>
        </div>
        <div className="si-hotspot-subscores" style={{ marginTop: 6 }}>
          <div>
            <div style={{ color: "#b39ddb", fontWeight: 600, fontSize: 9, marginBottom: 1 }}>OPERATOR DIVERSITY</div>
            <ScoreBar value={detail.importanceBreakdown.operatorDiversity} color="#b39ddb" />
            <span style={{ color: "#b39ddb", fontVariantNumeric: "tabular-nums", marginLeft: 4, fontSize: 9 }}>
              {detail.importanceBreakdown.operatorDiversity}
            </span>
          </div>
          <div>
            <div style={{ color: "#7c4dff", fontWeight: 600, fontSize: 9, marginBottom: 1 }}>HYPERSCALER PRESENCE</div>
            <ScoreBar value={detail.importanceBreakdown.hyperscalerPresence} color="#7c4dff" />
            <span style={{ color: "#7c4dff", fontVariantNumeric: "tabular-nums", marginLeft: 4, fontSize: 9 }}>
              {detail.importanceBreakdown.hyperscalerPresence}
            </span>
          </div>
          <div>
            <div style={{ color: "#9575cd", fontWeight: 600, fontSize: 9, marginBottom: 1 }}>SITE SCALE</div>
            <ScoreBar value={detail.importanceBreakdown.siteScale} color="#9575cd" />
            <span style={{ color: "#9575cd", fontVariantNumeric: "tabular-nums", marginLeft: 4, fontSize: 9 }}>
              {detail.importanceBreakdown.siteScale}
            </span>
          </div>
          <div>
            <div style={{ color: "#ce93d8", fontWeight: 600, fontSize: 9, marginBottom: 1 }}>REGION WEIGHT</div>
            <ScoreBar value={detail.importanceBreakdown.regionWeight} color="#ce93d8" />
            <span style={{ color: "#ce93d8", fontVariantNumeric: "tabular-nums", marginLeft: 4, fontSize: 9 }}>
              {detail.importanceBreakdown.regionWeight}
            </span>
          </div>
        </div>
      </div>

      {/* Operators */}
      {detail.operators.length > 0 && (
        <div className="si-hotspot-section">
          <div className="si-hotspot-kicker">OPERATORS</div>
          {opBreakdown && (
            <div style={{ color: "var(--si-text-muted)", fontSize: 9, marginBottom: 4 }}>{opBreakdown}</div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
            {detail.operators.map((op, i) => (
              <span key={op} className="si-hotspot-status" style={{ color: detail.operatorTypes[i] === "hyperscaler" ? "#7c4dff" : "#b39ddb" }}>
                {op}
                {detail.operatorTypes[i] === "hyperscaler" && (
                  <span style={{ opacity: 0.6, marginLeft: 2 }}>⬡</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Sites */}
      <div className="si-hotspot-section">
        <div className="si-hotspot-kicker">SITES ({detail.siteCount})</div>
        <ul className="si-hotspot-drivers">
          {visibleSites.map((s) => (
            <li key={`${s.sourceType}-${s.sourceId}`}>
              <span style={{ color: "#b39ddb" }}>{s.name}</span>
              {" \u2014 "}
              {s.operator}
              <span style={{ opacity: 0.5 }}> ({s.sourceType})</span>
            </li>
          ))}
          {!showAllSites && hiddenCount > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setShowAllSites(true)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#7c4dff",
                  cursor: "pointer",
                  fontSize: "inherit",
                  padding: 0,
                  textDecoration: "underline",
                }}
              >
                +{hiddenCount} more
              </button>
            </li>
          )}
        </ul>
      </div>

      {/* Evidence */}
      {evidence.length > 0 && (
        <div className="si-hotspot-section">
          <div className="si-hotspot-kicker">EVIDENCE</div>
          <ul className="si-hotspot-drivers">
            {evidence.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* External References */}
      <div className="si-hotspot-section">
        <div className="si-hotspot-kicker">SOURCE TRACE</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
          {detail.sourceTrace?.wikidataQids.slice(0, 5).map((qid) => (
            <a
              key={qid}
              href={`https://www.wikidata.org/wiki/${qid}`}
              target="_blank"
              rel="noreferrer"
              className="si-hotspot-status"
              style={{ textDecoration: "none", color: "var(--si-text-muted)", cursor: "pointer" }}
            >
              WD:{qid}
            </a>
          ))}
          {detail.sourceTrace?.osmIds.slice(0, 5).map((osmId) => (
            <a
              key={osmId}
              href={`https://www.openstreetmap.org/${osmId}`}
              target="_blank"
              rel="noreferrer"
              className="si-hotspot-status"
              style={{ textDecoration: "none", color: "var(--si-text-muted)", cursor: "pointer" }}
            >
              OSM:{osmId}
            </a>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
          <a
            href={osmMapUrl}
            target="_blank"
            rel="noreferrer"
            className="si-hotspot-status"
            style={{ textDecoration: "none", color: "var(--si-text-muted)", cursor: "pointer" }}
          >
            VIEW ON OSM ↗
          </a>
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noreferrer"
            className="si-hotspot-status"
            style={{ textDecoration: "none", color: "var(--si-text-muted)", cursor: "pointer" }}
          >
            GOOGLE MAPS ↗
          </a>
        </div>
      </div>

      {/* Pipeline Status */}
      <div className="si-hotspot-section">
        <div className="si-hotspot-kicker">PIPELINE STATUS</div>
        <div className="si-hotspot-status-row">
          <span className={`si-hotspot-status ${sourceStatusClass(wdStatus)}`}>
            wikidata:{wdStatus}
          </span>
          <span className={`si-hotspot-status ${sourceStatusClass(osmStatus)}`}>
            overpass:{osmStatus}
          </span>
        </div>
        {detail.sourceTrace && (
          <details className="si-hotspot-trace" style={{ marginTop: 4 }}>
            <summary>Source timestamps</summary>
            <div>WD: {formatAge(detail.sourceTrace.lastUpdated.wikidata)}</div>
            <div>OSM: {formatAge(detail.sourceTrace.lastUpdated.overpass)}</div>
          </details>
        )}
        <div className="si-hotspot-updated">Last refresh: {updatedLabel}</div>
      </div>

    </div>,
    document.body,
  );
}
