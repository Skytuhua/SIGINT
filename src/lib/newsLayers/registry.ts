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
      adapter: "route",
      routePath: `/api/news/layers/${id}`,
      refreshMs,
      jitterPct: 0.12,
      maxRetries: 2,
      timeoutMs: 20_000,
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
  routeLayer("conflict-zones",   "Conflict Zones",   "⚔",  "geojsonPoints", 11, 120_000,           "security",       DEFAULT_POINT_STYLE, 1500, true),
  snapshotLayer("military-bases","Military Bases",   "🏛",  "geojsonPoints", 12,                    "security"),
  snapshotLayer("nuclear-sites", "Nuclear Sites",    "☢",  "geojsonPoints", 13,                    "security"),
  snapshotLayer("gamma-irradiators","Gamma Irradiators","☢","geojsonPoints",14,                    "industry"),
  snapshotLayer("spaceports",    "Spaceports",       "🚀", "geojsonPoints", 15,                    "space"),

  // ── Infrastructure ────────────────────────────────────────────────────────
  snapshotLayer("undersea-cables","Undersea Cables", "🔌", "geojsonLines",  20,                    "infrastructure", DEFAULT_LINE_STYLE, 3000),
  snapshotLayer("pipelines",     "Pipelines",        "🛢",  "geojsonLines",  21,                    "energy",         { ...DEFAULT_LINE_STYLE, lineColor: "#d58a46" }, 2400),
  snapshotLayer("ai-data-centers","AI Data Centers", "💻", "geojsonPoints", 22,                    "technology"),

  // ── Military / Mobility ───────────────────────────────────────────────────
  routeLayer("military-activity","Military Activity","✈",  "dynamicEntities",23, 20_000,            "security",       { ...DEFAULT_POINT_STYLE, pointColor: "#ff8f6b" }, 4000, true),
  snapshotLayer("trade-routes",  "Trade Routes",     "🚢", "geojsonLines",  24,                    "economy",        { ...DEFAULT_LINE_STYLE, lineColor: "#7f9fbe" }, 2000),
  routeLayer("flight-delays",    "Flight Delays",    "🛫", "geojsonPoints", 25, 120_000,           "mobility"),

  // ── Society / Conflict ────────────────────────────────────────────────────
  routeLayer("protests",         "Protests",         "📢", "geojsonPoints", 26, 120_000,           "society"),
  routeLayer("ucdp-events",      "UCDP Events",      "📌", "geojsonPoints", 27, 6 * 60 * 60_000,  "security"),
  snapshotLayer("displacement-flows","Displacement Flows","→","geojsonLines", 28,                  "humanitarian",   { ...DEFAULT_LINE_STYLE, lineColor: "#bfd7ef" }, 1500),

  // ── Climate / Environment ─────────────────────────────────────────────────
  {
    ...routeLayer("climate-anomalies","Climate Anomalies","🌡","rasterTiles",  30, 6 * 60 * 60_000,"climate",        {
      rasterAlpha: 0.45,
      rasterUrlTemplate: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_Land_Surface_Temp_Day/default/{Time}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png",
    }, 1),
    minZoom: 1,
  },
  routeLayer("weather-alerts",   "Weather Alerts",   "⚠",  "geojsonPolygons",31, 180_000,          "climate",        DEFAULT_POLY_STYLE, 1400, true),
  routeLayer("natural-events",   "Natural Events",   "🌋", "geojsonPoints", 32, 300_000,           "climate"),
  routeLayer("fires",            "Fires",            "🔥", "geojsonPoints", 33, 180_000,           "climate",        { ...DEFAULT_POINT_STYLE, pointColor: "#ff5a5f" }, 1800),

  // ── Maritime / Economy ────────────────────────────────────────────────────
  snapshotLayer("strategic-waterways","Strategic Waterways","🌊","geojsonLines",34,                "maritime",       DEFAULT_LINE_STYLE, 1000),
  snapshotLayer("economic-centers","Economic Centers","💰", "geojsonPoints", 35,                    "economy"),
  snapshotLayer("critical-minerals","Critical Minerals","⛏","geojsonPoints", 36,                   "resources"),

  // ── Geo / Hazards ─────────────────────────────────────────────────────────
  routeLayer("earthquakes-live", "Earthquakes",      "📳", "geojsonPoints", 37, 120_000,           "climate"),
  snapshotLayer("volcanoes",     "Volcanoes",        "🌋", "geojsonPoints", 38,                    "climate"),
  snapshotLayer("ports",         "Ports",            "⚓", "geojsonPoints", 39,                    "maritime"),
  snapshotLayer("internet-exchanges","Internet Exchanges","🌐","geojsonPoints",40,                  "technology"),

  // ── Additional layers ─────────────────────────────────────────────────────
  routeLayer("disaster-alerts",  "Disaster Alerts",  "🆘", "geojsonPoints", 41, 5 * 60_000,       "climate",        { ...DEFAULT_POINT_STYLE, pointColor: "#ff4500" }, 500, true),
  routeLayer("piracy-incidents", "Piracy Incidents", "☠",  "geojsonPoints", 42, 2 * 60 * 60_000, "maritime",       DEFAULT_POINT_STYLE, 400),
  routeLayer("space-launches",   "Space Launches",   "🛸", "geojsonPoints", 43, 60 * 60_000,      "space",          { ...DEFAULT_POINT_STYLE, pointColor: "#00e5ff" }, 200),
  routeLayer("cyber-incidents",  "Cyber Incidents",  "💀", "geojsonPoints", 44, 2 * 60_000,       "technology",     { ...DEFAULT_POINT_STYLE, pointColor: "#36b37e" }, 600),
  routeLayer("election-events",  "Election Events",  "🗳",  "geojsonPoints", 45, 2 * 60 * 60_000, "society",        { ...DEFAULT_POINT_STYLE, pointColor: "#bfd7ef" }, 400),
  routeLayer("disease-outbreaks","Disease Outbreaks","🦠", "geojsonPoints", 46, 60 * 60_000,      "humanitarian",   { ...DEFAULT_POINT_STYLE, pointColor: "#ff8f6b" }, 400),
  snapshotLayer("sanctions-entities","Sanctions Entities","🚫","geojsonPoints",47,                 "security",       { ...DEFAULT_POINT_STYLE, pointColor: "#ea80fc" }, 800),
  snapshotLayer("radiation-stations","Radiation Stations","☢","geojsonPoints",48,                  "industry",       { ...DEFAULT_POINT_STYLE, pointColor: "#f4d03f" }, 600),
  snapshotLayer("maritime-chokepoints","Maritime Chokepoints","⚓","geojsonPoints",49,             "maritime",       { ...DEFAULT_POINT_STYLE, pointColor: "#20d2ff" }, 30),
  snapshotLayer("refugee-camps", "Refugee Camps",    "🏕", "geojsonPoints", 50,                    "humanitarian",   { ...DEFAULT_POINT_STYLE, pointColor: "#ff8f6b" }, 400),
  snapshotLayer("water-stress-zones","Water Stress Zones","💧","geojsonPolygons",51,               "climate",        DEFAULT_POLY_STYLE, 200),
  snapshotLayer("arms-embargo-zones","Arms Embargo Zones","⛔","geojsonPolygons",52,               "security",       { ...DEFAULT_POLY_STYLE, polygonFill: "#ea80fc33" }, 60),
];

export const NEWS_LAYER_DEFAULT_TOGGLES = Object.fromEntries(
  NEWS_LAYER_REGISTRY.map((entry) => [entry.id, entry.defaultEnabled])
) as Record<string, boolean>;

export const NEWS_LAYER_REGISTRY_BY_ID = new Map(NEWS_LAYER_REGISTRY.map((entry) => [entry.id, entry]));
