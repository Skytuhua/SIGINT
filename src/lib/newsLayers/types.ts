export type NewsLayerRenderType =
  | "rasterTiles"
  | "geojsonPoints"
  | "geojsonLines"
  | "geojsonPolygons"
  | "heatmap"
  | "dynamicEntities";

export type LayerHealthStatus = "live" | "cached" | "degraded" | "unavailable";

export interface LayerGeometryPoint {
  type: "Point";
  coordinates: [number, number];
}

export interface LayerGeometryLineString {
  type: "LineString";
  coordinates: [number, number][];
}

export interface LayerGeometryPolygon {
  type: "Polygon";
  coordinates: [Array<[number, number]>];
}

export type LayerGeometry = LayerGeometryPoint | LayerGeometryLineString | LayerGeometryPolygon;

export interface LayerFeature {
  id: string;
  geometry: LayerGeometry;
  properties: Record<string, unknown>;
  ts: number;
}

export interface LayerFeatureCollection {
  type: "FeatureCollection";
  features: LayerFeature[];
}

export interface LayerHealthState {
  status: LayerHealthStatus;
  lastSuccessAt: number | null;
  lastError: string | null;
  nextRetryAt: number | null;
  consecutiveFailures: number;
}

export type LayerAdapterType = "route" | "snapshot" | "wmtsRaster" | "derived";

export interface LayerDataSourceConfig {
  adapter: LayerAdapterType;
  routePath?: string;
  snapshotPath?: string;
  url?: string;
  urls?: string[];
  parser?: string;
  refreshMs: number;
  jitterPct?: number;
  maxRetries?: number;
  timeoutMs?: number;
  cacheKey: string;
  cacheTtlMs: number;
  staleTtlMs: number;
}

export interface LayerRenderStyle {
  pointColor?: string;
  pointPixelSize?: number;
  pointStrokeColor?: string;
  pointStrokeWidth?: number;
  lineColor?: string;
  lineWidth?: number;
  polygonFill?: string;
  polygonOutline?: string;
  labelField?: string;
  labelColor?: string;
  labelMinZoom?: number;
  clusterPixels?: number;
  clusterMinSize?: number;
  rasterAlpha?: number;
  rasterUrlTemplate?: string;
}

export interface LayerPerformancePolicy {
  maxFeatures: number;
  simplifyTolerance?: number;
  clusterAtZoomLessThan?: number;
  aggregateAtZoomLessThan?: number;
}

export interface LayerRegistryEntry {
  id: string;
  label: string;
  icon: string;
  category: string;
  defaultEnabled: boolean;
  type: NewsLayerRenderType;
  stackOrder: number;
  minZoom?: number;
  maxZoom?: number;
  minCameraHeight?: number;
  maxCameraHeight?: number;
  dataSource: LayerDataSourceConfig;
  style: LayerRenderStyle;
  performance: LayerPerformancePolicy;
}

export interface LayerPipelineResult {
  data: LayerFeatureCollection | null;
  health: LayerHealthState;
  cacheHit: boolean;
}
