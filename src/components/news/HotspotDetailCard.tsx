"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

export type HotspotTimeWindow = "6h" | "24h" | "7d";

type SourceStatus = "live" | "cached" | "degraded" | "unavailable";

interface HotspotDriverTrace {
  sourceName: string;
  sourceUrl?: string;
  timestamp: number;
}

interface HotspotDriver {
  text: string;
  score: number;
  trace: HotspotDriverTrace;
}

export interface HotspotDetailData {
  hotspotId: string;
  name: string;
  tier: "LOW" | "MED" | "HIGH";
  tags: string[];
  summary: string;
  baselineScore: number;
  currentScore: number;
  trend: string;
  subScores: {
    news: number;
    cii: number;
    geo: number;
    military: number;
  };
  location: {
    countries: string[];
    coordinates: { lat: number; lon: number };
    status: string;
  };
  whyItMatters: string;
  keyEntities: string[];
  historicalContext: {
    lastMajorEvent: { date: string; label: string };
    precedents: string[];
    cyclicalPattern: string;
  };
  drivers: HotspotDriver[];
  sourceStatus: Record<string, SourceStatus>;
  timeWindow: HotspotTimeWindow;
  lastUpdated: string;
}

interface HotspotDetailCardProps {
  detail: HotspotDetailData;
  timeWindow: HotspotTimeWindow;
  onTimeWindowChange: (next: HotspotTimeWindow) => void;
  onClose: () => void;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v)).filter(Boolean);
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asSourceStatus(value: unknown): SourceStatus {
  if (value === "live" || value === "cached" || value === "degraded" || value === "unavailable") return value;
  return "unavailable";
}

function formatLatLon(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew}`;
}

function computeDayNight(lat: number, lon: number): "DAY" | "NIGHT" {
  const utcHour = new Date().getUTCHours() + new Date().getUTCMinutes() / 60;
  const localHour = (utcHour + lon / 15 + 24) % 24;
  const latAdjust = lat > 45 || lat < -45 ? 1 : 0;
  return localHour >= 6 + latAdjust && localHour < 18 - latAdjust ? "DAY" : "NIGHT";
}

function statusClass(status: SourceStatus): string {
  if (status === "live") return "is-live";
  if (status === "cached") return "is-cached";
  if (status === "degraded") return "is-degraded";
  return "is-unavailable";
}

function formatAge(ts: number): string {
  if (!Number.isFinite(ts)) return "unknown";
  const ms = Date.now() - ts;
  const m = Math.max(1, Math.round(ms / 60_000));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function hotspotDetailFromProps(props: Record<string, unknown>): HotspotDetailData | null {
  const hotspotId = String(props.hotspotId ?? "");
  const name = String(props.name ?? "");
  const tier = String(props.tier ?? "") as HotspotDetailData["tier"];
  if (!hotspotId || !name || (tier !== "LOW" && tier !== "MED" && tier !== "HIGH")) return null;

  const locationRaw = (props.location ?? {}) as Record<string, unknown>;
  const coordsRaw = (locationRaw.coordinates ?? {}) as Record<string, unknown>;
  const historicalRaw = (props.historicalContext ?? {}) as Record<string, unknown>;
  const lastMajorRaw = (historicalRaw.lastMajorEvent ?? {}) as Record<string, unknown>;
  const scoresRaw = (props.subScores ?? {}) as Record<string, unknown>;
  const sourceRaw = (props.sourceStatus ?? {}) as Record<string, unknown>;
  const driversRaw = Array.isArray(props.drivers) ? (props.drivers as Array<Record<string, unknown>>) : [];

  const sourceStatus: Record<string, SourceStatus> = {};
  for (const [k, v] of Object.entries(sourceRaw)) sourceStatus[k] = asSourceStatus(v);

  return {
    hotspotId,
    name,
    tier,
    tags: asStringArray(props.tags),
    summary: String(props.summary ?? ""),
    baselineScore: asNumber(props.baselineScore),
    currentScore: asNumber(props.currentScore),
    trend: String(props.trend ?? "WATCH -> STABLE"),
    subScores: {
      news: asNumber(scoresRaw.news),
      cii: asNumber(scoresRaw.cii),
      geo: asNumber(scoresRaw.geo),
      military: asNumber(scoresRaw.military),
    },
    location: {
      countries: asStringArray(locationRaw.countries),
      coordinates: { lat: asNumber(coordsRaw.lat), lon: asNumber(coordsRaw.lon) },
      status: String(locationRaw.status ?? "Monitoring"),
    },
    whyItMatters: String(props.whyItMatters ?? ""),
    keyEntities: asStringArray(props.keyEntities),
    historicalContext: {
      lastMajorEvent: {
        date: String(lastMajorRaw.date ?? ""),
        label: String(lastMajorRaw.label ?? ""),
      },
      precedents: asStringArray(historicalRaw.precedents),
      cyclicalPattern: String(historicalRaw.cyclicalPattern ?? ""),
    },
    drivers: driversRaw.map((driver) => {
      const traceRaw = (driver.trace ?? {}) as Record<string, unknown>;
      return {
        text: String(driver.text ?? "Driver"),
        score: asNumber(driver.score),
        trace: {
          sourceName: String(traceRaw.sourceName ?? "Unknown"),
          sourceUrl: typeof traceRaw.sourceUrl === "string" ? traceRaw.sourceUrl : undefined,
          timestamp: asNumber(traceRaw.timestamp, Date.now()),
        },
      };
    }),
    sourceStatus,
    timeWindow: props.timeWindow === "6h" || props.timeWindow === "7d" ? (props.timeWindow as HotspotTimeWindow) : "24h",
    lastUpdated: String(props.lastUpdated ?? new Date().toISOString()),
  };
}

export default function HotspotDetailCard({ detail, timeWindow, onTimeWindowChange, onClose }: HotspotDetailCardProps) {
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState<HotspotDetailData>(detail);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setActive(detail);
  }, [detail]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/news/layers/intel-hotspots?timeWindow=${timeWindow}`, { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { features?: Array<{ properties?: Record<string, unknown> }> };
        const found = (body.features ?? []).find((f) => String(f.properties?.hotspotId ?? "") === active.hotspotId);
        if (!found?.properties || cancelled) return;
        const next = hotspotDetailFromProps(found.properties);
        if (next && !cancelled) setActive(next);
      } catch {
        // keep previous snapshot
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [timeWindow, active.hotspotId]);

  const dayNight = useMemo(
    () => computeDayNight(active.location.coordinates.lat, active.location.coordinates.lon),
    [active.location.coordinates.lat, active.location.coordinates.lon]
  );

  if (!mounted) return null;

  return createPortal(
    <div className="wv-hotspot-card" role="dialog" aria-label="Intel hotspot detail">
      <div className="wv-hotspot-card-hdr">
        <div className="wv-hotspot-card-headline">
          <div className="wv-hotspot-name">{active.name.toUpperCase()}</div>
          <span className={`wv-hotspot-tier tier-${active.tier.toLowerCase()}`}>{active.tier}</span>
        </div>
        <button type="button" className="wv-hotspot-close" onClick={onClose} aria-label="Close hotspot details">
          ×
        </button>
      </div>

      <div className="wv-hotspot-tags">{active.tags.join("/")}</div>
      <div className="wv-hotspot-summary">{active.summary}</div>

      <div className="wv-hotspot-window">
        {(["6h", "24h", "7d"] as HotspotTimeWindow[]).map((w) => (
          <button
            key={w}
            type="button"
            className={`wv-hotspot-window-btn ${timeWindow === w ? "is-active" : ""}`}
            onClick={() => onTimeWindowChange(w)}
          >
            {w}
          </button>
        ))}
      </div>

      <div className="wv-hotspot-section">
        <div className="wv-hotspot-kicker">ESCALATION ASSESSMENT</div>
        <div className="wv-hotspot-score">{active.currentScore.toFixed(1)}/5</div>
        <div className="wv-hotspot-trend">{active.trend}</div>
        <div className="wv-hotspot-baseline">Baseline: {active.baselineScore}/5</div>
        <div className="wv-hotspot-subscores">
          <div>News {active.subScores.news}</div>
          <div>CII {active.subScores.cii}</div>
          <div>Geo {active.subScores.geo}</div>
          <div>Military {active.subScores.military}</div>
        </div>
      </div>

      <div className="wv-hotspot-section">
        <div className="wv-hotspot-kicker">DRIVERS</div>
        <ul className="wv-hotspot-drivers">
          {active.drivers.map((driver, idx) => (
            <li key={`${driver.text}-${idx}`}>
              {driver.text}
              <details className="wv-hotspot-trace">
                <summary>Source Trace</summary>
                <div>{driver.trace.sourceName}</div>
                <div>{formatAge(driver.trace.timestamp)}</div>
                {driver.trace.sourceUrl ? (
                  <a href={driver.trace.sourceUrl} target="_blank" rel="noreferrer">
                    Link
                  </a>
                ) : null}
              </details>
            </li>
          ))}
        </ul>
      </div>

      <div className="wv-hotspot-section">
        <div className="wv-hotspot-kicker">LOCATION</div>
        <div>{active.location.countries.join(", ")}</div>
        <div>Coordinates {formatLatLon(active.location.coordinates.lat, active.location.coordinates.lon)}</div>
        <div>Status {active.location.status}</div>
        <div>Local {dayNight}</div>
      </div>

      <div className="wv-hotspot-section">
        <div className="wv-hotspot-kicker">WHY IT MATTERS</div>
        <div>{active.whyItMatters}</div>
      </div>

      <div className="wv-hotspot-section">
        <div className="wv-hotspot-kicker">HISTORICAL CONTEXT</div>
        <div>
          Last Major Event: {active.historicalContext.lastMajorEvent.label} ({active.historicalContext.lastMajorEvent.date})
        </div>
        <div>Precedents: {active.historicalContext.precedents.join(", ")}</div>
        <div>Cyclical Pattern: {active.historicalContext.cyclicalPattern}</div>
      </div>

      <div className="wv-hotspot-section">
        <div className="wv-hotspot-kicker">KEY ENTITIES</div>
        <div>{active.keyEntities.join(", ")}</div>
      </div>

      <div className="wv-hotspot-section">
        <div className="wv-hotspot-kicker">PIPELINE STATUS</div>
        <div className="wv-hotspot-status-row">
          {Object.entries(active.sourceStatus).map(([source, status]) => (
            <span key={source} className={`wv-hotspot-status ${statusClass(status)}`}>
              {source}:{status}
            </span>
          ))}
        </div>
        <div className="wv-hotspot-updated">Updated: {new Date(active.lastUpdated).toUTCString()}</div>
      </div>
    </div>,
    document.body
  );
}
