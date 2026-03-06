import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LayerFeatureCollection } from "../../../newsLayers/types";
import { fetchFromWikidata } from "./wikidata";
import { fetchPoiDensities } from "./overpass";
import { fetchWorldBankMacro } from "./worldbank";
import { rankAndScoreHubs } from "./scoring";
import type {
  EconomicCenterLayerResult,
  EconomicCenterSourceStatusMap,
  EconomicHubRecord,
} from "./types";

let cachedResult: EconomicCenterLayerResult | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 4 * 60 * 60_000; // 4 hours

function emptyResult(): EconomicCenterLayerResult {
  return {
    collection: { type: "FeatureCollection", features: [] },
    sourceStatus: {
      wikidata:  { status: "unavailable", lastUpdated: null, errorCode: null },
      overpass:  { status: "unavailable", lastUpdated: null, errorCode: null },
      worldbank: { status: "unavailable", lastUpdated: null, errorCode: null },
    },
  };
}

async function loadSnapshotFallback(): Promise<EconomicCenterLayerResult> {
  try {
    const file = path.join(
      process.cwd(),
      "public",
      "data",
      "news-layers",
      "economic-centers.geojson",
    );
    const text = await readFile(file, "utf8");
    const parsed = JSON.parse(text) as LayerFeatureCollection;
    if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
      return emptyResult();
    }
    // If the snapshot has rich pre-computed data, mark sources as "cached"
    // so the UI shows a meaningful status instead of "unavailable"
    const hasRichData =
      parsed.features.length > 5 &&
      parsed.features.some((f) => f.properties?.scoreTotal != null);
    const snapshotStatus = hasRichData ? "cached" : "unavailable";
    const snapshotTs = hasRichData ? Date.now() : null;
    const status: EconomicCenterSourceStatusMap = {
      wikidata:  { status: snapshotStatus as "cached" | "unavailable", lastUpdated: snapshotTs, errorCode: null },
      overpass:  { status: snapshotStatus as "cached" | "unavailable", lastUpdated: snapshotTs, errorCode: null },
      worldbank: { status: snapshotStatus as "cached" | "unavailable", lastUpdated: snapshotTs, errorCode: null },
    };
    return { collection: parsed, sourceStatus: status };
  } catch {
    return emptyResult();
  }
}

/** Convert a scored EconomicHubRecord to a GeoJSON-compatible feature */
function hubToFeature(hub: EconomicHubRecord): object {
  return {
    type: "Feature",
    id: hub.id,
    geometry: { type: "Point", coordinates: [hub.lon, hub.lat] },
    properties: {
      id:             hub.id,
      name:           hub.name,
      country:        hub.country,
      countryIso2:    hub.countryIso2,
      admin1:         hub.admin1 ?? null,
      lat:            hub.lat,
      lon:            hub.lon,
      population:     hub.population ?? null,
      scoreTotal:     hub.scoreTotal,
      // JSON-stringify nested objects — GeoJSON properties must be primitives
      scoreBreakdown: JSON.stringify(hub.scoreBreakdown),
      rank:           hub.rank,
      keyAssets:      JSON.stringify(hub.keyAssets),
      sourceTrace:    JSON.stringify(hub.sourceTrace),
      ts:             hub.lastUpdated,
    },
    ts: hub.lastUpdated,
  };
}

export async function getEconomicCentersLayer(): Promise<EconomicCenterLayerResult> {
  const now = Date.now();
  if (cachedResult && now - cachedAt < CACHE_TTL_MS && cachedResult.collection.features.length > 5) {
    return cachedResult;
  }

  try {
    // Step 1: fetch city candidates + asset lists from Wikidata
    const { rawHubs, sourceStatus: wdStatus } = await fetchFromWikidata();

    if (rawHubs.length === 0) {
      // No Wikidata data — serve snapshot
      const fallback = await loadSnapshotFallback();
      cachedResult = fallback;
      cachedAt = now;
      return fallback;
    }

    // Step 2: fetch OSM POI densities and World Bank macro in parallel
    const hubCoords = rawHubs.map((h) => ({ id: h.id, lat: h.lat, lon: h.lon }));
    const [poiResult, wbResult] = await Promise.all([
      fetchPoiDensities(hubCoords),
      fetchWorldBankMacro(),
    ]);

    // Step 3: attach enrichments to each raw hub
    const enrichedHubs = rawHubs.map((hub) => ({
      ...hub,
      poiCounts: poiResult.densities.get(hub.id) ?? {
        banks: 0, financial: 0, ports: 0, airports: 0, industrial: 0,
      },
      macro: wbResult.macroByIso2.get(hub.countryIso2.toUpperCase()) ?? null,
    }));

    // Step 4: score and rank
    const scored = rankAndScoreHubs(
      enrichedHubs,
      Date.now(), // overpassTs (approximate)
      wdStatus.lastUpdated ?? now,
      wbResult.sourceStatus.lastUpdated ?? now,
    );

    // Step 5: convert to LayerFeatureCollection
    const features = scored.map(hubToFeature);
    const collection: LayerFeatureCollection = {
      type: "FeatureCollection",
      features: features as LayerFeatureCollection["features"],
    };

    const sourceStatus: EconomicCenterSourceStatusMap = {
      wikidata:  wdStatus,
      overpass:  poiResult.sourceStatus,
      worldbank: wbResult.sourceStatus,
    };

    const result: EconomicCenterLayerResult = { collection, sourceStatus };

    if (features.length > 0) {
      cachedResult = result;
      cachedAt = now;
    }

    return result;
  } catch {
    // Serve stale in-process cache if available
    if (cachedResult) return cachedResult;
    // Otherwise snapshot
    const fallback = await loadSnapshotFallback();
    cachedResult = fallback;
    cachedAt = now;
    return fallback;
  }
}
