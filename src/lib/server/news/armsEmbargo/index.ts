import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LayerFeatureCollection, LayerHealthState } from "../../../newsLayers/types";
import type { EmbargoSourceStatusMap } from "./types";
import { fetchProgrammesFromWikidata } from "./wikidata";
import { fetchProgrammesFromOfficialSources } from "./officialSources";
import { buildCountryAggregates } from "./countries";

export interface ArmsEmbargoLayerResult {
  collection: LayerFeatureCollection;
  sourceStatus: EmbargoSourceStatusMap;
}

let cachedResult: ArmsEmbargoLayerResult | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 24 * 60 * 60_000;

function emptyLayer(): ArmsEmbargoLayerResult {
  return {
    collection: { type: "FeatureCollection", features: [] },
    sourceStatus: {
      snapshot: { status: "unavailable", lastUpdated: null, errorCode: null },
    },
  };
}

async function loadSnapshotFallback(): Promise<ArmsEmbargoLayerResult> {
  try {
    const file = path.join(process.cwd(), "public", "data", "news-layers", "arms-embargo-zones.geojson");
    const text = await readFile(file, "utf8");
    const parsed = JSON.parse(text) as LayerFeatureCollection;
    if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
      return emptyLayer();
    }
    return {
      collection: parsed,
      sourceStatus: {
        snapshot: { status: "live", lastUpdated: Date.now(), errorCode: null, rowCount: parsed.features.length },
      },
    };
  } catch {
    return emptyLayer();
  }
}

export async function getArmsEmbargoZonesLayer(): Promise<ArmsEmbargoLayerResult> {
  const now = Date.now();
  if (cachedResult && now - cachedAt < CACHE_TTL_MS) {
    return cachedResult;
  }

  // Try official/curated sources first
  try {
    const { programmes: officialProgrammes, sourceStatuses: officialStatuses } =
      await fetchProgrammesFromOfficialSources();

    if (officialProgrammes.length > 0) {
      const { collection, unmatched } = await buildCountryAggregates(officialProgrammes);

      if (unmatched.length > 0) {
        console.log(`[arms-embargo] ${unmatched.length} unmatched targets: ${unmatched.join(", ")}`);
      }

      if (collection.features.length > 0) {
        const result: ArmsEmbargoLayerResult = {
          collection,
          sourceStatus: officialStatuses,
        };
        cachedResult = result;
        cachedAt = now;
        return result;
      }
    }
  } catch (err) {
    console.warn("[arms-embargo] official sources failed, trying Wikidata:", err);
  }

  // Fall back to Wikidata SPARQL
  try {
    const programmes = await fetchProgrammesFromWikidata();
    const { collection, unmatched } = await buildCountryAggregates(programmes);

    if (unmatched.length > 0) {
      console.log(`[arms-embargo] wikidata: ${unmatched.length} unmatched targets: ${unmatched.join(", ")}`);
    }

    if (collection.features.length === 0) {
      const fallback = await loadSnapshotFallback();
      cachedResult = fallback;
      cachedAt = now;
      return fallback;
    }

    const result: ArmsEmbargoLayerResult = {
      collection,
      sourceStatus: {
        wikidata: { status: "live", lastUpdated: now, errorCode: null, rowCount: programmes.length },
      },
    };

    cachedResult = result;
    cachedAt = now;
    return result;
  } catch (err) {
    console.error("[arms-embargo] pipeline error, falling back to snapshot:", err);
    const fallback = await loadSnapshotFallback();
    cachedResult = fallback;
    cachedAt = now;
    return fallback;
  }
}

export function toEmbargoLayerHealth(status: EmbargoSourceStatusMap): LayerHealthState {
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
