import { buildRecordKey, dedupeByRecordKey, toUtcMs } from "../runtime/normalize";
import type { LayerFeature, LayerFeatureCollection } from "./types";

type JsonObj = Record<string, unknown>;

function asObj(value: unknown): JsonObj | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObj;
}

function toPoint(geometry: unknown): LayerFeature["geometry"] | null {
  const obj = asObj(geometry);
  if (!obj || obj.type !== "Point") return null;
  const coords = Array.isArray(obj.coordinates) ? obj.coordinates : null;
  if (!coords || coords.length < 2) return null;
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { type: "Point", coordinates: [lon, lat] };
}

function toLineString(geometry: unknown): LayerFeature["geometry"] | null {
  const obj = asObj(geometry);
  if (!obj || obj.type !== "LineString") return null;
  const rows = Array.isArray(obj.coordinates) ? obj.coordinates : null;
  if (!rows || rows.length < 2) return null;
  const points: [number, number][] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const lon = Number(row[0]);
    const lat = Number(row[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    points.push([lon, lat]);
  }
  if (points.length < 2) return null;
  return { type: "LineString", coordinates: points };
}

function toPolygon(geometry: unknown): LayerFeature["geometry"] | null {
  const obj = asObj(geometry);
  if (!obj || obj.type !== "Polygon") return null;
  const rings = Array.isArray(obj.coordinates) ? obj.coordinates : null;
  if (!rings || !rings.length) return null;
  const first = Array.isArray(rings[0]) ? rings[0] : [];
  const points: [number, number][] = [];
  for (const row of first) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const lon = Number(row[0]);
    const lat = Number(row[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    points.push([lon, lat]);
  }
  if (points.length < 3) return null;
  return { type: "Polygon", coordinates: [points] };
}

function toGeometry(raw: unknown): LayerFeature["geometry"] | null {
  const obj = asObj(raw);
  if (!obj) return null;
  return toPoint(obj) ?? toLineString(obj) ?? toPolygon(obj);
}

function toFeature(raw: unknown, index: number): LayerFeature | null {
  const obj = asObj(raw);
  if (!obj || obj.type !== "Feature") return null;
  const geometry = toGeometry(obj.geometry);
  if (!geometry) return null;
  const props = asObj(obj.properties) ?? {};
  const id =
    String(obj.id ?? props.id ?? props.code ?? props.name ?? buildRecordKey(index, geometry.type)).trim();
  const ts = toUtcMs(props.ts ?? props.time ?? props.timestamp ?? props.updatedAt ?? Date.now());
  return {
    id,
    geometry,
    properties: props,
    ts,
  };
}

export function normalizeLayerFeatureCollection(input: unknown, fallbackIdPrefix: string): LayerFeatureCollection {
  const root = asObj(input);
  const rows = root && Array.isArray(root.features) ? root.features : [];
  const parsed: LayerFeature[] = [];
  rows.forEach((item, index) => {
    const normalized = toFeature(item, index);
    if (normalized) parsed.push(normalized);
  });
  const deduped = dedupeByRecordKey(parsed, (item) =>
    buildRecordKey(
      item.id || `${fallbackIdPrefix}-${item.ts}`,
      item.geometry.type,
      JSON.stringify(item.geometry.coordinates).slice(0, 120)
    )
  );
  return {
    type: "FeatureCollection",
    features: deduped,
  };
}

export function capAndAggregateFeatures(
  input: LayerFeatureCollection,
  maxFeatures: number
): LayerFeatureCollection {
  if (input.features.length <= maxFeatures) return input;
  const buckets = new Map<string, LayerFeature[]>();
  for (const feature of input.features) {
    if (feature.geometry.type !== "Point") continue;
    const coords = feature.geometry.coordinates as [number, number];
    const lon = coords[0];
    const lat = coords[1];
    const cell = `${Math.floor((lat + 90) / 6)}:${Math.floor((lon + 180) / 6)}`;
    const rows = buckets.get(cell);
    if (rows) rows.push(feature);
    else buckets.set(cell, [feature]);
  }

  const aggregated: LayerFeature[] = [];
  buckets.forEach((rows, key) => {
    const lon =
      rows.reduce((sum, item) => sum + (item.geometry.coordinates as [number, number])[0], 0) / rows.length;
    const lat =
      rows.reduce((sum, item) => sum + (item.geometry.coordinates as [number, number])[1], 0) / rows.length;
    aggregated.push({
      id: `agg:${key}`,
      geometry: { type: "Point", coordinates: [lon, lat] },
      ts: Math.max(...rows.map((item) => item.ts)),
      properties: {
        aggregateCount: rows.length,
        label: `${rows.length} events`,
      },
    });
  });
  return {
    type: "FeatureCollection",
    features: aggregated.slice(0, maxFeatures),
  };
}
