import { HOTSPOT_REGISTRY, type HotspotDefinition } from "../../../config/hotspotRegistry";
import { scoreHotspot, type HotspotSignal, type TimeWindow } from "./hotspotScorer";

type GenericFeature = {
  type: "Feature";
  id?: string | number;
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, unknown>;
};

type GenericFeatureCollection = {
  type: "FeatureCollection";
  features: GenericFeature[];
};

// Raw types for shared datasets fetched once per invocation
type RawQuake = { id: string; mag: number; lat: number; lon: number; time: number; place?: string };
type RawEonetEvent = {
  title: string;
  categories?: Array<{ title: string }>;
  geometry?: Array<{ coordinates: [number, number]; date: string }>;
};
type RawFaaAirport = { icao: string; lat: number; lon: number; delayType?: string; reason?: string };

const FETCH_TIMEOUT_MS = 7_000;

function timespanParam(tw: TimeWindow): string {
  switch (tw) {
    case "6h": return "6h";
    case "24h": return "24h";
    case "7d": return "7d";
  }
}

// ── Shared-dataset fetchers (called once per getIntelHotspotsComputed) ────────

async function fetchAllQuakes(origin: string): Promise<RawQuake[]> {
  try {
    const res = await fetch(`${origin}/api/earthquakes`, {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    return (await res.json()) as RawQuake[];
  } catch {
    return [];
  }
}

async function fetchAllEonetEvents(): Promise<RawEonetEvent[]> {
  try {
    const res = await fetch("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100", {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { events?: RawEonetEvent[] };
    return data.events ?? [];
  } catch {
    return [];
  }
}

async function fetchAllFaaAirports(origin: string): Promise<RawFaaAirport[]> {
  try {
    const res = await fetch(`${origin}/api/faa`, {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    return (await res.json()) as RawFaaAirport[];
  } catch {
    return [];
  }
}

// ── Per-hotspot signal builders (pure, no I/O) ────────────────────────────────

function quakesToSignals(quakes: RawQuake[], bbox: [number, number, number, number]): HotspotSignal[] {
  return quakes
    .filter((q) => q.lat >= bbox[1] && q.lat <= bbox[3] && q.lon >= bbox[0] && q.lon <= bbox[2])
    .map((q) => ({
      type: "seismic" as const,
      text: `M${q.mag} ${q.place ?? ""}`,
      value: q.mag,
      sourceName: "USGS",
      timestamp: q.time,
    }));
}

function eonetToSignals(events: RawEonetEvent[], bbox: [number, number, number, number]): HotspotSignal[] {
  const signals: HotspotSignal[] = [];
  for (const evt of events) {
    for (const g of evt.geometry ?? []) {
      const [lon, lat] = g.coordinates;
      if (lat >= bbox[1] && lat <= bbox[3] && lon >= bbox[0] && lon <= bbox[2]) {
        signals.push({
          type: "natural",
          text: evt.title,
          value: 2,
          sourceName: "NASA EONET",
          timestamp: Date.parse(g.date) || Date.now(),
        });
      }
    }
  }
  return signals;
}

function faaToSignals(airports: RawFaaAirport[], bbox: [number, number, number, number]): HotspotSignal[] {
  return airports
    .filter((a) => a.delayType && a.lat >= bbox[1] && a.lat <= bbox[3] && a.lon >= bbox[0] && a.lon <= bbox[2])
    .map((a) => ({
      type: "faa" as const,
      text: `${a.icao}: ${a.delayType} — ${a.reason ?? "unknown"}`,
      value: 2,
      sourceName: "FAA",
      timestamp: Date.now(),
    }));
}

// ── Per-hotspot GDELT fetch (unique query per hotspot, cannot be shared) ──────

async function fetchGdeltSignals(
  origin: string,
  queries: string[],
  timespan: string,
  bbox: [number, number, number, number]
): Promise<HotspotSignal[]> {
  const q = queries.join(" OR ");
  try {
    const url = `${origin}/api/news/gdelt-geo?q=${encodeURIComponent(q)}&timespan=${timespan}&mode=pointdata&maxrecords=100`;
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { points?: Array<{ lat: number; lon: number; name?: string; count?: number; url?: string }> };
    return (data.points ?? [])
      .filter((p) => p.lat >= bbox[1] && p.lat <= bbox[3] && p.lon >= bbox[0] && p.lon <= bbox[2])
      .map((p) => ({
        type: "news" as const,
        text: p.name ?? q,
        value: Math.min(10, (p.count ?? 1)),
        url: p.url,
        sourceName: "GDELT",
        timestamp: Date.now(),
      }));
  } catch {
    return [];
  }
}

// ── Per-hotspot compute (I/O = GDELT only; shared data passed in) ─────────────

async function computeHotspotFeature(
  hotspot: HotspotDefinition,
  origin: string,
  timeWindow: TimeWindow,
  allQuakes: RawQuake[],
  allEonetEvents: RawEonetEvent[],
  allFaaAirports: RawFaaAirport[]
): Promise<GenericFeature> {
  const ts = timespanParam(timeWindow);
  const bbox = hotspot.scope.bbox;

  // Only GDELT is hotspot-specific (unique query); earthquake/EONET/FAA data
  // was fetched once above and is filtered here locally.
  const gdeltSignals = await fetchGdeltSignals(origin, hotspot.driverQueries, ts, bbox);
  const quakeSignals = quakesToSignals(allQuakes, bbox);
  const eonetSignals = eonetToSignals(allEonetEvents, bbox);
  const faaSignals = hotspot.usOnly ? faaToSignals(allFaaAirports, bbox) : [];

  const allSignals: HotspotSignal[] = [...gdeltSignals, ...quakeSignals, ...eonetSignals];
  const scores = scoreHotspot(hotspot, allSignals, timeWindow, faaSignals);

  return {
    type: "Feature",
    id: hotspot.id,
    geometry: { type: "Point", coordinates: [hotspot.anchor.lon, hotspot.anchor.lat] },
    properties: {
      hotspotId: hotspot.id,
      name: hotspot.name,
      tier: hotspot.tier,
      tags: hotspot.tags,
      summary: hotspot.summary,
      baselineScore: scores.baselineScore,
      currentScore: scores.currentScore,
      trend: scores.trend,
      subScores: {
        news: scores.news,
        cii: scores.cii,
        geo: scores.geo,
        military: scores.military,
      },
      drivers: scores.drivers,
      location: {
        countries: hotspot.scope.countries,
        coordinates: hotspot.anchor,
        status: hotspot.status ?? "Unknown",
      },
      whyItMatters: hotspot.whyItMatters,
      keyEntities: hotspot.keyEntities,
      historicalContext: {
        lastMajorEvent: { date: "", label: hotspot.historicalContext.lastMajorEvent },
        precedents: hotspot.historicalContext.precedents
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        cyclicalPattern: hotspot.historicalContext.cyclicalPattern,
      },
      timeWindow,
      lastUpdated: Date.now(),
      ts: Date.now(),
    },
  };
}

export async function getIntelHotspotsComputed(
  origin: string,
  timeWindow: TimeWindow = "24h"
): Promise<GenericFeatureCollection> {
  // Fetch shared datasets once — not once per hotspot.
  // Earthquake and EONET data is identical for every hotspot; only GDELT queries differ.
  const [allQuakes, allEonetEvents, allFaaAirports] = await Promise.all([
    fetchAllQuakes(origin),
    fetchAllEonetEvents(),
    fetchAllFaaAirports(origin),
  ]);

  const features = await Promise.all(
    HOTSPOT_REGISTRY.map((h) =>
      computeHotspotFeature(h, origin, timeWindow, allQuakes, allEonetEvents, allFaaAirports)
    )
  );

  return { type: "FeatureCollection", features };
}
