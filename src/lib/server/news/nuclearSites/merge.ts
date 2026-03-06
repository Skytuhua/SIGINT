import type { LayerFeature, LayerFeatureCollection } from "../../../newsLayers/types";
import type {
  NuclearFacilityRecord,
  NuclearSourceStatusMap,
  NuclearSourceStatus,
} from "./types";

export interface NuclearLayerResult {
  collection: LayerFeatureCollection;
  sourceStatus: NuclearSourceStatusMap;
}

function deg2rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = deg2rad(b.lat - a.lat);
  const dLon = deg2rad(b.lon - a.lon);
  const lat1 = deg2rad(a.lat);
  const lat2 = deg2rad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

function normalizeKey(name: string | undefined, country: string | undefined): string {
  const n = (name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const c = (country ?? "").toLowerCase().trim();
  return `${n}::${c}`;
}

function pickStatus(
  a: NuclearSourceStatus | undefined,
  b: NuclearSourceStatus | undefined
): NuclearSourceStatus | undefined {
  if (!a) return b;
  if (!b) return a;
  // Prefer \"live\" over degraded/unavailable, otherwise pick the most recent.
  const rank = (s: NuclearSourceStatus) =>
    s.status === "live" ? 3 : s.status === "cached" ? 2 : s.status === "degraded" ? 1 : 0;
  if (rank(b) > rank(a)) return b;
  if ((b.lastUpdated ?? 0) > (a.lastUpdated ?? 0)) return b;
  return a;
}

export function mergeNuclearFacilities(
  wikidata: NuclearFacilityRecord[],
  osm: NuclearFacilityRecord[],
  nrc: NuclearFacilityRecord[],
  statusA: NuclearSourceStatusMap,
  statusB: NuclearSourceStatusMap,
  statusC: NuclearSourceStatusMap
): NuclearLayerResult {
  const byId = new Map<string, NuclearFacilityRecord>();

  const addOrMerge = (next: NuclearFacilityRecord, precedence: "wikidata" | "nrc" | "osm") => {
    const existing = byId.get(next.id);
    if (!existing) {
      byId.set(next.id, next);
      return;
    }
    // When merging, prefer fields from higher-precedence sources (wikidata > nrc > osm),
    // but never overwrite a present value with undefined.
    const order = ["wikidata", "nrc", "osm"] as const;
    const existingRank = order.indexOf(precedence);
    const newRank = existingRank;
    void newRank; // kept for clarity in case we later refine precedence per-field.

    const merged: NuclearFacilityRecord = {
      ...existing,
      name: existing.name || next.name,
      type: existing.type || next.type,
      status: existing.status || next.status,
      lat: existing.lat,
      lon: existing.lon,
      geometryPolygon: existing.geometryPolygon ?? next.geometryPolygon,
      country: existing.country ?? next.country,
      admin1: existing.admin1 ?? next.admin1,
      operator: existing.operator ?? next.operator,
      capacityMw: existing.capacityMw ?? next.capacityMw,
      reactorCount: existing.reactorCount ?? next.reactorCount,
      startDate: existing.startDate ?? next.startDate,
      lastUpdated: Math.max(existing.lastUpdated, next.lastUpdated),
      sourceName: existing.sourceName,
      sourceUrl: existing.sourceUrl ?? next.sourceUrl,
      sourceIds: {
        ...existing.sourceIds,
        ...next.sourceIds,
      },
      references: [...existing.references, ...next.references],
      rawUpstream: {
        wikidata: existing.rawUpstream?.wikidata ?? next.rawUpstream?.wikidata,
        osm: existing.rawUpstream?.osm ?? next.rawUpstream?.osm,
        nrc: existing.rawUpstream?.nrc ?? next.rawUpstream?.nrc,
      },
    };
    byId.set(merged.id, merged);
  };

  // Seed with Wikidata: primary identity anchor.
  for (const row of wikidata) {
    byId.set(row.id, row);
  }

  // Attach OSM facilities: match by explicit wikidata tag (if present when normalizing),
  // otherwise by normalized name+country and proximity threshold.
  const wikidataByNameKey = new Map<string, NuclearFacilityRecord[]>();
  for (const row of wikidata) {
    const key = normalizeKey(row.name, row.country);
    if (!key) continue;
    const list = wikidataByNameKey.get(key) ?? [];
    list.push(row);
    wikidataByNameKey.set(key, list);
  }

  for (const row of osm) {
    // Try to match to an existing record by name+country+distance.
    const key = normalizeKey(row.name, row.country);
    const candidates = key ? wikidataByNameKey.get(key) ?? [] : [];
    let matched = false;
    for (const candidate of candidates) {
      const d = haversineKm(
        { lat: row.lat, lon: row.lon },
        { lat: candidate.lat, lon: candidate.lon }
      );
      if (d <= 10) {
        const merged: NuclearFacilityRecord = {
          ...row,
          id: candidate.id,
          sourceIds: {
            ...row.sourceIds,
            ...candidate.sourceIds,
          },
        };
        addOrMerge(merged, "osm");
        matched = true;
        break;
      }
    }
    if (!matched) {
      addOrMerge(row, "osm");
    }
  }

  // Attach NRC records primarily to US facilities by name+state.
  const byUsKey = new Map<string, NuclearFacilityRecord[]>();
  for (const row of Array.from(byId.values())) {
    if (row.country !== "United States" && row.country !== "US") continue;
    const key = normalizeKey(row.name, row.admin1);
    if (!key) continue;
    const list = byUsKey.get(key) ?? [];
    list.push(row);
    byUsKey.set(key, list);
  }

  for (const row of nrc) {
    const key = normalizeKey(row.name, row.admin1);
    const candidates = key ? byUsKey.get(key) ?? [] : [];
    if (!candidates.length) {
      addOrMerge(row, "nrc");
      continue;
    }
    const target = candidates[0];
    const merged: NuclearFacilityRecord = {
      ...row,
      id: target.id,
      sourceIds: {
        ...target.sourceIds,
        ...row.sourceIds,
      },
    };
    addOrMerge(merged, "nrc");
  }

  const features: LayerFeature[] = [];

  for (const facility of Array.from(byId.values())) {
    if (!Number.isFinite(facility.lat) || !Number.isFinite(facility.lon)) continue;
    const props: Record<string, unknown> = {
      name: facility.name,
      type: facility.type,
      status: facility.status,
      country: facility.country,
      admin1: facility.admin1,
      operator: facility.operator,
      capacityMw: facility.capacityMw,
      reactorCount: facility.reactorCount,
      startDate: facility.startDate,
      sourceName: facility.sourceName,
      sourceUrl: facility.sourceUrl,
      sourceIds: facility.sourceIds,
      references: facility.references,
    };

    if (facility.geometryPolygon && facility.geometryPolygon.length >= 3) {
      props.footprintPolygon = facility.geometryPolygon;
    }

    const feature: LayerFeature = {
      id: facility.id,
      geometry: {
        type: "Point",
        coordinates: [facility.lon, facility.lat],
      },
      properties: props,
      ts: facility.lastUpdated,
    };
    features.push(feature);
  }

  const collection: LayerFeatureCollection = {
    type: "FeatureCollection",
    features,
  };

  const sourceStatus: NuclearSourceStatusMap = {
    wikidata: pickStatus(statusA.wikidata, pickStatus(statusB.wikidata, statusC.wikidata)),
    osm: pickStatus(statusA.osm, pickStatus(statusB.osm, statusC.osm)),
    nrc: pickStatus(statusA.nrc, pickStatus(statusB.nrc, statusC.nrc)),
    snapshot: statusA.snapshot ?? statusB.snapshot ?? statusC.snapshot,
  };

  return { collection, sourceStatus };
}

