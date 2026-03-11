/**
 * Intel Hotspots — Multi-source fetchers for the computed layer.
 * All use cachedFetch; no scraping, no paid APIs.
 */

import { getGdeltArticles, getGdeltGeo } from "./providers/gdelt";
import { cachedFetch, fetchJsonOrThrow, type CachedFetchResult, type UpstreamPolicy } from "./upstream";
import type { TimeWindow } from "../../../config/hotspotRegistry";
import type { HotspotDefinition as HotspotDef } from "../../../config/hotspotRegistry";

function timeWindowToTimespan(tw: TimeWindow): string {
  // GDELT supports compact timespans like "6h", "24h", "7d".
  switch (tw) {
    case "6h":
      return "6h";
    case "24h":
      return "24h";
    case "7d":
      return "7d";
    default:
      return "24h";
  }
}

export interface HotspotSignal {
  type: "news" | "unrest" | "military" | "seismic" | "natural_event" | "alert" | "faa_delay";
  sourceId: string;
  sourceName: string;
  sourceUrl?: string;
  timestamp: number;
  value: number;
  text?: string;
  lat?: number;
  lon?: number;
  /** Optional hotspot scope this signal was fetched for. */
  hotspotId?: string;
}

export interface SourceFetchResult {
  signals: HotspotSignal[];
  cacheHit: "fresh" | "stale" | "miss";
  degraded: boolean;
  error?: string;
}

const USGS_POLICY: UpstreamPolicy = {
  key: "hotspot-usgs",
  ttlMs: 15 * 60_000,
  staleTtlMs: 60 * 60_000,
  timeoutMs: 12_000,
  maxRetries: 2,
  backoffBaseMs: 400,
  circuitFailureThreshold: 3,
  circuitOpenMs: 5 * 60_000,
  rateLimit: { capacity: 8, refillPerSec: 6, minIntervalMs: 150 },
};

const EONET_POLICY: UpstreamPolicy = {
  key: "hotspot-eonet",
  ttlMs: 30 * 60_000,
  staleTtlMs: 2 * 60 * 60_000,
  timeoutMs: 12_000,
  maxRetries: 2,
  backoffBaseMs: 500,
  circuitFailureThreshold: 3,
  circuitOpenMs: 5 * 60_000,
  rateLimit: { capacity: 6, refillPerSec: 4, minIntervalMs: 200 },
};

const NWS_POLICY: UpstreamPolicy = {
  key: "hotspot-nws",
  ttlMs: 10 * 60_000,
  staleTtlMs: 30 * 60_000,
  timeoutMs: 10_000,
  maxRetries: 2,
  backoffBaseMs: 400,
  circuitFailureThreshold: 3,
  circuitOpenMs: 5 * 60_000,
  rateLimit: { capacity: 6, refillPerSec: 4, minIntervalMs: 200 },
};

const FAA_POLICY: UpstreamPolicy = {
  key: "hotspot-faa",
  ttlMs: 10 * 60_000,
  staleTtlMs: 30 * 60_000,
  timeoutMs: 8_000,
  maxRetries: 2,
  backoffBaseMs: 400,
  circuitFailureThreshold: 3,
  circuitOpenMs: 5 * 60_000,
  rateLimit: { capacity: 4, refillPerSec: 3, minIntervalMs: 300 },
};

function timeWindowToDateRange(tw: TimeWindow): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  switch (tw) {
    case "6h":
      start.setHours(start.getHours() - 6);
      break;
    case "24h":
      start.setDate(start.getDate() - 1);
      break;
    case "7d":
      start.setDate(start.getDate() - 7);
      break;
    default:
      start.setDate(start.getDate() - 1);
  }
  return { start, end };
}

function toISOCompact(d: Date): string {
  return d.toISOString().slice(0, 19).replace(/[-:T]/g, "");
}

/** GDELT Doc: news volume + recency + topics per hotspot. */
export async function fetchGdeltDocSignals(
  hotspots: HotspotDef[],
  timeWindow: TimeWindow
): Promise<Map<string, { signals: HotspotSignal[]; result: CachedFetchResult<unknown> }>> {
  const timespan = timeWindowToTimespan(timeWindow);
  const results = new Map<string, { signals: HotspotSignal[]; result: CachedFetchResult<unknown> }>();

  await Promise.all(
    hotspots.map(async (h) => {
      const query = h.driverQueries.join(" OR ").trim() || "news";
      const r = await getGdeltArticles({
        q: query,
        timespan,
        maxrecords: 100,
      });
      const articles = Array.isArray(r.data) ? r.data : [];
      const signals: HotspotSignal[] = articles.map((a: { url?: string; title?: string; seendate?: string }) => {
        const ts = a.seendate ? new Date(a.seendate).getTime() : Date.now();
        return {
          type: "news" as const,
          sourceId: "gdelt-doc",
          sourceName: "GDELT 2.1 Doc",
          sourceUrl: a.url,
          timestamp: ts,
          value: 1,
          text: typeof a.title === "string" ? a.title : undefined,
          hotspotId: h.id,
        };
      });
      results.set(h.id, { signals, result: r });
    })
  );
  return results;
}

/** GDELT Geo: unrest/conflict events; filter by bbox. */
export async function fetchGdeltGeoSignals(
  hotspots: HotspotDef[],
  timeWindow: TimeWindow
): Promise<Map<string, { signals: HotspotSignal[]; result: CachedFetchResult<unknown> }>> {
  const timespan = timeWindowToTimespan(timeWindow);
  const results = new Map<string, { signals: HotspotSignal[]; result: CachedFetchResult<unknown> }>();

  const unrestQueries = [
    "protest demonstration riot unrest",
    "conflict violence armed military",
    "coup insurgency rebellion",
  ];

  await Promise.all(
    hotspots.map(async (h) => {
      const query = [...h.driverQueries, ...unrestQueries].slice(0, 3).join(" OR ");
      const r = await getGdeltGeo({
        q: query.trim() || "conflict protest",
        timespan,
        mode: "pointdata",
        maxrecords: 150,
      });
      const points = (r.data as { points?: Array<{ lat: number; lon: number; name?: string; count?: number }> })?.points ?? [];
      const [minLon, minLat, maxLon, maxLat] = h.scope.bbox;
      const signals: HotspotSignal[] = points
        .filter((p) => p.lat >= minLat && p.lat <= maxLat && p.lon >= minLon && p.lon <= maxLon)
        .map((p) => ({
          type: "unrest" as const,
          sourceId: "gdelt-geo",
          sourceName: "GDELT 2.1 Geo",
          timestamp: Date.now(),
          value: Math.min(1, (p.count ?? 1) / 10),
          text: p.name,
          lat: p.lat,
          lon: p.lon,
          hotspotId: h.id,
        }));
      results.set(h.id, { signals, result: r });
    })
  );
  return results;
}

/** Military topic density from GDELT. */
export async function fetchGdeltMilitarySignals(
  hotspots: HotspotDef[],
  timeWindow: TimeWindow
): Promise<Map<string, { signals: HotspotSignal[]; result: CachedFetchResult<unknown> }>> {
  const timespan = timeWindowToTimespan(timeWindow);
  const results = new Map<string, { signals: HotspotSignal[]; result: CachedFetchResult<unknown> }>();

  await Promise.all(
    hotspots.map(async (h) => {
      const r = await getGdeltGeo({
        q: "military defense armed forces troops deployment",
        timespan,
        mode: "pointdata",
        maxrecords: 100,
      });
      const points = (r.data as { points?: Array<{ lat: number; lon: number; name?: string; count?: number }> })?.points ?? [];
      const [minLon, minLat, maxLon, maxLat] = h.scope.bbox;
      const signals: HotspotSignal[] = points
        .filter((p) => p.lat >= minLat && p.lat <= maxLat && p.lon >= minLon && p.lon <= maxLon)
        .map((p) => ({
          type: "military" as const,
          sourceId: "gdelt-geo",
          sourceName: "GDELT 2.1 Geo",
          timestamp: Date.now(),
          value: Math.min(1, (p.count ?? 1) / 5),
          text: p.name,
          lat: p.lat,
          lon: p.lon,
          hotspotId: h.id,
        }));
      results.set(h.id, { signals, result: r });
    })
  );
  return results;
}

/** USGS earthquakes in bbox; magnitude-weighted. */
export async function fetchUsgsSignals(
  bboxes: Array<[number, number, number, number]>,
  timeWindow: TimeWindow
): Promise<{ signals: HotspotSignal[]; cacheHit: "fresh" | "stale" | "miss"; degraded: boolean }> {
  const { start, end } = timeWindowToDateRange(timeWindow);
  const minLat = Math.min(...bboxes.map((b) => b[1]));
  const maxLat = Math.max(...bboxes.map((b) => b[3]));
  const minLon = Math.min(...bboxes.map((b) => b[0]));
  const maxLon = Math.max(...bboxes.map((b) => b[2]));

  const url = new URL("https://earthquake.usgs.gov/fdsnws/event/1/query");
  url.searchParams.set("format", "geojson");
  url.searchParams.set("minlatitude", String(minLat));
  url.searchParams.set("maxlatitude", String(maxLat));
  url.searchParams.set("minlongitude", String(minLon));
  url.searchParams.set("maxlongitude", String(maxLon));
  url.searchParams.set("starttime", start.toISOString());
  url.searchParams.set("endtime", end.toISOString());
  url.searchParams.set("minmagnitude", "4");
  url.searchParams.set("limit", "500");

  const r = await cachedFetch({
    cacheKey: url.toString(),
    policy: USGS_POLICY,
    fallbackValue: { features: [] },
    request: async () => {
      const json = await fetchJsonOrThrow<{ features?: Array<{ id: string; geometry: { coordinates: [number, number, number] }; properties: { mag?: number; time?: number; place?: string; url?: string } }> }>(
        url.toString(),
        { headers: { "User-Agent": "SIGINT/0.1 (intel-hotspots)" } },
        USGS_POLICY.timeoutMs
      );
      return json;
    },
  });

  const features = (r.data as { features?: Array<{ id: string; geometry: { coordinates: [number, number, number] }; properties: { mag?: number; time?: number; place?: string; url?: string } }> })?.features ?? [];
  const signals: HotspotSignal[] = features.map((f) => ({
    type: "seismic",
    sourceId: "usgs",
    sourceName: "USGS Earthquakes",
    sourceUrl: f.properties?.url,
    timestamp: f.properties?.time ?? Date.now(),
    value: Math.pow(10, (f.properties?.mag ?? 4) - 4),
    text: f.properties?.place,
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  }));
  return { signals, cacheHit: r.cacheHit, degraded: r.degraded };
}

/** NASA EONET natural events in bbox. */
export async function fetchEonetSignals(
  bbox: [number, number, number, number]
): Promise<{ signals: HotspotSignal[]; cacheHit: "fresh" | "stale" | "miss"; degraded: boolean }> {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const bboxParam = `${minLat},${minLon},${maxLat},${maxLon}`;
  const url = `https://eonet.gsfc.nasa.gov/api/v3/events?bbox=${bboxParam}&status=open&limit=100`;

  const r = await cachedFetch({
    cacheKey: url,
    policy: EONET_POLICY,
    fallbackValue: { events: [] },
    request: async () => {
      const json = await fetchJsonOrThrow<{ events?: Array<{ id: string; title?: string; geometry?: Array<{ date?: string; coordinates?: [number, number] }>; categories?: Array<{ title?: string }>; sources?: Array<{ url?: string }> }> }>(
        url,
        { headers: { "User-Agent": "SIGINT/0.1 (intel-hotspots)" } },
        EONET_POLICY.timeoutMs
      );
      return json;
    },
  });

  const events = (r.data as { events?: Array<{ id: string; title?: string; geometry?: Array<{ date?: string; coordinates?: [number, number] }>; categories?: Array<{ title?: string }>; sources?: Array<{ url?: string }> }> })?.events ?? [];
  const catSeverity: Record<string, number> = {
    "Wildfires": 0.9,
    "Volcanoes": 0.85,
    "Severe Storms": 0.8,
    "Drought": 0.5,
    "Floods": 0.7,
    "Earthquakes": 0.75,
    "Landslides": 0.6,
  };
  const signals: HotspotSignal[] = events.flatMap((ev) =>
    (ev.geometry ?? [])
      .filter((g) => Array.isArray(g.coordinates) && g.coordinates.length >= 2)
      .map((g) => {
        const cat = ev.categories?.[0]?.title ?? "Event";
        const severity = catSeverity[cat] ?? 0.5;
        return {
          type: "natural_event" as const,
          sourceId: "eonet",
          sourceName: "NASA EONET",
          sourceUrl: ev.sources?.[0]?.url,
          timestamp: g.date ? Date.parse(g.date) : Date.now(),
          value: severity,
          text: ev.title,
          lon: g.coordinates![0],
          lat: g.coordinates![1],
        };
      })
  );
  return { signals, cacheHit: r.cacheHit, degraded: r.degraded };
}

/** NWS active alerts (US only). */
export async function fetchNwsSignals(): Promise<{ signals: HotspotSignal[]; cacheHit: "fresh" | "stale" | "miss"; degraded: boolean }> {
  const url = "https://api.weather.gov/alerts/active";

  const r = await cachedFetch({
    cacheKey: url,
    policy: NWS_POLICY,
    fallbackValue: { features: [] },
    request: async () => {
      const json = await fetchJsonOrThrow<{ features?: Array<{ id?: string; geometry?: { type: string; coordinates: unknown }; properties?: { event?: string; severity?: string; headline?: string; sent?: string; webUrl?: string } }> }>(
        url,
        { headers: { "User-Agent": "(SIGINT/0.1, educational)", Accept: "application/geo+json, application/json" } },
        NWS_POLICY.timeoutMs
      );
      return json;
    },
  });

  const features = (r.data as { features?: Array<{ id?: string; geometry?: { type: string; coordinates: unknown }; properties?: { event?: string; severity?: string; headline?: string; sent?: string; webUrl?: string } }> })?.features ?? [];
  const severityWeight: Record<string, number> = {
    Extreme: 1,
    Severe: 0.9,
    Moderate: 0.6,
    Minor: 0.4,
    Unknown: 0.3,
  };
  const signals: HotspotSignal[] = [];
  for (const f of features) {
    const props = f.properties ?? {};
    const severity = severityWeight[props.severity ?? "Unknown"] ?? 0.3;
    let lat: number | undefined;
    let lon: number | undefined;
    const geom = f.geometry;
    if (geom && (geom as { type: string }).type === "Point") {
      const coords = (geom as { coordinates: number[] }).coordinates;
      if (Array.isArray(coords) && coords.length >= 2) {
        lon = coords[0];
        lat = coords[1];
      }
    }
    if (lat == null) continue;
    signals.push({
      type: "alert",
      sourceId: "nws",
      sourceName: "NWS Active Alerts",
      sourceUrl: props.webUrl,
      timestamp: props.sent ? new Date(props.sent).getTime() : Date.now(),
      value: severity,
      text: props.headline ?? props.event,
      lat,
      lon,
    });
  }
  return { signals, cacheHit: r.cacheHit, degraded: r.degraded };
}

/** FAA NAS status — ground delay programs. Uses public NAS Status API. */
export async function fetchFaaSignals(): Promise<{ signals: HotspotSignal[]; cacheHit: "fresh" | "stale" | "miss"; degraded: boolean }> {
  const url = "https://nasstatus.faa.gov/api/airport-status-information";
  const signals: HotspotSignal[] = [];

  try {
    const r = await cachedFetch({
      cacheKey: url,
      policy: FAA_POLICY,
      fallbackValue: null,
      request: async () => {
        const res = await fetch(url, {
          headers: { "User-Agent": "SIGINT/0.1 (educational)" },
          signal: AbortSignal.timeout(FAA_POLICY.timeoutMs),
        });
        if (!res.ok) throw new Error(`FAA returned ${res.status}`);
        const text = await res.text();
        if (text.includes("GroundDelayProgram") || text.includes("GroundStop")) {
          return { hasDelays: true };
        }
        return { hasDelays: false };
      },
    });
    if (r.data && typeof r.data === "object" && "hasDelays" in r.data && (r.data as { hasDelays?: boolean }).hasDelays) {
      signals.push({
        type: "faa_delay",
        sourceId: "faa",
        sourceName: "FAA NAS Status",
        sourceUrl: "https://nasstatus.faa.gov/",
        timestamp: Date.now(),
        value: 0.3,
        text: "Active ground delay/stop programs",
      });
    }
    return { signals, cacheHit: r.cacheHit, degraded: r.degraded };
  } catch {
    return { signals: [], cacheHit: "miss", degraded: true };
  }
}
