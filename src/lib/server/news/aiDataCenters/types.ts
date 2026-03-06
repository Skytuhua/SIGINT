import type { LayerFeatureCollection } from "../../../newsLayers/types";

// ── Operator classification ──────────────────────────────────────────────────

export type OperatorType =
  | "hyperscaler"
  | "colocation"
  | "telecom"
  | "enterprise"
  | "government"
  | "research"
  | "unknown";

// ── Site-level record (individual data center / facility) ────────────────────

export interface AiDataCenterSite {
  id: string;                      // "wikidata-Q{QID}" or "osm-{type}-{id}"
  sourceId: string;                // raw QID or OSM element id
  sourceType: "wikidata" | "osm";
  name: string;
  operator: string;
  operatorType: OperatorType;
  lat: number;
  lon: number;
  country: string;
  countryIso2: string;
  admin1?: string;
  city?: string;
  evidenceTags: string[];          // e.g. ["wikidata:data_center", "osm:building=data_centre"]
  confidence: number;              // 0–100
  lastUpdated: number;
}

// ── Cluster-level record (merged group of nearby sites) ──────────────────────

export interface AiDataCenterCluster {
  id: string;                      // "cluster-{hash}"
  name: string;                    // e.g. "Northern Virginia (Ashburn) Cluster"
  centroidLat: number;
  centroidLon: number;
  country: string;
  countryIso2: string;
  admin1?: string;
  operators: string[];
  operatorTypes: OperatorType[];
  siteCount: number;
  /** First 20 sites serialized for the detail card */
  sites: AiDataCenterSiteSummary[];
  confidence: number;              // 0–100 (max of constituent sites)
  importance: number;              // 0–100
  importanceBreakdown: AiDataCenterImportanceBreakdown;
  notes: string;
  sourceTrace: AiDataCenterSourceTrace;
  lastUpdated: number;
}

export interface AiDataCenterSiteSummary {
  name: string;
  operator: string;
  sourceType: "wikidata" | "osm";
  sourceId: string;
}

export interface AiDataCenterImportanceBreakdown {
  operatorDiversity: number;       // 0–100
  hyperscalerPresence: number;     // 0–100
  siteScale: number;               // 0–100 (log-scaled siteCount)
  regionWeight: number;            // 0–100
}

export interface AiDataCenterSourceTrace {
  wikidataQids: string[];
  osmIds: string[];
  overpassQuery: string;
  lastUpdated: {
    wikidata: number;
    overpass: number;
  };
}

// ── Source health ────────────────────────────────────────────────────────────

export type AiDataCenterSourceKey = "wikidata" | "overpass";
export type AiDataCenterSourceStatusCode = "live" | "cached" | "degraded" | "unavailable";

export interface AiDataCenterSourceStatus {
  status: AiDataCenterSourceStatusCode;
  lastUpdated: number | null;
  errorCode: string | null;
}

export type AiDataCenterSourceStatusMap = Record<
  AiDataCenterSourceKey,
  AiDataCenterSourceStatus
>;

// ── Layer result ─────────────────────────────────────────────────────────────

export interface AiDataCenterLayerResult {
  collection: LayerFeatureCollection;
  sourceStatus: AiDataCenterSourceStatusMap;
}

// ── Wikidata SPARQL raw types ────────────────────────────────────────────────

export type WikidataBinding = Record<string, { type: string; value: string } | undefined>;

export interface WikidataSparqlResponse {
  results?: { bindings?: WikidataBinding[] };
}

// ── OSM Overpass raw types ───────────────────────────────────────────────────

export interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  elements?: OverpassElement[];
}
