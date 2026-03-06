import type { LayerFeature, LayerFeatureCollection } from "../../../newsLayers/types";

/** Internal event source identifier. */
export type ConflictEventSource = "gdelt_events" | "gdelt_geo" | "ucdp";

/** Internal event input for conflict zone aggregation. */
export interface ConflictEvent {
  id: string;
  timestamp: number;
  lat: number;
  lon: number;
  source: ConflictEventSource;
  quadClass?: number;
  cameoRoot?: string;
  country?: string;
  admin1?: string;
  locationName?: string;
  actors: string[];
  articleCount: number;
  mentionCount: number;
  severityWeight: number;
  verified: boolean;
  sourceUrl?: string;
  sourceDatasetVersion?: string;
}

/** Severity label for display. */
export type ConflictZoneSeverityLabel = "Low" | "Elevated" | "High" | "Severe";

/** Time window for aggregation. */
export type ConflictZoneTimeWindow = "6h" | "24h" | "7d" | "30d" | "90d";

/** Source metadata for traceability. */
export interface ConflictZoneSourceInfo {
  dataset: string;
  datasetVersion?: string;
  lastRefresh?: number;
}

/** GeoJSON Polygon (single polygon, possibly with holes). */
export type ConflictZonePolygonCoords = [number, number][][];

/** GeoJSON MultiPolygon. */
export type ConflictZoneMultiPolygonCoords = [number, number][][][];

/** Internal zone model before serialization to GeoJSON. */
export interface ConflictZone {
  id: string;
  type: "conflict_zone";
  centroid: { lat: number; lon: number };
  geometry:
    | { type: "Polygon"; coordinates: ConflictZonePolygonCoords }
    | { type: "MultiPolygon"; coordinates: ConflictZoneMultiPolygonCoords };
  timeWindow: ConflictZoneTimeWindow;
  intensity: number;
  severityLabel: ConflictZoneSeverityLabel;
  eventCount: number;
  topActors: string[];
  topLocations: string[];
  sources: ConflictZoneSourceInfo[];
  lastUpdated: number;
  prevIntensity?: number;
  trend?: "up" | "down" | "stable";
  docQuery?: string;
  docQueryUrl?: string;
  eventCountBySource?: Record<ConflictEventSource, number>;
}

/** Properties shape embedded in each polygon Feature returned by the API. */
export interface ConflictZoneFeatureProperties {
  type: "conflict_zone";
  zoneId: string;
  intensity: number;
  severityLabel: ConflictZoneSeverityLabel;
  timeWindow: ConflictZoneTimeWindow;
  eventCount: number;
  topActors: string[];
  topLocations: string[];
  sources: ConflictZoneSourceInfo[];
  lastUpdated: number;
  prevIntensity?: number;
  trend?: "up" | "down" | "stable";
  docQuery?: string;
  docQueryUrl?: string;
  centroidLat: number;
  centroidLon: number;
  eventCountBySource?: Record<ConflictEventSource, number>;
}

/**
 * Converts a ConflictZone to a LayerFeature for inclusion in a LayerFeatureCollection.
 * Uses the zone's geometry and embeds all display properties.
 */
export function conflictZoneToLayerFeature(zone: ConflictZone): LayerFeature {
  const props: Record<string, unknown> = {
    type: "conflict_zone",
    zoneId: zone.id,
    intensity: zone.intensity,
    severityLabel: zone.severityLabel,
    timeWindow: zone.timeWindow,
    eventCount: zone.eventCount,
    topActors: zone.topActors,
    topLocations: zone.topLocations,
    sources: zone.sources,
    lastUpdated: zone.lastUpdated,
    centroidLat: zone.centroid.lat,
    centroidLon: zone.centroid.lon,
  };

  if (zone.prevIntensity != null) props.prevIntensity = zone.prevIntensity;
  if (zone.trend != null) props.trend = zone.trend;
  if (zone.docQuery != null) props.docQuery = zone.docQuery;
  if (zone.docQueryUrl != null) props.docQueryUrl = zone.docQueryUrl;
  if (zone.eventCountBySource != null) props.eventCountBySource = zone.eventCountBySource;

  // LayerFeature expects Polygon; MultiPolygon is not in LayerGeometry.
  // For MultiPolygon zones, take the first polygon part as the main geometry.
  // The renderer/GeoJSON spec supports both; we normalize to what LayerGeometry supports.
  let geometry: LayerFeature["geometry"];
  if (zone.geometry.type === "Polygon") {
    geometry = {
      type: "Polygon",
      coordinates: zone.geometry.coordinates as [Array<[number, number]>],
    };
  } else {
    // MultiPolygon: use first polygon
    const first = zone.geometry.coordinates[0];
    if (!first || first.length < 3) {
      // Degenerate: fall back to centroid as tiny polygon
      const [lon, lat] = [zone.centroid.lon, zone.centroid.lat];
      const d = 0.001;
      geometry = {
        type: "Polygon",
        coordinates: [
          [
            [lon - d, lat - d],
            [lon + d, lat - d],
            [lon + d, lat + d],
            [lon - d, lat + d],
            [lon - d, lat - d],
          ],
        ],
      };
    } else {
      geometry = {
        type: "Polygon",
        coordinates: [first as [number, number][]],
      };
    }
  }

  return {
    id: zone.id,
    geometry,
    properties: props,
    ts: zone.lastUpdated,
  };
}

/**
 * Converts an array of ConflictZones to a LayerFeatureCollection.
 */
export function conflictZonesToFeatureCollection(zones: ConflictZone[]): LayerFeatureCollection {
  const features = zones.map(conflictZoneToLayerFeature);
  return {
    type: "FeatureCollection",
    features,
  };
}

/**
 * Extracts ConflictZoneFeatureProperties from a feature's properties.
 * Returns null if the feature is not a conflict zone.
 */
export function propsToConflictZoneDetail(
  properties: Record<string, unknown>
): ConflictZoneFeatureProperties | null {
  if (properties?.type !== "conflict_zone") return null;

  const topActors = Array.isArray(properties.topActors)
    ? (properties.topActors as string[])
    : [];
  const topLocations = Array.isArray(properties.topLocations)
    ? (properties.topLocations as string[])
    : [];
  const sources = Array.isArray(properties.sources)
    ? (properties.sources as ConflictZoneSourceInfo[])
    : [];

  return {
    type: "conflict_zone",
    zoneId: String(properties.zoneId ?? ""),
    intensity: Number(properties.intensity) || 0,
    severityLabel: (properties.severityLabel as ConflictZoneSeverityLabel) ?? "Low",
    timeWindow: (properties.timeWindow as ConflictZoneTimeWindow) ?? "7d",
    eventCount: Number(properties.eventCount) || 0,
    topActors,
    topLocations,
    sources,
    lastUpdated: Number(properties.lastUpdated) || Date.now(),
    centroidLat: Number(properties.centroidLat) || 0,
    centroidLon: Number(properties.centroidLon) || 0,
    prevIntensity:
      properties.prevIntensity != null ? Number(properties.prevIntensity) : undefined,
    trend: properties.trend as "up" | "down" | "stable" | undefined,
    docQuery: properties.docQuery as string | undefined,
    docQueryUrl: properties.docQueryUrl as string | undefined,
    eventCountBySource: properties.eventCountBySource as
      | Record<ConflictEventSource, number>
      | undefined,
  };
}
