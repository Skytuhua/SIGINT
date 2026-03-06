"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

export interface EconomicCenterDetailData {
  id: string;
  name: string;
  country: string;
  countryIso2?: string;
  admin1?: string;
  lat: number;
  lon: number;
  population?: number;
  scoreTotal: number;
  scoreBreakdown: {
    finance: number;
    trade: number;
    urban: number;
    macro: number;
  };
  rank: number;
  keyAssets: {
    exchanges: Array<{ name: string; wikidataQid: string }>;
    ports: Array<{ name: string; wikidataQid: string }>;
    airports: Array<{ name: string; wikidataQid: string }>;
  };
  sourceTrace: {
    wikidataQid: string;
    overpassQuery: string;
    worldBankIndicators: string[];
    lastUpdated: {
      wikidata: number;
      overpass: number;
      worldbank: number;
    };
  } | null;
  lastUpdated: number | null;
}

interface Props {
  detail: EconomicCenterDetailData;
  onClose: () => void;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatLatLon(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}°${ns}  ${Math.abs(lon).toFixed(4)}°${ew}`;
}

function formatPopulation(pop: number): string {
  if (pop >= 1_000_000) return `${(pop / 1_000_000).toFixed(1)}M`;
  if (pop >= 1_000) return `${Math.round(pop / 1_000)}K`;
  return String(pop);
}

/** Derive an economic tier from rank and total score */
function economicTier(rank: number, score: number): "HIGH" | "MED" | "LOW" {
  if (rank > 0 && rank <= 25) return "HIGH";
  if (score >= 70) return "HIGH";
  if (rank > 0 && rank <= 60) return "MED";
  if (score >= 50) return "MED";
  return "LOW";
}

function tierLabel(tier: "HIGH" | "MED" | "LOW"): string {
  if (tier === "HIGH") return "TOP TIER";
  if (tier === "MED") return "MAJOR";
  return "REGIONAL";
}

/** Simple day/night heuristic from lon offset */
function computeDayNight(lat: number, lon: number): "DAY" | "NIGHT" {
  const utcHour = new Date().getUTCHours() + new Date().getUTCMinutes() / 60;
  const localHour = (utcHour + lon / 15 + 24) % 24;
  const latAdj = lat > 45 || lat < -45 ? 1 : 0;
  return localHour >= 6 + latAdj && localHour < 18 - latAdj ? "DAY" : "NIGHT";
}

/** Compact age string from a UTC timestamp (ms) */
function formatAge(ts: number): string {
  if (!Number.isFinite(ts) || ts === 0) return "—";
  const ms = Date.now() - ts;
  if (ms < 0) return "just now";
  const m = Math.max(1, Math.round(ms / 60_000));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** Pipeline source status derived from last-updated timestamp */
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

/** Mini score bar — 10 blocks */
function ScoreBar({ value, color }: { value: number; color: string }) {
  const filled = Math.max(0, Math.min(10, Math.round(value / 10)));
  return (
    <span style={{ fontFamily: "monospace", fontSize: 9, letterSpacing: "0.02em", color }}>
      {"█".repeat(filled)}
      <span style={{ opacity: 0.25 }}>{"░".repeat(10 - filled)}</span>
    </span>
  );
}

/** Derive descriptive tags from asset data and scores */
function deriveTags(detail: EconomicCenterDetailData): string[] {
  const tags: string[] = [];
  if (detail.keyAssets.exchanges.length > 0) tags.push("FINANCE HUB");
  if (detail.keyAssets.ports.length > 0) tags.push("PORT CITY");
  if (detail.keyAssets.airports.length >= 2) tags.push("MAJOR AIRPORTS");
  else if (detail.keyAssets.airports.length === 1) tags.push("TRANSPORT NODE");
  if (detail.scoreBreakdown.trade >= 70 && !tags.includes("PORT CITY")) tags.push("TRADE GATEWAY");
  if (detail.scoreBreakdown.macro >= 75) tags.push("MACRO ANCHOR");
  return tags;
}

/** Build a 2–3 sentence "why it matters" description from data */
function buildWhyItMatters(detail: EconomicCenterDetailData, tier: "HIGH" | "MED" | "LOW"): string {
  const parts: string[] = [];

  if (tier === "HIGH") {
    parts.push(
      detail.rank > 0
        ? `Ranked #${detail.rank} globally, ${detail.name} is one of the world's premier economic centers.`
        : `${detail.name} ranks among the world's most influential economic centers.`
    );
  } else if (tier === "MED") {
    parts.push(
      detail.rank > 0
        ? `Ranked #${detail.rank}, ${detail.name} is a significant regional economic hub.`
        : `${detail.name} is a key regional economic hub in ${detail.country}.`
    );
  } else {
    parts.push(`${detail.name} serves as an important local economic center in ${detail.country}.`);
  }

  if (detail.keyAssets.exchanges.length > 0) {
    const names = detail.keyAssets.exchanges.slice(0, 2).map((e) => e.name).join(" and ");
    parts.push(`Home to ${names}, it hosts major equity and capital markets.`);
  } else if (detail.scoreBreakdown.finance >= 70) {
    parts.push("Strong financial services sector drives capital flows across the region.");
  }

  if (detail.keyAssets.ports.length > 0) {
    parts.push(
      `With ${detail.keyAssets.ports.length} major port${detail.keyAssets.ports.length > 1 ? "s" : ""}, it serves as a critical maritime trade gateway.`
    );
  } else if (detail.scoreBreakdown.trade >= 70) {
    parts.push("High trade connectivity makes it a key node in regional and global supply chains.");
  }

  return parts.join(" ");
}

// ─── component ────────────────────────────────────────────────────────────────

export default function EconomicCenterDetailCard({ detail, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const tier = useMemo(() => economicTier(detail.rank, detail.scoreTotal), [detail.rank, detail.scoreTotal]);
  const tags = useMemo(() => deriveTags(detail), [detail]);
  const whyItMatters = useMemo(() => buildWhyItMatters(detail, tier), [detail, tier]);
  const dayNight = useMemo(() => computeDayNight(detail.lat, detail.lon), [detail.lat, detail.lon]);

  const wdStatus = useMemo(
    () => sourceStatusFromTs(detail.sourceTrace?.lastUpdated.wikidata ?? 0),
    [detail.sourceTrace]
  );
  const osmStatus = useMemo(
    () => sourceStatusFromTs(detail.sourceTrace?.lastUpdated.overpass ?? 0),
    [detail.sourceTrace]
  );
  const wbStatus = useMemo(
    () => sourceStatusFromTs(detail.sourceTrace?.lastUpdated.worldbank ?? 0),
    [detail.sourceTrace]
  );

  const updatedLabel =
    detail.lastUpdated && Number.isFinite(detail.lastUpdated)
      ? new Date(detail.lastUpdated).toUTCString()
      : "—";

  // External reference URLs
  const wikidataUrl = detail.sourceTrace?.wikidataQid
    ? `https://www.wikidata.org/wiki/${detail.sourceTrace.wikidataQid}`
    : null;
  const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(detail.name.replace(/ /g, "_"))}`;
  const worldBankUrl = detail.countryIso2
    ? `https://data.worldbank.org/country/${detail.countryIso2.toLowerCase()}`
    : `https://data.worldbank.org/country/${encodeURIComponent(detail.country)}`;
  const osmUrl = `https://www.openstreetmap.org/#map=12/${detail.lat.toFixed(4)}/${detail.lon.toFixed(4)}`;

  if (!mounted) return null;

  return createPortal(
    <div className="wv-hotspot-card" role="dialog" aria-label="Economic center detail">

      {/* ── Header ── */}
      <div className="wv-hotspot-card-hdr">
        <div className="wv-hotspot-card-headline">
          <div className="wv-hotspot-name">
            {detail.name.toUpperCase()}
          </div>
          <span className={`wv-hotspot-tier tier-${tier.toLowerCase()}`}>
            {detail.rank > 0 ? `RANK #${detail.rank}` : tierLabel(tier)} · {tierLabel(tier)}
          </span>
        </div>
        <button
          type="button"
          className="wv-hotspot-close"
          onClick={onClose}
          aria-label="Close economic center details"
        >
          ×
        </button>
      </div>

      {/* Tags row */}
      {tags.length > 0 && (
        <div className="wv-hotspot-tags">{tags.join(" / ")}</div>
      )}

      {/* Location sub-line */}
      <div style={{ marginTop: 2, color: "var(--wv-text-muted)", fontSize: 9 }}>
        {[detail.admin1, detail.country].filter(Boolean).join(", ")}
        {" · "}
        {formatLatLon(detail.lat, detail.lon)}
        {" · LOCAL "}
        <span style={{ color: dayNight === "DAY" ? "#ffbf47" : "#76b1ff", fontWeight: 700 }}>
          {dayNight}
        </span>
      </div>

      {/* ── Economic Score ── */}
      <div className="wv-hotspot-section">
        <div className="wv-hotspot-kicker">ECONOMIC WEIGHT</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <div className="wv-hotspot-score">{detail.scoreTotal}<span style={{ fontSize: 11, fontWeight: 400 }}>/100</span></div>
          <div className="wv-hotspot-trend">
            {tier === "HIGH" ? "▲ GLOBAL TIER" : tier === "MED" ? "● MAJOR HUB" : "▼ REGIONAL"}
          </div>
        </div>
        {/* Score breakdown grid */}
        <div className="wv-hotspot-subscores" style={{ marginTop: 6 }}>
          <div>
            <div style={{ color: "#f4a261", fontWeight: 600, fontSize: 9, marginBottom: 1 }}>FINANCE</div>
            <ScoreBar value={detail.scoreBreakdown.finance} color="#f4a261" />
            <span style={{ color: "#f4a261", fontVariantNumeric: "tabular-nums", marginLeft: 4, fontSize: 9 }}>
              {detail.scoreBreakdown.finance}
            </span>
          </div>
          <div>
            <div style={{ color: "#2dd4bf", fontWeight: 600, fontSize: 9, marginBottom: 1 }}>TRADE</div>
            <ScoreBar value={detail.scoreBreakdown.trade} color="#2dd4bf" />
            <span style={{ color: "#2dd4bf", fontVariantNumeric: "tabular-nums", marginLeft: 4, fontSize: 9 }}>
              {detail.scoreBreakdown.trade}
            </span>
          </div>
          <div>
            <div style={{ color: "#94a3b8", fontWeight: 600, fontSize: 9, marginBottom: 1 }}>URBAN</div>
            <ScoreBar value={detail.scoreBreakdown.urban} color="#94a3b8" />
            <span style={{ color: "#94a3b8", fontVariantNumeric: "tabular-nums", marginLeft: 4, fontSize: 9 }}>
              {detail.scoreBreakdown.urban}
            </span>
          </div>
          <div>
            <div style={{ color: "#a78bfa", fontWeight: 600, fontSize: 9, marginBottom: 1 }}>MACRO</div>
            <ScoreBar value={detail.scoreBreakdown.macro} color="#a78bfa" />
            <span style={{ color: "#a78bfa", fontVariantNumeric: "tabular-nums", marginLeft: 4, fontSize: 9 }}>
              {detail.scoreBreakdown.macro}
            </span>
          </div>
        </div>
      </div>

      {/* ── Key Infrastructure ── */}
      <div className="wv-hotspot-section">
        <div className="wv-hotspot-kicker">KEY INFRASTRUCTURE</div>
        <ul className="wv-hotspot-drivers">
          {detail.keyAssets.exchanges.length > 0 && (
            <li>
              <span style={{ color: "#f4a261" }}>EXCHANGES</span>{" — "}
              {detail.keyAssets.exchanges.map((e, i) => (
                <span key={e.wikidataQid}>
                  {i > 0 && ", "}
                  <a
                    href={`https://www.wikidata.org/wiki/${e.wikidataQid}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "var(--wv-text)", textDecoration: "underline" }}
                  >
                    {e.name}
                  </a>
                </span>
              ))}
            </li>
          )}
          {detail.keyAssets.ports.length > 0 && (
            <li>
              <span style={{ color: "#2dd4bf" }}>PORTS</span>{" — "}
              {detail.keyAssets.ports.map((p, i) => (
                <span key={p.wikidataQid}>
                  {i > 0 && ", "}
                  <a
                    href={`https://www.wikidata.org/wiki/${p.wikidataQid}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "var(--wv-text)", textDecoration: "underline" }}
                  >
                    {p.name}
                  </a>
                </span>
              ))}
            </li>
          )}
          {detail.keyAssets.airports.length > 0 && (
            <li>
              <span style={{ color: "#94a3b8" }}>AIRPORTS</span>{" — "}
              {detail.keyAssets.airports.map((a, i) => (
                <span key={a.wikidataQid}>
                  {i > 0 && ", "}
                  <a
                    href={`https://www.wikidata.org/wiki/${a.wikidataQid}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "var(--wv-text)", textDecoration: "underline" }}
                  >
                    {a.name}
                  </a>
                </span>
              ))}
            </li>
          )}
          {detail.population != null && Number.isFinite(detail.population) && (
            <li>
              <span style={{ color: "#a78bfa" }}>METRO POP</span>{" — "}
              {formatPopulation(detail.population)}
            </li>
          )}
          {detail.keyAssets.exchanges.length === 0 &&
            detail.keyAssets.ports.length === 0 &&
            detail.keyAssets.airports.length === 0 && (
              <li style={{ color: "var(--wv-text-muted)" }}>No major assets identified</li>
            )}
        </ul>
      </div>

      {/* ── Why It Matters ── */}
      <div className="wv-hotspot-section">
        <div className="wv-hotspot-kicker">WHY IT MATTERS</div>
        <div className="wv-hotspot-summary">{whyItMatters}</div>
      </div>

      {/* ── World Bank Indicators ── */}
      {detail.sourceTrace && detail.sourceTrace.worldBankIndicators.length > 0 && (
        <div className="wv-hotspot-section">
          <div className="wv-hotspot-kicker">WORLD BANK INDICATORS</div>
          <ul className="wv-hotspot-drivers">
            {detail.sourceTrace.worldBankIndicators.map((ind) => (
              <li key={ind}>
                <a
                  href={`https://data.worldbank.org/indicator/${encodeURIComponent(ind)}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--wv-text)", textDecoration: "underline" }}
                >
                  {ind}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── External References ── */}
      <div className="wv-hotspot-section">
        <div className="wv-hotspot-kicker">EXTERNAL REFERENCES</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
          {wikidataUrl && (
            <a
              href={wikidataUrl}
              target="_blank"
              rel="noreferrer"
              className="wv-hotspot-status"
              style={{ textDecoration: "none", color: "var(--wv-text-muted)", cursor: "pointer" }}
            >
              WIKIDATA
            </a>
          )}
          <a
            href={wikiUrl}
            target="_blank"
            rel="noreferrer"
            className="wv-hotspot-status"
            style={{ textDecoration: "none", color: "var(--wv-text-muted)", cursor: "pointer" }}
          >
            WIKIPEDIA
          </a>
          <a
            href={worldBankUrl}
            target="_blank"
            rel="noreferrer"
            className="wv-hotspot-status"
            style={{ textDecoration: "none", color: "var(--wv-text-muted)", cursor: "pointer" }}
          >
            WORLD BANK
          </a>
          <a
            href={osmUrl}
            target="_blank"
            rel="noreferrer"
            className="wv-hotspot-status"
            style={{ textDecoration: "none", color: "var(--wv-text-muted)", cursor: "pointer" }}
          >
            OPENSTREETMAP
          </a>
        </div>
      </div>

      {/* ── Pipeline Status ── */}
      <div className="wv-hotspot-section">
        <div className="wv-hotspot-kicker">PIPELINE STATUS</div>
        <div className="wv-hotspot-status-row">
          <span className={`wv-hotspot-status ${sourceStatusClass(wdStatus)}`}>
            wikidata:{wdStatus}
          </span>
          <span className={`wv-hotspot-status ${sourceStatusClass(osmStatus)}`}>
            overpass:{osmStatus}
          </span>
          <span className={`wv-hotspot-status ${sourceStatusClass(wbStatus)}`}>
            worldbank:{wbStatus}
          </span>
        </div>
        {detail.sourceTrace && (
          <details className="wv-hotspot-trace" style={{ marginTop: 4 }}>
            <summary>Source timestamps</summary>
            <div>WD: {formatAge(detail.sourceTrace.lastUpdated.wikidata)}</div>
            <div>OSM: {formatAge(detail.sourceTrace.lastUpdated.overpass)}</div>
            <div>WB: {formatAge(detail.sourceTrace.lastUpdated.worldbank)}</div>
          </details>
        )}
        <div className="wv-hotspot-updated">Last refresh: {updatedLabel}</div>
      </div>

    </div>,
    document.body
  );
}
