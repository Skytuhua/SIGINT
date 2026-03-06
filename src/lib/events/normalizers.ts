import type { WorldEvent } from "./schema";

// ── USGS Earthquake ──────────────────────────────────────────────────────────

interface UsgsFeature {
  id: string;
  properties: {
    mag: number;
    place: string;
    time: number;
    url?: string;
    type?: string;
    title?: string;
  };
  geometry: { coordinates: [number, number, number] };
}

export function normalizeUsgsEarthquake(f: UsgsFeature): WorldEvent {
  const [lon, lat, depthKm] = f.geometry.coordinates;
  return {
    id: `usgs-${f.id}`,
    type: "earthquake",
    subtype: f.properties.type ?? "earthquake",
    lat,
    lon,
    geometry: { type: "Point", coordinates: [lon, lat] },
    startTime: f.properties.time,
    severity: f.properties.mag,
    headline: f.properties.title ?? `M${f.properties.mag} - ${f.properties.place}`,
    summary: `Depth ${depthKm.toFixed(1)} km`,
    sourceName: "USGS",
    sourceUrl: f.properties.url,
    raw: f,
  };
}

// ── NASA EONET ───────────────────────────────────────────────────────────────

interface EonetEvent {
  id: string;
  title: string;
  categories?: Array<{ id: string; title: string }>;
  geometry?: Array<{ date: string; coordinates: [number, number] }>;
  sources?: Array<{ url: string }>;
}

export function normalizeEonetEvent(e: EonetEvent): WorldEvent[] {
  return (e.geometry ?? [])
    .filter((g) => Array.isArray(g.coordinates) && g.coordinates.length >= 2)
    .map((g, idx) => ({
      id: `eonet-${e.id}-${idx}`,
      type: "natural-event",
      subtype: e.categories?.[0]?.title?.toLowerCase() ?? "event",
      lat: Number(g.coordinates[1]),
      lon: Number(g.coordinates[0]),
      geometry: { type: "Point" as const, coordinates: [Number(g.coordinates[0]), Number(g.coordinates[1])] },
      startTime: Date.parse(g.date) || Date.now(),
      headline: e.title,
      summary: e.categories?.[0]?.title ?? "Natural event",
      sourceName: "NASA EONET",
      sourceUrl: e.sources?.[0]?.url,
      raw: e,
    }));
}

// ── NWS Weather Alerts ───────────────────────────────────────────────────────

interface NwsFeature {
  id?: string;
  geometry?: { type: "Polygon" | "Point"; coordinates: unknown };
  properties?: Record<string, unknown>;
}

export function normalizeNwsAlert(f: NwsFeature): WorldEvent | null {
  const p = f.properties ?? {};
  let lat = 0, lon = 0;
  const geom = f.geometry;
  if (!geom) return null;

  if (geom.type === "Point") {
    const coords = geom.coordinates as number[];
    if (!Array.isArray(coords) || coords.length < 2) return null;
    lon = coords[0];
    lat = coords[1];
  } else if (geom.type === "Polygon") {
    const rings = geom.coordinates as number[][][];
    if (Array.isArray(rings?.[0])) {
      const ring = rings[0];
      lon = ring.reduce((s, c) => s + c[0], 0) / ring.length;
      lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
    }
  }

  const sevMap: Record<string, number> = { extreme: 5, severe: 4, moderate: 3, minor: 2, unknown: 1 };
  const sevStr = String(p.severity ?? "unknown").toLowerCase();

  return {
    id: `nws-${f.id ?? Math.random().toString(36).slice(2)}`,
    type: "weather-alert",
    subtype: String(p.event ?? "alert"),
    lat,
    lon,
    geometry: geom as WorldEvent["geometry"],
    startTime: p.onset ? Date.parse(String(p.onset)) : Date.now(),
    endTime: p.expires ? Date.parse(String(p.expires)) : undefined,
    severity: sevMap[sevStr] ?? 1,
    headline: String(p.headline ?? p.event ?? "Weather Alert"),
    summary: String(p.description ?? "").slice(0, 300),
    sourceName: "NWS",
    sourceUrl: String(p.uri ?? p["@id"] ?? ""),
    raw: f,
  };
}

// ── GDELT Geo Points ─────────────────────────────────────────────────────────

interface GdeltPoint {
  lat: number;
  lon: number;
  name?: string;
  count?: number;
  url?: string;
}

export function normalizeGdeltPoint(
  p: GdeltPoint,
  layerType: string,
  idx: number
): WorldEvent {
  return {
    id: `gdelt-${layerType}-${idx}`,
    type: layerType,
    lat: p.lat,
    lon: p.lon,
    geometry: { type: "Point", coordinates: [p.lon, p.lat] },
    startTime: Date.now(),
    severity: Math.min(5, (p.count ?? 1) / 5),
    headline: p.name ?? layerType.replace(/-/g, " "),
    summary: `${p.count ?? 1} event(s) reported`,
    sourceName: "GDELT",
    sourceUrl: p.url,
    raw: p,
  };
}

// ── FAA Airport Status ───────────────────────────────────────────────────────

export interface FaaAirportStatus {
  icao: string;
  iata?: string;
  name: string;
  lat: number;
  lon: number;
  delayType?: string;
  avgDelay?: string;
  reason?: string;
  closureBegin?: string;
  closureEnd?: string;
}

export function normalizeFaaStatus(a: FaaAirportStatus): WorldEvent {
  const hasDelay = Boolean(a.delayType);
  return {
    id: `faa-${a.icao}`,
    type: "faa-status",
    subtype: a.delayType ?? "normal",
    lat: a.lat,
    lon: a.lon,
    geometry: { type: "Point", coordinates: [a.lon, a.lat] },
    startTime: Date.now(),
    severity: hasDelay ? 3 : 0,
    headline: `${a.iata ?? a.icao} — ${a.name}`,
    summary: hasDelay
      ? `${a.delayType}: ${a.avgDelay ?? "unknown duration"} (${a.reason ?? "no reason"})`
      : "No delays reported",
    sourceName: "FAA",
    sourceUrl: "https://nasstatus.faa.gov",
    raw: a,
  };
}

// ── Batch helpers ────────────────────────────────────────────────────────────

export function dedupeEvents(events: WorldEvent[]): WorldEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}

export function filterByTimeWindow(events: WorldEvent[], windowMs: number): WorldEvent[] {
  const cutoff = Date.now() - windowMs;
  return events.filter((e) => e.startTime >= cutoff);
}

export function filterBySeverity(events: WorldEvent[], minSev: number): WorldEvent[] {
  return events.filter((e) => (e.severity ?? 0) >= minSev);
}
