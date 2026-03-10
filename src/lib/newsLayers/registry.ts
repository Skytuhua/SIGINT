import type { LayerRegistryEntry } from "./types";

const DEFAULT_POINT_STYLE = {
  pointColor: "#f4d03f",
  pointPixelSize: 6,
  pointStrokeColor: "#17202a",
  pointStrokeWidth: 1,
  clusterPixels: 48,
  clusterMinSize: 3,
};

const DEFAULT_LINE_STYLE = {
  lineColor: "#5c8cb5",
  lineWidth: 1.2,
};

const DEFAULT_POLY_STYLE = {
  polygonFill: "#5c8cb533",
  polygonOutline: "#8db3d8",
};

function routeLayer(
  id: string,
  label: string,
  icon: string,
  type: LayerRegistryEntry["type"],
  stackOrder: number,
  refreshMs: number,
  category = "intel",
  style: LayerRegistryEntry["style"] = DEFAULT_POINT_STYLE,
  maxFeatures = 1200,
  defaultEnabled = false,
  timeoutMs = 20_000
): LayerRegistryEntry {
  return {
    id,
    label,
    icon,
    category,
    defaultEnabled,
    type,
    stackOrder,
    dataSource: {
      adapter: "route",
      routePath: `/api/news/layers/${id}`,
      refreshMs,
      jitterPct: 0.12,
      maxRetries: 2,
      timeoutMs,
      cacheKey: `news-layer:${id}`,
      cacheTtlMs: Math.max(60_000, Math.round(refreshMs * 0.75)),
      staleTtlMs: 24 * 60 * 60_000,
    },
    style,
    performance: {
      maxFeatures,
      simplifyTolerance: 0.01,
      clusterAtZoomLessThan: 3,
      aggregateAtZoomLessThan: 2,
    },
  };
}

function snapshotLayer(
  id: string,
  label: string,
  icon: string,
  type: LayerRegistryEntry["type"],
  stackOrder: number,
  category = "intel",
  style: LayerRegistryEntry["style"] = DEFAULT_POINT_STYLE,
  maxFeatures = 1500,
  defaultEnabled = false
): LayerRegistryEntry {
  return {
    id,
    label,
    icon,
    category,
    defaultEnabled,
    type,
    stackOrder,
    dataSource: {
      adapter: "snapshot",
      snapshotPath: `/data/news-layers/${id}.geojson`,
      refreshMs: 24 * 60 * 60_000,
      jitterPct: 0.05,
      maxRetries: 1,
      timeoutMs: 15_000,
      cacheKey: `news-layer:${id}`,
      cacheTtlMs: 12 * 60 * 60_000,
      staleTtlMs: 7 * 24 * 60 * 60_000,
    },
    style,
    performance: {
      maxFeatures,
      simplifyTolerance: 0.02,
      clusterAtZoomLessThan: 3,
      aggregateAtZoomLessThan: 2,
    },
  };
}

export const NEWS_LAYER_REGISTRY: LayerRegistryEntry[] = [
  // ── Intel / Security ──────────────────────────────────────────────────────
  routeLayer("intel-hotspots",   "Intel Hotspots",   "🎯", "geojsonPoints", 10, 90_000,            "intel",          DEFAULT_POINT_STYLE, 1500, true),
  routeLayer("conflict-zones",   "Conflict Zones",   "⚔",  "geojsonPolygons", 11, 120_000, "security", { ...DEFAULT_POLY_STYLE, polygonFill: "#e74c3c33", polygonOutline: "#c0392b", badgeProperty: "severityLabel" }, 200),
  snapshotLayer("military-bases","Military Bases",   "🏛",  "geojsonPoints", 12,                    "security", { ...DEFAULT_POINT_STYLE, pointColor: "#4a90d9", pointPixelSize: 7, pointStrokeWidth: 2, pointStrokeColor: "#1a3a5c" }),
  snapshotLayer("nuclear-sites", "Nuclear Sites",    "☢",  "geojsonPoints", 13,                    "security", { ...DEFAULT_POINT_STYLE, pointStrokeWidth: 2, pointStrokeColor: "#ffd700" }),

  // ── Infrastructure ────────────────────────────────────────────────────────
  routeLayer("ai-data-centers", "AI Data Centers", "💻", "geojsonPoints", 22, 4 * 60 * 60_000, "technology", { ...DEFAULT_POINT_STYLE, pointColor: "#7c4dff", pointPixelSize: 7 }, 500, false, 30_000),
  // ── Military / Mobility ───────────────────────────────────────────────────
  routeLayer("military-activity","Military Activity","✈",  "dynamicEntities",23, 20_000,            "security",       { ...DEFAULT_POINT_STYLE, pointColor: "#ff6b35", pointStrokeWidth: 1.5, pointStrokeColor: "#cc4400" }, 4000, true),
  snapshotLayer("trade-routes",  "Trade Routes",     "🚢", "geojsonLines",  24,                    "economy",        { ...DEFAULT_LINE_STYLE, lineColor: "#4fc3f7" }, 2000),
  snapshotLayer("trade-route-nodes","Trade Route Nodes","⚓","geojsonPoints", 24.5,                  "economy",        { ...DEFAULT_POINT_STYLE, pointColor: "#4fc3f7" }, 200),


  // ── Society / Conflict ────────────────────────────────────────────────────
  routeLayer("armed-conflict",   "Armed Conflict",   "💥", "geojsonPoints", 25.5, 120_000,         "security",       { ...DEFAULT_POINT_STYLE, pointColor: "#ff5a5f" }, 800),
  routeLayer("ucdp-events",      "UCDP Events",      "📌", "geojsonPoints", 27, 6 * 60 * 60_000,  "security", { ...DEFAULT_POINT_STYLE, pointColor: "#b455e0", pointStrokeWidth: 1.5, pointStrokeColor: "#7b2d9e" }, 5000, false, 90_000),

  // ── Maritime / Economy ────────────────────────────────────────────────────
  routeLayer("economic-centers","Economic Centers","💰","geojsonPoints",35, 4*60*60_000, "economy", { pointColor:"#f4a261", pointPixelSize:7, pointStrokeColor:"#17202a", pointStrokeWidth:1, clusterPixels:48, clusterMinSize:3 }, 300, false, 30_000),
  snapshotLayer("critical-minerals","Critical Minerals","⛏","geojsonPoints", 36,                   "resources",        { pointColor: "#f59e0b", pointPixelSize: 7, pointStrokeColor: "#17202a", pointStrokeWidth: 1, clusterPixels: 48, clusterMinSize: 3 }),

  // ── Geo / Hazards ─────────────────────────────────────────────────────────
  snapshotLayer("internet-exchanges","Internet Exchanges","🌐","geojsonPoints",40,                  "technology"),

  // ── Additional layers ─────────────────────────────────────────────────────
  routeLayer("cyber-incidents",  "Cyber Incidents",  "💀", "geojsonPoints", 44, 2 * 60_000,       "technology",     { ...DEFAULT_POINT_STYLE, pointColor: "#36b37e" }, 600),
  routeLayer("sanctions-entities","Sanctions Entities","🚫","geojsonPoints",47, 24 * 60 * 60_000, "compliance",     { ...DEFAULT_POINT_STYLE, pointColor: "#ea80fc" }, 10000),

  // ── Security (additional) ───────────────────────────────────────────────
  snapshotLayer("refugee-camps",  "Refugee Camps",     "🏕", "geojsonPoints", 26,                  "security",       { ...DEFAULT_POINT_STYLE, pointColor: "#ff7043", pointPixelSize: 7, pointStrokeColor: "#bf360c", pointStrokeWidth: 1.5, clusterPixels: 48, clusterMinSize: 3 }),

  // ── Economy (additional) ────────────────────────────────────────────────
  snapshotLayer("ports",              "Ports",               "🚢", "geojsonPoints", 37,             "economy",        { ...DEFAULT_POINT_STYLE, pointColor: "#26c6da", pointPixelSize: 6, pointStrokeColor: "#006064", pointStrokeWidth: 1, clusterPixels: 48, clusterMinSize: 3 }),
  snapshotLayer("maritime-chokepoints","Maritime Chokepoints","⚠",  "geojsonPoints", 38,             "economy",        { ...DEFAULT_POINT_STYLE, pointColor: "#ff5252", pointPixelSize: 8, pointStrokeColor: "#ffffff", pointStrokeWidth: 2, clusterPixels: 48, clusterMinSize: 3 }),

  // ── Resources (additional) ──────────────────────────────────────────────
  snapshotLayer("water-stress-zones","Water Stress Zones","💧","geojsonPolygons", 36.5,             "resources",      { ...DEFAULT_POLY_STYLE, polygonFill: "#1565c044", polygonOutline: "#42a5f5" }),

  // ── Compliance (additional) ─────────────────────────────────────────────
  snapshotLayer("arms-embargo-zones","Arms Embargo Zones","🛑","geojsonPolygons", 48,               "compliance",     { ...DEFAULT_POLY_STYLE, polygonFill: "#d32f2f33", polygonOutline: "#ef5350" }),

  // ── Technology (additional) ─────────────────────────────────────────────
  snapshotLayer("spaceports",     "Spaceports",       "🚀", "geojsonPoints", 41,                   "technology",     { ...DEFAULT_POINT_STYLE, pointColor: "#00e5ff", pointPixelSize: 7, pointStrokeColor: "#006064", pointStrokeWidth: 1.5, clusterPixels: 48, clusterMinSize: 3 }),

  // ── Natural Hazards ─────────────────────────────────────────────────────
  snapshotLayer("volcanoes",      "Volcanoes",        "🌋", "geojsonPoints", 50,                   "natural hazards", { ...DEFAULT_POINT_STYLE, pointColor: "#ff3d00", pointPixelSize: 7, pointStrokeColor: "#bf360c", pointStrokeWidth: 1.5, clusterPixels: 48, clusterMinSize: 3 }),
  routeLayer("earthquakes",       "Earthquakes",      "🌍", "geojsonPoints", 51, 60_000,           "natural hazards", { ...DEFAULT_POINT_STYLE, pointColor: "#ffd600", pointPixelSize: 6, pointStrokeColor: "#f57f17", pointStrokeWidth: 1.5, clusterPixels: 48, clusterMinSize: 3 }, 1500),
  routeLayer("disaster-alerts",   "Disaster Alerts",  "⚡", "geojsonPoints", 52, 6 * 60_000,       "natural hazards", { ...DEFAULT_POINT_STYLE, pointColor: "#ff6d00", pointPixelSize: 8, pointStrokeColor: "#e65100", pointStrokeWidth: 2, clusterPixels: 48, clusterMinSize: 3 }, 200),
];

export const NEWS_LAYER_DEFAULT_TOGGLES = Object.fromEntries(
  NEWS_LAYER_REGISTRY.map((entry) => [entry.id, entry.defaultEnabled])
) as Record<string, boolean>;

export const NEWS_LAYER_REGISTRY_BY_ID = new Map(NEWS_LAYER_REGISTRY.map((entry) => [entry.id, entry]));
