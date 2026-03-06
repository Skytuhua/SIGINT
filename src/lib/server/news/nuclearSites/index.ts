import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LayerFeatureCollection, LayerHealthState } from "../../../newsLayers/types";
import { fetchFromOverpass, fetchFromNrc, fetchFromWikidata } from "./fetchers";
import { mergeNuclearFacilities, type NuclearLayerResult } from "./merge";
import type { NuclearSourceStatusMap } from "./types";

let cachedResult: NuclearLayerResult | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 24 * 60 * 60_000;

function emptyLayer(): NuclearLayerResult {
  return {
    collection: { type: "FeatureCollection", features: [] },
    sourceStatus: {
      wikidata: { status: "unavailable", lastUpdated: null, errorCode: null },
      osm: { status: "unavailable", lastUpdated: null, errorCode: null },
      nrc: { status: "unavailable", lastUpdated: null, errorCode: null },
      snapshot: { status: "unavailable", lastUpdated: null, errorCode: null },
    },
  };
}

async function loadSnapshotFallback(): Promise<NuclearLayerResult> {
  try {
    const file = path.join(process.cwd(), "public", "data", "news-layers", "nuclear-sites.geojson");
    const text = await readFile(file, "utf8");
    const parsed = JSON.parse(text) as LayerFeatureCollection;
    if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
      return emptyLayer();
    }
    const status: NuclearSourceStatusMap = {
      wikidata: { status: "unavailable", lastUpdated: null, errorCode: null },
      osm: { status: "unavailable", lastUpdated: null, errorCode: null },
      nrc: { status: "unavailable", lastUpdated: null, errorCode: null },
      snapshot: { status: "live", lastUpdated: Date.now(), errorCode: null },
    };
    return { collection: parsed, sourceStatus: status };
  } catch {
    return emptyLayer();
  }
}

export async function getNuclearSitesLayer(): Promise<NuclearLayerResult> {
  const now = Date.now();
  if (cachedResult && now - cachedAt < CACHE_TTL_MS) {
    return cachedResult;
  }

  try {
    const [wikidata, osm, nrc] = await Promise.all([
      fetchFromWikidata(),
      fetchFromOverpass(),
      fetchFromNrc(),
    ]);

    const merged = mergeNuclearFacilities(
      wikidata.facilities,
      osm.facilities,
      nrc.facilities,
      wikidata.sourceStatus,
      osm.sourceStatus,
      nrc.sourceStatus
    );

    // Avoid empty layers: if merged has no features, fall back to snapshot.
    const base = merged.collection.features.length ? merged : await loadSnapshotFallback();

    cachedResult = base;
    cachedAt = now;
    return base;
  } catch {
    const fallback = await loadSnapshotFallback();
    cachedResult = fallback;
    cachedAt = now;
    return fallback;
  }
}

export function toLayerHealthFromSources(status: NuclearSourceStatusMap): LayerHealthState {
  const values = Object.values(status).filter(Boolean);
  if (!values.length) {
    return {
      status: "unavailable",
      lastSuccessAt: null,
      lastError: "no-sources",
      nextRetryAt: null,
      consecutiveFailures: 0,
    };
  }
  const anyLive = values.some((s) => s!.status === "live");
  const anyCached = values.some((s) => s!.status === "cached");
  const anyDegraded = values.some((s) => s!.status === "degraded");
  const lastSuccessAt =
    values
      .map((s) => s!.lastUpdated ?? 0)
      .filter((n) => n > 0)
      .sort((a, b) => b - a)[0] ?? null;

  let statusCode: LayerHealthState["status"] = "unavailable";
  if (anyLive) statusCode = "live";
  else if (anyCached) statusCode = "cached";
  else if (anyDegraded) statusCode = "degraded";

  const lastError =
    values
      .map((s) => s!.errorCode)
      .filter((e) => typeof e === "string" && e.length > 0)[0] ?? null;

  return {
    status: statusCode,
    lastSuccessAt,
    lastError,
    nextRetryAt: null,
    consecutiveFailures: 0,
  };
}

