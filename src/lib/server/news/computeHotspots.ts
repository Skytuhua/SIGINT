/**
 * Intel Hotspots — Orchestrates scoring pipeline and returns GeoJSON features.
 */

import { HOTSPOT_REGISTRY } from "../../../config/hotspotRegistry";
import type { TimeWindow } from "../../../config/hotspotRegistry";
import {
  fetchGdeltDocSignals,
  fetchGdeltGeoSignals,
  fetchGdeltMilitarySignals,
  fetchUsgsSignals,
  fetchEonetSignals,
  fetchNwsSignals,
  fetchFaaSignals,
  type HotspotSignal,
} from "./hotspotSources";
import {
  computeNewsScore,
  computeCiiScore,
  computeGeoScore,
  computeMilitaryScore,
  blendToCurrentScore,
  computeTrend,
  buildDrivers,
} from "./hotspotScorer";
import type { HotspotFeatureProperties } from "../../../lib/news/hotspotTypes";

export type { HotspotFeatureProperties };

export interface HotspotGeoJSONFeature {
  type: "Feature";
  id: string;
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: HotspotFeatureProperties;
}

export interface HotspotFeatureCollection {
  type: "FeatureCollection";
  features: HotspotGeoJSONFeature[];
}

export async function computeAllHotspots(timeWindow: TimeWindow): Promise<HotspotFeatureCollection> {
  const usHotspots = HOTSPOT_REGISTRY.filter((h) => h.usOnly);
  const usBboxes = usHotspots.map((h) => h.scope.bbox);
  const allBboxes = HOTSPOT_REGISTRY.map((h) => h.scope.bbox);

  const [
    gdeltDocMap,
    gdeltGeoMap,
    gdeltMilMap,
    usgsResult,
    nwsResult,
    faaResult,
  ] = await Promise.all([
    fetchGdeltDocSignals(HOTSPOT_REGISTRY, timeWindow),
    fetchGdeltGeoSignals(HOTSPOT_REGISTRY, timeWindow),
    fetchGdeltMilitarySignals(HOTSPOT_REGISTRY, timeWindow),
    fetchUsgsSignals(allBboxes, timeWindow),
    usBboxes.length > 0 ? fetchNwsSignals() : Promise.resolve({ signals: [], cacheHit: "miss" as const, degraded: false }),
    usBboxes.length > 0 ? fetchFaaSignals() : Promise.resolve({ signals: [], cacheHit: "miss" as const, degraded: false }),
  ]);

  const eonetMap = new Map<string, { signals: HotspotSignal[] }>();
  await Promise.all(
    HOTSPOT_REGISTRY.map(async (h) => {
      const r = await fetchEonetSignals(h.scope.bbox);
      eonetMap.set(h.id, { signals: r.signals });
    })
  );

  const lastUpdated = Date.now();
  const features: HotspotGeoJSONFeature[] = [];

  for (const hotspot of HOTSPOT_REGISTRY) {
    const docData = gdeltDocMap.get(hotspot.id);
    const geoData = gdeltGeoMap.get(hotspot.id);
    const milData = gdeltMilMap.get(hotspot.id);
    const eonetData = eonetMap.get(hotspot.id);

    const newsSignals = docData?.signals ?? [];
    const unrestSignals = geoData?.signals ?? [];
    const milSignals = milData?.signals ?? [];
    const eonetSignals = eonetData?.signals ?? [];
    const usgsInScope = (usgsResult.signals ?? []).filter((s) =>
      s.lat != null && s.lon != null && inBbox(s.lat, s.lon, hotspot.scope.bbox)
    );
    const nwsInScope = hotspot.usOnly
      ? (nwsResult.signals ?? []).filter((s) =>
          s.lat != null && s.lon != null && inBbox(s.lat, s.lon, hotspot.scope.bbox)
        )
      : [];
    const faaSignals = hotspot.usOnly ? (faaResult.signals ?? []) : [];

    const allSignals: HotspotSignal[] = [
      ...newsSignals,
      ...unrestSignals,
      ...eonetSignals,
      ...usgsInScope.map((s) => ({ ...s, type: "seismic" as const })),
      ...nwsInScope.map((s) => ({ ...s, type: "alert" as const })),
      ...milSignals,
      ...faaSignals,
    ];

    const ciiSignals: HotspotSignal[] = [...unrestSignals, ...eonetSignals, ...usgsInScope];
    const newsScore = computeNewsScore(allSignals, hotspot.driverQueries, timeWindow);
    const ciiScore = computeCiiScore(ciiSignals);
    const geoScore = await computeGeoScore(hotspot);
    const militaryScore = computeMilitaryScore(milSignals, !!hotspot.usOnly, faaSignals);
    const currentScore = blendToCurrentScore(newsScore, ciiScore, geoScore, militaryScore);
    const trend = computeTrend(currentScore, hotspot.baselineScore);
    const drivers = buildDrivers(allSignals, 6);

    const sourceStatuses: Record<string, "live" | "cached" | "degraded" | "unavailable"> = {};
    if (docData?.result) {
      sourceStatuses["gdelt-doc"] = docData.result.degraded ? "degraded" : docData.result.cacheHit === "fresh" ? "live" : "cached";
    }
    if (geoData?.result) {
      sourceStatuses["gdelt-geo"] = geoData.result.degraded ? "degraded" : geoData.result.cacheHit === "fresh" ? "live" : "cached";
    }
    sourceStatuses["usgs"] = usgsResult.degraded ? "degraded" : usgsResult.cacheHit === "fresh" ? "live" : "cached";
    if (hotspot.usOnly) {
      sourceStatuses["nws"] = nwsResult.degraded ? "degraded" : nwsResult.cacheHit === "fresh" ? "live" : "cached";
      sourceStatuses["faa"] = faaResult.degraded ? "degraded" : faaResult.cacheHit === "fresh" ? "live" : "cached";
    }
    sourceStatuses["eonet"] = "cached";

    features.push({
      type: "Feature",
      id: hotspot.id,
      geometry: {
        type: "Point",
        coordinates: [hotspot.anchor.lon, hotspot.anchor.lat],
      },
      properties: {
        id: hotspot.id,
        name: hotspot.name,
        tier: hotspot.tier,
        tags: hotspot.tags,
        anchor: hotspot.anchor,
        scopeCountries: hotspot.scope.countries,
        baselineScore: hotspot.baselineScore,
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
        currentScore,
        trend,
        newsScore,
        ciiScore,
        geoScore,
        militaryScore,
        drivers,
        lastUpdated,
        timeWindow,
        sourceStatuses,
      },
    });
  }

  return { type: "FeatureCollection", features };
}

function inBbox(lat: number, lon: number, bbox: [number, number, number, number]): boolean {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
}
