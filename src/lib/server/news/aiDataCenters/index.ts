import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LayerFeatureCollection } from "../../../newsLayers/types";
import { fetchDataCentersFromWikidata } from "./wikidata";
import { fetchDataCentersFromOverpass } from "./overpass";
import { clusterAndScoreSites } from "./scoring";
import type {
  AiDataCenterLayerResult,
  AiDataCenterSourceStatusMap,
  AiDataCenterCluster,
} from "./types";

let cachedResult: AiDataCenterLayerResult | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 4 * 60 * 60_000; // 4 hours

function emptyResult(): AiDataCenterLayerResult {
  return {
    collection: { type: "FeatureCollection", features: [] },
    sourceStatus: {
      wikidata: { status: "unavailable", lastUpdated: null, errorCode: null },
      overpass: { status: "unavailable", lastUpdated: null, errorCode: null },
    },
  };
}

async function loadSnapshotFallback(): Promise<AiDataCenterLayerResult> {
  try {
    const file = path.join(
      process.cwd(),
      "public",
      "data",
      "news-layers",
      "ai-data-centers.geojson",
    );
    const text = await readFile(file, "utf8");
    const parsed = JSON.parse(text) as LayerFeatureCollection;
    if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
      return emptyResult();
    }
    const hasRichData =
      parsed.features.length > 5 &&
      parsed.features.some((f) => f.properties?.importance != null);
    const snapshotStatus = hasRichData ? "cached" : "unavailable";
    const snapshotTs = hasRichData ? Date.now() : null;
    return {
      collection: parsed,
      sourceStatus: {
        wikidata: { status: snapshotStatus as "cached" | "unavailable", lastUpdated: snapshotTs, errorCode: null },
        overpass: { status: snapshotStatus as "cached" | "unavailable", lastUpdated: snapshotTs, errorCode: null },
      },
    };
  } catch {
    return emptyResult();
  }
}

/** Convert a scored cluster to a GeoJSON-compatible feature */
function clusterToFeature(cluster: AiDataCenterCluster): object {
  return {
    type: "Feature",
    id: cluster.id,
    geometry: { type: "Point", coordinates: [cluster.centroidLon, cluster.centroidLat] },
    properties: {
      id:                   cluster.id,
      name:                 cluster.name,
      country:              cluster.country,
      countryIso2:          cluster.countryIso2,
      admin1:               cluster.admin1 ?? null,
      lat:                  cluster.centroidLat,
      lon:                  cluster.centroidLon,
      // JSON-stringify nested objects — GeoJSON properties must be primitives
      operators:            JSON.stringify(cluster.operators),
      operatorTypes:        JSON.stringify(cluster.operatorTypes),
      siteCount:            cluster.siteCount,
      confidence:           cluster.confidence,
      importance:           cluster.importance,
      importanceBreakdown:  JSON.stringify(cluster.importanceBreakdown),
      sites:                JSON.stringify(cluster.sites),
      notes:                cluster.notes,
      sourceTrace:          JSON.stringify(cluster.sourceTrace),
      ts:                   cluster.lastUpdated,
    },
    ts: cluster.lastUpdated,
  };
}

export async function getAiDataCentersLayer(): Promise<AiDataCenterLayerResult> {
  const now = Date.now();
  if (cachedResult && now - cachedAt < CACHE_TTL_MS && cachedResult.collection.features.length > 5) {
    return cachedResult;
  }

  try {
    // Fetch from both sources in parallel
    const [wdResult, osmResult] = await Promise.all([
      fetchDataCentersFromWikidata(),
      fetchDataCentersFromOverpass(),
    ]);

    const totalSites = wdResult.sites.length + osmResult.sites.length;
    if (totalSites === 0) {
      // No live data — serve snapshot
      const fallback = await loadSnapshotFallback();
      cachedResult = fallback;
      cachedAt = now;
      return fallback;
    }

    // Merge, cluster, and score
    const clusters = clusterAndScoreSites(
      wdResult.sites,
      osmResult.sites,
      wdResult.sourceStatus.lastUpdated ?? now,
      osmResult.sourceStatus.lastUpdated ?? now,
    );

    // Convert to LayerFeatureCollection
    const features = clusters.map(clusterToFeature);
    const collection: LayerFeatureCollection = {
      type: "FeatureCollection",
      features: features as LayerFeatureCollection["features"],
    };

    const sourceStatus: AiDataCenterSourceStatusMap = {
      wikidata: wdResult.sourceStatus,
      overpass: osmResult.sourceStatus,
    };

    const result: AiDataCenterLayerResult = { collection, sourceStatus };

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
