import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { LayerFeatureCollection, LayerHealthState } from "../../../newsLayers/types";
import type {
  SanctionsEntity,
  SanctionsDataResult,
  SanctionsSourceStatusMap,
  SanctionsSourceStatus,
} from "./types";
import { fetchOfacEntities } from "./ofac";
import { fetchUnEntities } from "./un";
import { fetchEuEntities } from "./eu";
import { fetchUkEntities } from "./uk";

const MAX_MAP_FEATURES = 10_000;
const CACHE_TTL_MS = 24 * 60 * 60_000;

let cachedResult: SanctionsDataResult | null = null;
let cachedAt = 0;

function entitiesToFeatureCollection(
  entities: SanctionsEntity[]
): LayerFeatureCollection {
  const features: LayerFeatureCollection["features"] = [];

  for (const ent of entities) {
    if (!ent.geo) continue;
    if (features.length >= MAX_MAP_FEATURES) break;

    features.push({
      id: ent.id,
      geometry: {
        type: "Point",
        coordinates: [ent.geo.lon, ent.geo.lat],
      },
      properties: {
        id: ent.id,
        name: ent.name,
        entityType: ent.entityType,
        authority: ent.authority,
        program: ent.program,
        status: ent.status,
        designationDate: ent.designationDate,
        jurisdictionCountry: ent.jurisdictionCountry,
        linkedCountries: ent.linkedCountries.join(","),
        geoConfidence: ent.geo.geoConfidence,
        placeName: ent.geo.placeName,
        aliases: ent.aliases.slice(0, 5).join("; "),
        identifiers: JSON.stringify(ent.identifiers),
        sourceName: ent.sourceTrace.sourceName,
        sourceUrl: ent.sourceTrace.sourceUrl,
        datasetVersion: ent.sourceTrace.datasetVersion,
        lastUpdated: ent.sourceTrace.lastUpdated,
      },
      ts: Date.now(),
    });
  }

  return { type: "FeatureCollection", features };
}

async function loadSnapshotFallback(): Promise<SanctionsDataResult | null> {
  try {
    const file = path.join(
      process.cwd(),
      "public",
      "data",
      "news-layers",
      "sanctions-entities.json"
    );
    const text = await readFile(file, "utf8");
    const data = JSON.parse(text) as {
      entities: SanctionsEntity[];
      sourceStatus?: SanctionsSourceStatusMap;
    };

    if (!Array.isArray(data.entities)) return null;

    return {
      entities: data.entities,
      collection: entitiesToFeatureCollection(data.entities),
      sourceStatus: {
        snapshot: {
          status: "cached",
          lastUpdated: Date.now(),
          rowCount: data.entities.length,
          datasetVersion: null,
          errorCode: null,
        },
      },
    };
  } catch {
    return null;
  }
}

async function persistSnapshot(entities: SanctionsEntity[]): Promise<void> {
  try {
    const dir = path.join(process.cwd(), "public", "data", "news-layers");
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, "sanctions-entities.json");
    await writeFile(
      file,
      JSON.stringify({ entities: entities.slice(0, 50_000), ts: Date.now() }),
      "utf8"
    );
  } catch {
    // non-critical
  }
}

export async function getSanctionsData(): Promise<SanctionsDataResult> {
  const now = Date.now();
  if (cachedResult && now - cachedAt < CACHE_TTL_MS) {
    return cachedResult;
  }

  const sourceStatus: SanctionsSourceStatusMap = {};
  const allEntities: SanctionsEntity[] = [];

  const results = await Promise.allSettled([
    fetchOfacEntities(),
    fetchUnEntities(),
    fetchEuEntities(),
    fetchUkEntities(),
  ]);

  const keys: Array<keyof SanctionsSourceStatusMap> = [
    "ofac",
    "un",
    "eu",
    "uk",
  ];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const key = keys[i];
    if (r.status === "fulfilled") {
      allEntities.push(...r.value.entities);
      sourceStatus[key] = r.value.status;
    } else {
      sourceStatus[key] = {
        status: "unavailable",
        lastUpdated: null,
        rowCount: 0,
        datasetVersion: null,
        errorCode: r.reason?.message ?? "promise-rejected",
      };
    }
  }

  if (allEntities.length === 0) {
    console.log("[sanctions] all live sources failed, trying snapshot fallback");
    const fallback = await loadSnapshotFallback();
    if (fallback) {
      cachedResult = fallback;
      cachedAt = now;
      return fallback;
    }

    const empty: SanctionsDataResult = {
      entities: [],
      collection: { type: "FeatureCollection", features: [] },
      sourceStatus,
    };
    cachedResult = empty;
    cachedAt = now;
    return empty;
  }

  persistSnapshot(allEntities).catch(() => {});

  const result: SanctionsDataResult = {
    entities: allEntities,
    collection: entitiesToFeatureCollection(allEntities),
    sourceStatus,
  };

  cachedResult = result;
  cachedAt = now;
  return result;
}

export function toSanctionsLayerHealth(
  status: SanctionsSourceStatusMap
): LayerHealthState {
  const values = Object.values(status).filter(Boolean) as SanctionsSourceStatus[];
  if (!values.length) {
    return {
      status: "unavailable",
      lastSuccessAt: null,
      lastError: "no-sources",
      nextRetryAt: null,
      consecutiveFailures: 0,
    };
  }

  const anyLive = values.some((s) => s.status === "live");
  const anyCached = values.some((s) => s.status === "cached");
  const anyDegraded = values.some((s) => s.status === "degraded");

  const lastSuccessAt =
    values
      .map((s) => s.lastUpdated ?? 0)
      .filter((n) => n > 0)
      .sort((a, b) => b - a)[0] ?? null;

  let statusCode: LayerHealthState["status"] = "unavailable";
  if (anyLive) statusCode = "live";
  else if (anyCached) statusCode = "cached";
  else if (anyDegraded) statusCode = "degraded";

  const lastError =
    values
      .map((s) => s.errorCode)
      .filter((e) => typeof e === "string" && e.length > 0)[0] ?? null;

  return {
    status: statusCode,
    lastSuccessAt,
    lastError,
    nextRetryAt: null,
    consecutiveFailures: 0,
  };
}
