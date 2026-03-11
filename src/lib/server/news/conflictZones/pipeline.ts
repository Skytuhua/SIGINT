import crypto from "node:crypto";
import {
  ensureUcdpLoaded,
  queryUcdpEvents,
  getUcdpMeta,
  getUcdpDefaultYear,
} from "../../ucdp/ucdpGedStore";
import { computeUcdpSeverity } from "../../ucdp/severity";
import { getGdeltEvents } from "../providers/gdelt";
import type {
  ConflictEvent,
  ConflictZone,
  ConflictZoneTimeWindow,
  ConflictZoneSeverityLabel,
  ConflictZoneSourceInfo,
  ConflictEventSource,
  ConflictZonePolygonCoords,
} from "./types";
import { conflictZonesToFeatureCollection } from "./types";

/** Grid resolution in degrees (e.g. 0.5 = ~55km at equator). */
const GRID_RES = 0.5;

const CONFLICT_QUERY_STRICT =
  'theme:CRISISLEX_C03_ARMED_CONFLICT OR ("armed conflict" OR "military attack" OR airstrike OR shelling OR "armed assault" OR bombing)';
const CONFLICT_QUERY_BROAD =
  CONFLICT_QUERY_STRICT +
  ' OR clashes OR firefight OR insurgent OR militia OR bombardment OR "rocket attack" OR crossfire';

/** Map timeWindow to GDELT timespan string. */
function toTimespan(tw: ConflictZoneTimeWindow): string {
  const map: Record<ConflictZoneTimeWindow, string> = {
    "6h": "6h",
    "24h": "24h",
    "7d": "7d",
    "30d": "30d",
    "90d": "90d",
  };
  return map[tw] ?? "7d";
}

/** Severity bucket thresholds (match armed-conflict helper). */
function severityBucket(score: number): ConflictZoneSeverityLabel {
  if (score >= 75) return "Severe";
  if (score >= 50) return "High";
  if (score >= 25) return "Elevated";
  return "Low";
}

/** Build grid cell key from lat/lon. */
function cellKey(lat: number, lon: number): string {
  const latIdx = Math.floor((lat + 90) / GRID_RES);
  const lonIdx = Math.floor((lon + 180) / GRID_RES);
  return `${latIdx}:${lonIdx}`;
}

/** Get cell indices from key. */
function cellFromKey(key: string): { latIdx: number; lonIdx: number } {
  const [a, b] = key.split(":").map(Number);
  return { latIdx: a, lonIdx: b };
}

/** Get neighbor cell keys (4-connected). */
function neighborKeys(key: string): string[] {
  const { latIdx, lonIdx } = cellFromKey(key);
  return [
    `${latIdx - 1}:${lonIdx}`,
    `${latIdx + 1}:${lonIdx}`,
    `${latIdx}:${lonIdx - 1}`,
    `${latIdx}:${lonIdx + 1}`,
  ];
}

/** Build polygon from cluster of cells - use bounding box with padding for stability. */
function cellsToPolygon(keys: Set<string>): ConflictZonePolygonCoords {
  if (keys.size === 0) return [[]];
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const key of keys) {
    const { latIdx, lonIdx } = cellFromKey(key);
    const lat0 = latIdx * GRID_RES - 90;
    const lon0 = lonIdx * GRID_RES - 180;
    minLat = Math.min(minLat, lat0);
    maxLat = Math.max(maxLat, lat0 + GRID_RES);
    minLon = Math.min(minLon, lon0);
    maxLon = Math.max(maxLon, lon0 + GRID_RES);
  }
  const pad = GRID_RES * 0.1;
  const ring: [number, number][] = [
    [minLon - pad, minLat - pad],
    [maxLon + pad, minLat - pad],
    [maxLon + pad, maxLat + pad],
    [minLon - pad, maxLat + pad],
    [minLon - pad, minLat - pad],
  ];
  return [ring];
}

interface CellData {
  intensity: number;
  eventCount: number;
  events: ConflictEvent[];
  topCountries: Map<string, number>;
  topLocations: Map<string, number>;
  topActors: Map<string, number>;
}

export interface ConflictZonesPipelineParams {
  origin: string;
  timeWindow: ConflictZoneTimeWindow;
  mode: "strict" | "broad";
  includeUcdp: boolean;
  zoomBand?: "coarse" | "medium" | "fine";
  viewport?: { west: number; south: number; east: number; north: number };
}

export interface ConflictZonesPipelineResult {
  collection: ReturnType<typeof conflictZonesToFeatureCollection>;
  sourceStatus: {
    gdeltEvents: "live" | "cached" | "degraded" | "unavailable";
    gdeltGeo: "live" | "cached" | "degraded" | "unavailable";
    ucdpGed: "live" | "cached" | "degraded" | "unavailable";
  };
  lastRefreshedAt: number;
}

export async function runConflictZonesPipeline(
  params: ConflictZonesPipelineParams
): Promise<ConflictZonesPipelineResult> {
  const { origin, timeWindow, mode, includeUcdp } = params;
  const now = Date.now();
  const timespan = toTimespan(timeWindow);

  const sources: ConflictZoneSourceInfo[] = [
    { dataset: "GDELT Geo", lastRefresh: now },
  ];
  const sourceStatus = {
    gdeltEvents: "live",
    gdeltGeo: "live",
    ucdpGed: "unavailable",
  } as ConflictZonesPipelineResult["sourceStatus"];

  let events: ConflictEvent[] = [];

  const gdeltResult = await getGdeltEvents({
    timespan,
    mode,
    maxrecords: 200,
  });
  events = [...gdeltResult.data];
  if (gdeltResult.degraded) {
    sourceStatus.gdeltEvents = "degraded";
    sourceStatus.gdeltGeo = "degraded";
  }

  if (includeUcdp) {
    try {
      await ensureUcdpLoaded();
      const defaultYear = getUcdpDefaultYear();
      const fromYear = defaultYear;
      const toYear = defaultYear;
      const ucdpEvents = queryUcdpEvents({
        fromYear,
        toYear,
        minFatalities: 1,
        viewport: params.viewport,
      });
      const meta = getUcdpMeta();

      const ucdpAsConflict: ConflictEvent[] = ucdpEvents.slice(0, 500).map((ev) => {
        const severity = computeUcdpSeverity(ev.fatalities_best, ev.violenceType);
        const severityWeight = Math.min(100, 50 + severity * 0.5);
        return {
          id: ev.id,
          timestamp: Date.parse(ev.date) || now,
          lat: ev.lat,
          lon: ev.lon,
          source: "ucdp" as const,
          country: ev.country,
          admin1: ev.admin1,
          locationName: ev.locationName,
          actors: [ev.actor1Name, ev.actor2Name].filter(Boolean),
          articleCount: 1,
          mentionCount: 1,
          severityWeight,
          verified: true,
          sourceUrl: ev.sourceUrl,
          sourceDatasetVersion: meta.datasetVersion,
        };
      });

      events = [...events, ...ucdpAsConflict];
      sources.push({
        dataset: "UCDP GED",
        datasetVersion: meta.datasetVersion,
        lastRefresh: now,
      });
      sourceStatus.ucdpGed = "live";
    } catch {
      sourceStatus.ucdpGed = "degraded";
    }
  }

  const grid = new Map<string, CellData>();

  for (const ev of events) {
    if (!Number.isFinite(ev.lat) || !Number.isFinite(ev.lon)) continue;
    const key = cellKey(ev.lat, ev.lon);
    const existing = grid.get(key);
    const decay = 1;
    const mentionComponent = Math.log10(1 + ev.mentionCount) * 12;
    const severityComponent = ev.severityWeight * 0.4;
    const verifiedBonus = ev.verified ? 15 : 0;
    const inc = (mentionComponent + severityComponent + verifiedBonus) * decay;

    if (existing) {
      existing.intensity += inc;
      existing.eventCount += 1;
      existing.events.push(ev);
      if (ev.country) {
        existing.topCountries.set(ev.country, (existing.topCountries.get(ev.country) ?? 0) + 1);
      }
      const loc = ev.locationName || ev.admin1 || ev.country || "Unknown";
      existing.topLocations.set(loc, (existing.topLocations.get(loc) ?? 0) + 1);
      for (const a of ev.actors) {
        if (a) existing.topActors.set(a, (existing.topActors.get(a) ?? 0) + 1);
      }
    } else {
      grid.set(key, {
        intensity: inc,
        eventCount: 1,
        events: [ev],
        topCountries: ev.country ? new Map([[ev.country, 1]]) : new Map(),
        topLocations: new Map(
          [[ev.locationName || ev.admin1 || ev.country || "Unknown", 1]]
        ),
        topActors: new Map(ev.actors.filter(Boolean).map((a) => [a, 1])),
      });
    }
  }

  const nonZeroCells = Array.from(grid.entries()).filter(([, d]) => d.intensity > 0);
  if (nonZeroCells.length === 0) {
    return {
      collection: conflictZonesToFeatureCollection([]),
      sourceStatus,
      lastRefreshedAt: now,
    };
  }

  const intensities = nonZeroCells.map(([, d]) => d.intensity).sort((a, b) => a - b);
  const p85Idx = Math.floor(intensities.length * 0.85);
  const threshold = Math.max(
    intensities[0] * 1.5,
    intensities[Math.max(0, p85Idx)] ?? intensities[intensities.length - 1] * 0.5
  );

  const aboveThreshold = new Set(nonZeroCells.filter(([, d]) => d.intensity >= threshold).map(([k]) => k));

  const clusters: Set<string>[] = [];
  const used = new Set<string>();

  for (const [key] of nonZeroCells) {
    if (!aboveThreshold.has(key) || used.has(key)) continue;
    const cluster = new Set<string>();
    const queue = [key];
    while (queue.length > 0) {
      const k = queue.shift()!;
      if (used.has(k) || !aboveThreshold.has(k)) continue;
      used.add(k);
      cluster.add(k);
      for (const nk of neighborKeys(k)) {
        if (aboveThreshold.has(nk) && !used.has(nk)) queue.push(nk);
      }
    }
    if (cluster.size >= 1) clusters.push(cluster);
  }

  const maxIntensity = Math.max(...intensities);
  const zones: ConflictZone[] = clusters.map((clusterKeys) => {
    let totalIntensity = 0;
    let totalEvents = 0;
    const allCountries = new Map<string, number>();
    const allLocations = new Map<string, number>();
    const allActors = new Map<string, number>();
    let sumLat = 0;
    let sumLon = 0;
    let n = 0;

    for (const k of clusterKeys) {
      const d = grid.get(k);
      if (!d) continue;
      totalIntensity += d.intensity;
      totalEvents += d.eventCount;
      for (const [c, count] of d.topCountries) {
        allCountries.set(c, (allCountries.get(c) ?? 0) + count);
      }
      for (const [l, count] of d.topLocations) {
        allLocations.set(l, (allLocations.get(l) ?? 0) + count);
      }
      for (const [a, count] of d.topActors) {
        allActors.set(a, (allActors.get(a) ?? 0) + count);
      }
      const { latIdx, lonIdx } = cellFromKey(k);
      sumLat += (latIdx + 0.5) * GRID_RES - 90;
      sumLon += (lonIdx + 0.5) * GRID_RES - 180;
      n += 1;
    }

    const avgIntensity = n > 0 ? totalIntensity / n : 0;
    const rawScore = Math.min(100, avgIntensity * 2 + Math.log10(1 + totalEvents) * 10);
    const intensity = Math.round(Math.min(100, rawScore));
    const severityLabel = severityBucket(intensity);

    const topLocations = Array.from(allLocations.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);
    const topActors = Array.from(allActors.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);

    const centroid = {
      lat: n > 0 ? sumLat / n : 0,
      lon: n > 0 ? sumLon / n : 0,
    };

    const sortedKeys = Array.from(clusterKeys).sort();
    const idHash = crypto
      .createHash("sha1")
      .update(`${timeWindow}:${sortedKeys.join(",")}:${centroid.lat.toFixed(2)}:${centroid.lon.toFixed(2)}`)
      .digest("hex")
      .slice(0, 12);
    const zoneId = `cz-${idHash}`;

    const geometry = cellsToPolygon(clusterKeys);
    const eventCountBySource: Record<ConflictEventSource, number> = {
      gdelt_events: 0,
      gdelt_geo: 0,
      ucdp: 0,
    };
    for (const k of clusterKeys) {
      const d = grid.get(k);
      if (!d) continue;
      for (const e of d.events) {
        eventCountBySource[e.source] = (eventCountBySource[e.source] ?? 0) + 1;
      }
    }

    const docQuery =
      mode === "broad"
        ? CONFLICT_QUERY_BROAD
        : CONFLICT_QUERY_STRICT;
    const docQueryUrl = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(docQuery)}&mode=artlist&format=html&timespan=${encodeURIComponent(timespan)}`;

    return {
      id: zoneId,
      type: "conflict_zone",
      centroid,
      geometry: { type: "Polygon", coordinates: geometry },
      timeWindow,
      intensity,
      severityLabel,
      eventCount: totalEvents,
      topActors,
      topLocations,
      sources,
      lastUpdated: now,
      docQuery,
      docQueryUrl,
      eventCountBySource,
    };
  });

  return {
    collection: conflictZonesToFeatureCollection(zones),
    sourceStatus,
    lastRefreshedAt: now,
  };
}
