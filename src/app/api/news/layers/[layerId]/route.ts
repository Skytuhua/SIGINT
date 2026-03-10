import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { Earthquake, Flight } from "../../../../../lib/providers/types";
import type { FaaAirportStatus } from "../../../../api/faa/route";
import { getIntelHotspotsComputed } from "../../../../../lib/server/news/hotspots";
import type { TimeWindow } from "../../../../../lib/events/schema";
import type { GdeltGeoPoint } from "../../../../../lib/news/types";
import { getArmsEmbargoZonesLayer } from "../../../../../lib/server/news/armsEmbargo";
import { getConflictZonesLayer } from "../../../../../lib/server/news/conflictZones";
import { getEconomicCentersLayer } from "../../../../../lib/server/news/economicCenters";
import { getAiDataCentersLayer } from "../../../../../lib/server/news/aiDataCenters";
import { getSanctionsData } from "../../../../../lib/server/news/sanctions";
import {
  ensureUcdpLoaded,
  loadAdditionalYear,
  queryUcdpEvents,
  getUcdpMeta,
  getUcdpDefaultYear,
} from "../../../../../lib/server/ucdp/ucdpGedStore";
import { computeUcdpSeverity, severityLabel as ucdpSeverityLabel } from "../../../../../lib/server/ucdp/severity";
import type { UcdpViolenceType } from "../../../../../lib/server/ucdp/types";

export const dynamic = "force-dynamic";

type GenericFeature = {
  type: "Feature";
  id?: string | number;
  geometry: {
    type: "Point" | "LineString" | "Polygon";
    coordinates: unknown;
  };
  properties?: Record<string, unknown>;
};

type GenericFeatureCollection = {
  type: "FeatureCollection";
  features: GenericFeature[];
};

// ── Server-side TTL cache ────────────────────────────────────────────────────

interface CacheEntry {
  data: GenericFeatureCollection;
  expiresAt: number;
  staleUntil: number;
}

const layerCache = new Map<string, CacheEntry>();

const LAYER_TTL: Record<string, number> = {
  "intel-hotspots":     90_000,
  "conflict-zones":     120_000,
  "armed-conflict":     120_000,
  "military-activity":  20_000,
  "cyber-incidents":    120_000,
  "disease-outbreaks":  600_000,
  "arms-embargo-zones":  6 * 3600_000,
  "sanctions-entities":  24 * 3600_000,
  "ucdp-events":         6 * 3600_000,
  "economic-centers":    4 * 3600_000,
  "ai-data-centers":     4 * 3600_000,
  "earthquakes":         60_000,
  "disaster-alerts":     6 * 60_000,
};

const STALE_MULTIPLIER = 10;

function getCached(layerId: string): GenericFeatureCollection | null {
  const entry = layerCache.get(layerId);
  if (!entry) return null;
  const now = Date.now();
  if (now < entry.expiresAt) return entry.data;
  if (now < entry.staleUntil) return entry.data;
  layerCache.delete(layerId);
  return null;
}

function isFresh(layerId: string): boolean {
  const entry = layerCache.get(layerId);
  return Boolean(entry && Date.now() < entry.expiresAt);
}

function setCache(layerId: string, data: GenericFeatureCollection): void {
  const ttl = LAYER_TTL[layerId] ?? 120_000;
  const now = Date.now();
  layerCache.set(layerId, {
    data,
    expiresAt: now + ttl,
    staleUntil: now + ttl * STALE_MULTIPLIER,
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toFeatureCollection(features: GenericFeature[]): GenericFeatureCollection {
  return { type: "FeatureCollection", features };
}

const FETCH_TIMEOUT_MS = 8_000;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${url} => ${res.status}`);
  return (await res.json()) as T;
}

function featurePoint(id: string, lon: number, lat: number, properties: Record<string, unknown>): GenericFeature {
  return {
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties,
  };
}

function fromGdeltPoints(points: Array<{ lat: number; lon: number; name?: string; count?: number }>, prefix: string): GenericFeatureCollection {
  return toFeatureCollection(
    points
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
      .slice(0, 2000)
      .map((p, idx) =>
        featurePoint(`${prefix}-${idx}`, p.lon, p.lat, {
          name: p.name ?? prefix,
          count: p.count ?? 1,
          ts: Date.now(),
        })
      )
  );
}

function fromFlightsAsPoints(rows: Flight[], prefix: string): GenericFeatureCollection {
  return toFeatureCollection(
    rows
      .filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lon))
      .slice(0, 4000)
      .map((f) =>
        featurePoint(`${prefix}-${f.icao}`, f.lon, f.lat, {
          callsign: f.callsign,
          icao: f.icao,
          country: f.country ?? null,
          registration: f.registration ?? null,
          aircraftType: f.aircraftType ?? null,
          aircraftTypeDescription: f.aircraftTypeDescription ?? null,
          squawk: f.squawk ?? null,
          route: f.route ?? null,
          speedMs: f.speedMs ?? null,
          altM: f.altM ?? null,
          heading: f.heading ?? null,
          vRate: f.vRate ?? null,
          onGround: Boolean(f.onGround),
          source: f.source ?? null,
          rssi: f.rssi ?? null,
          messageRate: f.messageRate ?? null,
          lastPosSec: f.lastPosSec ?? null,
          lastSeenSec: f.lastSeenSec ?? null,
          selectedAltitudeFt: f.selectedAltitudeFt ?? null,
          selectedHeadingDeg: f.selectedHeadingDeg ?? null,
          windSpeedKt: f.windSpeedKt ?? null,
          windDirectionFromDeg: f.windDirectionFromDeg ?? null,
          mach: f.mach ?? null,
          category: f.category ?? null,
          adsbVersion: f.adsbVersion ?? null,
          isMock: Boolean((f as any).isMock),
          isMilitary: Boolean((f as any).isMilitary),
          ts: Date.now(),
        })
      )
  );
}

function fromEarthquakes(rows: Earthquake[]): GenericFeatureCollection {
  return toFeatureCollection(
    rows.slice(0, 2000).map((q) =>
      featurePoint(`eq-${q.id}`, q.lon, q.lat, {
        mag: q.mag,
        depthKm: q.depthKm,
        place: q.place,
        ts: q.time,
      })
    )
  );
}

function fromFlightDelayProxy(rows: Flight[]): GenericFeatureCollection {
  const buckets = new Map<string, { lon: number; lat: number; count: number; ground: number }>();
  for (const row of rows) {
    if (!Number.isFinite(row.lat) || !Number.isFinite(row.lon)) continue;
    const latCell = Math.floor((row.lat + 90) / 4);
    const lonCell = Math.floor((row.lon + 180) / 4);
    const key = `${latCell}:${lonCell}`;
    const current = buckets.get(key);
    if (!current) {
      buckets.set(key, {
        lon: row.lon,
        lat: row.lat,
        count: 1,
        ground: row.onGround ? 1 : 0,
      });
      continue;
    }
    current.count += 1;
    current.ground += row.onGround ? 1 : 0;
    current.lon = (current.lon + row.lon) / 2;
    current.lat = (current.lat + row.lat) / 2;
  }

  return toFeatureCollection(
    Array.from(buckets.entries())
      .slice(0, 1200)
      .map(([key, value]) => {
        const delayScore = Math.round((value.ground / Math.max(1, value.count)) * 100);
        return featurePoint(`flight-delay-${key}`, value.lon, value.lat, {
          flights: value.count,
          delayScore,
          label: `${delayScore}% delay proxy`,
          ts: Date.now(),
        });
      })
  );
}

function fromFaaStatuses(statuses: FaaAirportStatus[]): GenericFeatureCollection {
  return toFeatureCollection(
    statuses
      .filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lon))
      .slice(0, 500)
      .map((a) => {
        const hasDelay = Boolean(a.delayType);
        return featurePoint(`faa-${a.icao}`, a.lon, a.lat, {
          name: `${a.iata || a.icao} — ${a.name}`,
          iata: a.iata,
          icao: a.icao,
          city: a.city,
          state: a.state,
          delayType: a.delayType ?? null,
          avgDelay: a.avgDelay ?? null,
          reason: a.reason ?? null,
          hasDelay,
          severity: hasDelay ? "delayed" : "normal",
          ts: Date.now(),
        });
      })
  );
}

// ── Armed Conflict helpers ─────────────────────────────────────────────────────

type SeverityLabel = "Low" | "Elevated" | "High" | "Severe";

interface ArmedConflictEvent {
  id: string;
  lat: number;
  lon: number;
  locationName?: string;
  country?: string;
  startTime: number;
  endTime?: number;
  severity: number;
  severityLabel: SeverityLabel;
  confidence: number;
  headline: string;
  summary: string;
  numMentions: number;
  mergedEventsCount: number;
  sourceUrl?: string;
  timeWindow: TimeWindow;
  raw: GdeltGeoPoint;
}

function clamp01To100(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function severityBucket(score: number): SeverityLabel {
  if (score >= 75) return "Severe";
  if (score >= 50) return "High";
  if (score >= 25) return "Elevated";
  return "Low";
}

function computeSeverity(numMentions: number): number {
  const mentions = Math.max(1, numMentions);
  // Base weight for material conflict (CAMEO root 20 style).
  const base = 55;
  const mentionScore = Math.log10(1 + mentions) * 18;
  return clamp01To100(base + mentionScore);
}

function computeConfidence(numMentions: number, timeWindow: TimeWindow, mergedCount: number): number {
  const mentions = Math.max(1, numMentions);
  const base = 40;
  const sizeBoost = Math.log10(1 + mentions) * 20;
  const windowBoost = timeWindow === "6h" ? 25 : timeWindow === "24h" ? 18 : 10;
  const clusterBoost = mergedCount > 1 ? Math.log2(1 + mergedCount) * 6 : 0;
  return clamp01To100(base + sizeBoost + windowBoost + clusterBoost);
}

function stableArmedEventId(p: GdeltGeoPoint, timeWindow: TimeWindow): string {
  const h = crypto.createHash("sha1");
  const key = `${p.fullname || p.name || ""}|${p.countrycode || ""}|${p.lat.toFixed(2)}|${p.lon.toFixed(
    2
  )}|${timeWindow}`;
  h.update(key);
  return `gdelt-armed-${h.digest("hex").slice(0, 16)}`;
}

function buildDocListUrl(query: string, timeWindow: TimeWindow, countryCode?: string): string {
  const qParts = [query.trim()];
  if (countryCode && countryCode.length === 2) {
    qParts.push(`sourcecountry:${countryCode.toUpperCase()}`);
  }
  const qParam = encodeURIComponent(qParts.join(" "));
  const timespan = timeWindow;
  return `https://api.gdeltproject.org/api/v2/doc/doc?query=${qParam}&mode=artlist&format=html&timespan=${encodeURIComponent(
    timespan
  )}`;
}

function buildArmedEventFromPoint(p: GdeltGeoPoint, timeWindow: TimeWindow, query: string): ArmedConflictEvent {
  const numMentions = Math.max(1, p.count ?? 1);
  const severity = computeSeverity(numMentions);
  const severityLabel = severityBucket(severity);
  const locationName = (p.fullname || p.name || "").trim() || "Unknown location";
  const headline = `${severityLabel} armed conflict signal — ${locationName}`;
  const summary = `Approx ${numMentions} conflict-related mentions in last ${timeWindow}.`;
  const startTime = Date.now();
  const sourceUrl = buildDocListUrl(query, timeWindow, p.countrycode);

  return {
    id: stableArmedEventId(p, timeWindow),
    lat: p.lat,
    lon: p.lon,
    locationName,
    country: p.countrycode || undefined,
    startTime,
    endTime: undefined,
    severity,
    severityLabel,
    confidence: computeConfidence(numMentions, timeWindow, 1),
    headline,
    summary,
    numMentions,
    mergedEventsCount: 1,
    sourceUrl,
    timeWindow,
    raw: p,
  };
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function dedupeArmedEvents(events: ArmedConflictEvent[], distanceKm = 40): ArmedConflictEvent[] {
  if (events.length <= 1) return events;
  const remaining = [...events].sort((a, b) => b.severity - a.severity);
  const used = new Set<string>();
  const out: ArmedConflictEvent[] = [];

  for (const seed of remaining) {
    if (used.has(seed.id)) continue;
    const cluster: ArmedConflictEvent[] = [seed];
    used.add(seed.id);

    for (const candidate of remaining) {
      if (used.has(candidate.id)) continue;
      const d = haversineKm(seed.lat, seed.lon, candidate.lat, candidate.lon);
      if (d <= distanceKm) {
        used.add(candidate.id);
        cluster.push(candidate);
      }
    }

    if (cluster.length === 1) {
      out.push(seed);
      continue;
    }

    const merged = mergeArmedCluster(cluster);
    out.push(merged);
  }

  return out;
}

function mergeArmedCluster(cluster: ArmedConflictEvent[]): ArmedConflictEvent {
  if (cluster.length === 1) return cluster[0];
  const top = cluster.reduce((a, b) => (b.severity > a.severity ? b : a), cluster[0]);
  const totalMentions = cluster.reduce((sum, e) => sum + e.numMentions, 0);
  const lat = cluster.reduce((sum, e) => sum + e.lat, 0) / cluster.length;
  const lon = cluster.reduce((sum, e) => sum + e.lon, 0) / cluster.length;
  const severity = computeSeverity(totalMentions);
  const severityLabel = severityBucket(severity);
  const confidence = computeConfidence(totalMentions, top.timeWindow, cluster.length);

  return {
    ...top,
    lat,
    lon,
    severity,
    severityLabel,
    confidence,
    numMentions: totalMentions,
    mergedEventsCount: cluster.length,
  };
}

const GDELT_GEO_BASE = "https://api.gdeltproject.org/api/v2/geo/geo";
const ARMED_CONFLICT_TIMEOUT_MS = 10_000;

interface ArmedConflictFetchResult {
  points: GdeltGeoPoint[];
  degraded: boolean;
}

async function fetchArmedConflictDirect(
  query: string,
  timeWindow: TimeWindow,
  maxrecords = 220,
): Promise<ArmedConflictFetchResult> {
  const url = new URL(GDELT_GEO_BASE);
  url.searchParams.set("query", query);
  url.searchParams.set("mode", "pointdata");
  url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", String(Math.min(250, maxrecords)));
  url.searchParams.set("timespan", timeWindow);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ARMED_CONFLICT_TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { "User-Agent": "WorldView/0.1 (research)" },
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) return { points: [], degraded: true };

    const json = (await res.json()) as Record<string, unknown>;
    const rows = Array.isArray(json.map)
      ? (json.map as Record<string, unknown>[])
      : Array.isArray(json.features)
        ? (json.features as Record<string, unknown>[])
        : [];

    const points: GdeltGeoPoint[] = [];
    for (const row of rows) {
      const lat = Number(row.lat ?? row.latitude ?? row.centroidlat);
      const lon = Number(row.lon ?? row.longitude ?? row.centroidlon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const count = Number(row.count ?? row.value ?? row.numarticles ?? 1);
      points.push({
        name: String(row.name ?? row.fullname ?? row.country ?? row.adm1 ?? ""),
        fullname: String(row.fullname ?? row.name ?? row.country ?? row.adm1 ?? ""),
        countrycode: String(row.countrycode ?? row.code ?? row.country ?? "")
          .slice(0, 2)
          .toUpperCase(),
        lat,
        lon,
        count: Number.isFinite(count) ? count : 1,
      });
    }
    return { points, degraded: false };
  } catch {
    clearTimeout(timer);
    return { points: [], degraded: true };
  }
}

function buildArmedConflictFeatures(
  points: GdeltGeoPoint[],
  timeWindow: TimeWindow,
  query: string
): GenericFeature[] {
  const baseEvents = points
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .map((p) => buildArmedEventFromPoint(p, timeWindow, query));

  const deduped = dedupeArmedEvents(baseEvents, 40);

  return deduped.map((ev) =>
    featurePoint(ev.id, ev.lon, ev.lat, {
      id: ev.id,
      type: "armed_conflict",
      subtype: "material_conflict",
      lat: ev.lat,
      lon: ev.lon,
      locationName: ev.locationName,
      country: ev.country,
      admin1: null,
      startTime: ev.startTime,
      endTime: ev.endTime ?? null,
      severity: ev.severity,
      severityLabel: ev.severityLabel,
      confidence: ev.confidence,
      headline: ev.headline,
      summary: ev.summary,
      numMentions: ev.numMentions,
      numSources: null,
      numArticles: null,
      goldsteinScale: null,
      avgTone: null,
      mergedEventsCount: ev.mergedEventsCount,
      sourceName: "GDELT",
      sourceUrl: ev.sourceUrl,
      timeWindow,
    })
  );
}

async function loadSnapshot(layerId: string): Promise<GenericFeatureCollection> {
  const file = path.join(process.cwd(), "public", "data", "news-layers", `${layerId}.geojson`);
  const text = await readFile(file, "utf8");
  const payload = JSON.parse(text) as GenericFeatureCollection;
  if (payload?.type !== "FeatureCollection" || !Array.isArray(payload.features)) {
    throw new Error(`invalid snapshot ${layerId}`);
  }
  return payload;
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

async function getLayerPayload(layerId: string, origin: string, requestUrl: string): Promise<GenericFeatureCollection> {
  if (layerId === "intel-hotspots") {
    const url = new URL(requestUrl);
    const tw = (url.searchParams.get("timeWindow") ?? "24h") as TimeWindow;
    return await getIntelHotspotsComputed(origin, tw) as GenericFeatureCollection;
  }

  if (layerId === "conflict-zones") {
    try {
      const result = await getConflictZonesLayer({ origin, requestUrl });
      // LayerFeature objects lack `type: "Feature"` — convert to valid GeoJSON so the
      // client normalizer (which checks obj.type === "Feature") doesn't drop every feature.
      const geoJsonFeatures = result.collection.features.map((f) => ({
        type: "Feature" as const,
        id: f.id,
        geometry: f.geometry as GenericFeature["geometry"],
        properties: { ...f.properties, ts: f.ts },
      }));
      const data: GenericFeatureCollection = { type: "FeatureCollection", features: geoJsonFeatures };
      if (data.features.length > 0) return data;
    } catch (err) {
      console.warn("[conflict-zones] pipeline failed:", err);
    }
    const stale = getCached(layerId);
    if (stale && stale.features.length > 0) return stale;
    try {
      return await loadSnapshot(layerId);
    } catch {
      return { type: "FeatureCollection", features: [] };
    }
  }

  if (layerId === "armed-conflict") {
    const url = new URL(requestUrl);
    const twRaw = (url.searchParams.get("timeWindow") ?? "24h") as TimeWindow;
    const timeWindow: TimeWindow = twRaw === "6h" || twRaw === "7d" ? twRaw : "24h";
    const broad = url.searchParams.get("broad") === "1";

    const strictQuery =
      '"armed conflict" OR "military attack" OR airstrike OR shelling OR "armed assault" OR bombing';
    const broaderTerms =
      ' OR clashes OR firefight OR insurgent OR militia OR bombardment OR "rocket attack" OR crossfire';
    const q = broad ? strictQuery + broaderTerms : strictQuery;

    const { points, degraded } = await fetchArmedConflictDirect(q, timeWindow);

    const features = buildArmedConflictFeatures(points, timeWindow, q);
    const fc = toFeatureCollection(features);

    if (degraded && features.length === 0) {
      const stale = getCached(layerId);
      if (stale && stale.features.length > 0) return stale;
      try {
        const snapshot = await loadSnapshot(layerId);
        return snapshot;
      } catch {
        return fc;
      }
    }

    return fc;
  }

  if (layerId === "military-activity") {
    const flights = await fetchJson<Flight[]>(`${origin}/api/military`);
    return fromFlightsAsPoints(flights ?? [], "mil-activity");
  }

  if (layerId === "cyber-incidents" || layerId === "disease-outbreaks") {
    const queryMap: Record<string, string> = {
      "cyber-incidents":   "cyber attack hacking ransomware data breach",
      "disease-outbreaks": "disease outbreak epidemic cholera ebola mpox",
    };
    const gdelt = await fetchJson<{ points?: Array<{ lat: number; lon: number; name?: string; count?: number }> }>(
      `${origin}/api/news/gdelt-geo?q=${encodeURIComponent(queryMap[layerId])}&timespan=24h&mode=pointdata&maxrecords=200`
    );
    return fromGdeltPoints(gdelt.points ?? [], layerId);
  }

  if (layerId === "ucdp-events") {
    const url = new URL(requestUrl);
    // Load UCDP data BEFORE reading the default year, since getUcdpDefaultYear()
    // falls back to currentYear-1 when the store is empty (which may not match the dataset).
    await ensureUcdpLoaded();
    const defaultYear = getUcdpDefaultYear();
    const fromYear = parseInt(url.searchParams.get("fromYear") ?? String(defaultYear), 10) || defaultYear;
    const toYear = parseInt(url.searchParams.get("toYear") ?? String(defaultYear), 10) || defaultYear;
    const countriesRaw = url.searchParams.get("countries") ?? "";
    const countries = countriesRaw ? countriesRaw.split(",").map((c) => c.trim()).filter(Boolean) : [];
    const vtRaw = url.searchParams.get("violenceTypes") ?? "";
    const VALID_VT = new Set(["state-based", "non-state", "one-sided"]);
    const violenceTypes = vtRaw
      ? (vtRaw.split(",").map((v) => v.trim()).filter((v) => VALID_VT.has(v)) as UcdpViolenceType[])
      : undefined;
    const minFatalities = Math.max(1, parseInt(url.searchParams.get("minFatalities") ?? "1", 10) || 1);
    for (let y = fromYear; y <= toYear; y++) {
      await loadAdditionalYear(y);
    }

    const events = queryUcdpEvents({
      fromYear,
      toYear,
      countries: countries.length > 0 ? countries : undefined,
      violenceTypes: violenceTypes?.length ? violenceTypes : undefined,
      minFatalities,
    });

    const meta = getUcdpMeta();
    const features = events.slice(0, 5000).map((ev) => {
      const severity = computeUcdpSeverity(ev.fatalities_best, ev.violenceType);
      return featurePoint(ev.id, ev.lon, ev.lat, {
        id: ev.id,
        type: "ucdp_event",
        violenceType: ev.violenceType,
        conflictId: ev.conflictId,
        conflictName: ev.conflictName,
        actor1Name: ev.actor1Name,
        actor2Name: ev.actor2Name,
        country: ev.country,
        admin1: ev.admin1,
        locationName: ev.locationName,
        lat: ev.lat,
        lon: ev.lon,
        date: ev.date,
        year: ev.year,
        fatalities_best: ev.fatalities_best,
        fatalities_low: ev.fatalities_low,
        fatalities_high: ev.fatalities_high,
        severity,
        severityLabel: ucdpSeverityLabel(severity),
        sourceName: "UCDP GED",
        sourceDatasetVersion: meta.datasetVersion,
        sourceUrl: ev.sourceUrl,
        lastUpdated: ev.lastUpdated,
      });
    });

    const fc = toFeatureCollection(features);
    // If the live API returned 0 events (e.g. 401 auth error, API down), fall back
    // to the static snapshot so the layer at least shows historical data.
    if (fc.features.length === 0) {
      try { return await loadSnapshot(layerId); } catch { /* no snapshot */ }
    }
    return fc;
  }

  if (layerId === "sanctions-entities") {
    const result = await getSanctionsData();
    const geoJsonFeatures = result.collection.features.map((f) => ({
      type: "Feature" as const,
      id: f.id,
      geometry: f.geometry as GenericFeature["geometry"],
      properties: { ...f.properties, ts: f.ts },
    }));
    return { type: "FeatureCollection", features: geoJsonFeatures };
  }

  if (layerId === "arms-embargo-zones") {
    const result = await getArmsEmbargoZonesLayer();
    const geoJsonFeatures = result.collection.features.map((f) => ({
      type: "Feature" as const,
      id: f.id,
      geometry: f.geometry as GenericFeature["geometry"],
      properties: { ...f.properties, ts: f.ts },
    }));
    return { type: "FeatureCollection", features: geoJsonFeatures };
  }

  if (layerId === "ai-data-centers") {
    const result = await getAiDataCentersLayer();
    const geoJsonFeatures = result.collection.features.map((f) => ({
      type: "Feature" as const,
      id: f.id,
      geometry: f.geometry as GenericFeature["geometry"],
      properties: { ...f.properties, ts: f.ts },
    }));
    if (geoJsonFeatures.length > 0) {
      return { type: "FeatureCollection", features: geoJsonFeatures };
    }
  }

  if (layerId === "economic-centers") {
    const result = await getEconomicCentersLayer();
    const geoJsonFeatures = result.collection.features.map((f) => ({
      type: "Feature" as const,
      id: f.id,
      geometry: f.geometry as GenericFeature["geometry"],
      properties: { ...f.properties, ts: f.ts },
    }));
    if (geoJsonFeatures.length > 0) {
      return { type: "FeatureCollection", features: geoJsonFeatures };
    }
  }

  if (layerId === "displacement-flows") {
    const url = new URL(requestUrl);
    const mode = (url.searchParams.get("mode") ?? "all") as "all" | "refugee" | "idp";
    const causeRaw = url.searchParams.get("cause") ?? "";
    const cause = causeRaw ? causeRaw.split(",").filter(Boolean) : [];
    const minVolume = Math.max(0, parseInt(url.searchParams.get("minVolume") ?? "0") || 0);
    try {
      const { collection } = await getDisplacementFlowsLayer({ mode, cause, minVolume, maxFeatures: 2000 });
      if (collection.features.length > 0) return collection as GenericFeatureCollection;
    } catch (err) {
      console.warn("[displacement-flows] fetch failed:", err);
    }
    const stale = getCached(layerId);
    if (stale && stale.features.length > 0) return stale;
    try {
      return await loadSnapshot(layerId);
    } catch {
      return { type: "FeatureCollection", features: [] };
    }
  }

  if (layerId === "earthquakes") {
    const quakes = await fetchJson<Earthquake[]>(`${origin}/api/earthquakes`);
    return fromEarthquakes(quakes ?? []);
  }

  if (layerId === "disaster-alerts") {
    const res = await fetchJson<{ items?: Array<{ id: string; lat: number; lon: number; title: string; eventType: string; alertLevel?: string; severity?: string; severityValue?: number | null; country?: string; description?: string; startedAt?: number | null }> }>(`${origin}/api/gdacs`);
    const items = res?.items ?? [];
    return toFeatureCollection(
      items
        .filter((d) => Number.isFinite(d.lat) && Number.isFinite(d.lon))
        .slice(0, 200)
        .map((d) =>
          featurePoint(`gdacs-${d.id}`, d.lon, d.lat, {
            name: d.title,
            eventType: d.eventType,
            alertLevel: d.alertLevel ?? null,
            severity: d.severity ?? null,
            severityValue: d.severityValue ?? null,
            country: d.country ?? null,
            description: d.description ?? null,
            startedAt: d.startedAt ?? null,
            ts: d.startedAt ?? Date.now(),
          })
        )
    );
  }

  return loadSnapshot(layerId);
}

export async function GET(request: Request, { params }: { params: { layerId: string } }) {
  const layerId = params.layerId;
  const origin = new URL(request.url).origin;

  // Fresh cache hit — return immediately.
  if (isFresh(layerId)) {
    return NextResponse.json(getCached(layerId)!, {
      headers: { "Cache-Control": "no-store", "X-Cache": "hit" },
    });
  }

  // Stale-while-revalidate: serve stale data immediately and refresh in the background.
  // This eliminates perceived latency on every refresh cycle after the first cold load.
  const stale = getCached(layerId);
  if (stale) {
    void getLayerPayload(layerId, origin, request.url)
      .then((payload) => { if (payload.features.length > 0) setCache(layerId, payload); })
      .catch(() => { /* keep existing stale entry */ });
    return NextResponse.json(stale, {
      headers: { "Cache-Control": "no-store", "X-Cache": "stale" },
    });
  }

  // Cold start: no cache — must fetch synchronously.
  try {
    const payload = await getLayerPayload(layerId, origin, request.url);
    const shouldCache = payload.features.length > 0;
    if (shouldCache) setCache(layerId, payload);
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store", "X-Cache": "miss" },
    });
  } catch (error) {
    try {
      const fallback = await loadSnapshot(layerId);
      return NextResponse.json(fallback, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return NextResponse.json(
        { type: "FeatureCollection", features: [], error: String(error) },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }
  }
}
