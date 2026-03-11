import type { LayerFeatureCollection, LayerRegistryEntry } from "../types";
import type { LayerRenderer } from "./rendererTypes";

interface MapLike {
  addSource: (id: string, source: unknown) => void;
  getSource: (id: string) => { setData?: (data: unknown) => void } | undefined;
  removeSource: (id: string) => void;
  addLayer: (layer: unknown, beforeId?: string) => void;
  getLayer: (id: string) => unknown;
  moveLayer: (id: string, beforeId?: string) => void;
  setLayoutProperty: (id: string, name: string, value: unknown) => void;
  removeLayer: (id: string) => void;
}

function isMapLike(map: unknown): map is MapLike {
  if (!map || typeof map !== "object") return false;
  const candidate = map as Partial<MapLike>;
  return (
    typeof candidate.getLayer === "function" &&
    typeof candidate.getSource === "function" &&
    typeof candidate.addLayer === "function" &&
    typeof candidate.addSource === "function"
  );
}

function sourceId(layerId: string): string {
  return `si-news-src-${layerId}`;
}

function layerIds(layer: LayerRegistryEntry): string[] {
  const base = `si-news-layer-${layer.id}`;
  if (layer.id === "trade-routes") {
    return [`${base}-glow`, `${base}-line`, `${base}-label`];
  }
  if (layer.id === "trade-route-nodes") {
    return [`${base}-hub`, `${base}-choke`, `${base}-label`];
  }
  if (layer.type === "geojsonPolygons") {
    const ids = [`${base}-fill`, `${base}-line`];
    if (layer.style.badgeProperty) ids.push(`${base}-badge`);
    return ids;
  }
  if (layer.id === "ai-data-centers") return [`${base}-halo`, `${base}-circle`, `${base}-label`, `${base}-cluster`, `${base}-cluster-count`];
  if (layer.id === "economic-centers") return [`${base}-halo`, `${base}-circle`, `${base}-cluster`, `${base}-cluster-count`];
  // Security layers with distinct visual treatments
  if (layer.id === "military-bases") return [`${base}-circle`, `${base}-label`, `${base}-cluster`, `${base}-cluster-count`];
  if (layer.id === "nuclear-sites") return [`${base}-halo`, `${base}-circle`, `${base}-label`, `${base}-cluster`, `${base}-cluster-count`];
  if (layer.id === "military-activity") return [`${base}-halo`, `${base}-circle`, `${base}-cluster`, `${base}-cluster-count`];
  if (layer.id === "armed-conflict") return [`${base}-halo`, `${base}-circle`, `${base}-cluster`, `${base}-cluster-count`];
  if (layer.id === "refugee-camps") return [`${base}-circle`, `${base}-label`, `${base}-cluster`, `${base}-cluster-count`];
  if (layer.id === "ucdp-events") return [`${base}-ring`, `${base}-circle`, `${base}-cluster`, `${base}-cluster-count`];
  if (layer.type === "geojsonPoints" || layer.type === "dynamicEntities") return [`${base}-circle`, `${base}-cluster`, `${base}-cluster-count`];
  return [base];
}

/** Cache converted GeoJSON by input reference to skip redundant .map() allocations. */
const _geoJsonCache = new WeakMap<LayerFeatureCollection, GeoJSON.FeatureCollection>();

function toGeoJson(data: LayerFeatureCollection): GeoJSON.FeatureCollection {
  const cached = _geoJsonCache.get(data);
  if (cached) return cached;
  const result = {
    type: "FeatureCollection",
    features: data.features.map((f) => ({
      type: "Feature",
      id: f.id,
      geometry: {
        type: f.geometry.type,
        coordinates: f.geometry.coordinates as unknown as number[] | number[][] | number[][][],
      },
      properties: { ...f.properties, ts: f.ts },
    })),
  } as unknown as GeoJSON.FeatureCollection;
  _geoJsonCache.set(data, result);
  return result;
}

function removeLayerSafe(map: MapLike, id: string): void {
  if (map.getLayer(id)) map.removeLayer(id);
}

function ensureRasterLayer(layer: LayerRegistryEntry, map: MapLike): void {
  const srcId = sourceId(layer.id);
  const ids = layerIds(layer);
  if (!map.getSource(srcId)) {
    map.addSource(srcId, {
      type: "raster",
      tiles: [layer.style.rasterUrlTemplate],
      tileSize: 256,
    });
  }
  if (!map.getLayer(ids[0])) {
    map.addLayer({
      id: ids[0],
      type: "raster",
      source: srcId,
      paint: { "raster-opacity": layer.style.rasterAlpha ?? 0.45 },
    });
  }
}

function ensureGeoJsonLayer(layer: LayerRegistryEntry, map: MapLike): void {
  const srcId = sourceId(layer.id);
  const ids = layerIds(layer);
  if (!map.getSource(srcId)) {
    const clusterEnabled =
      (layer.type === "geojsonPoints" || layer.type === "dynamicEntities") &&
      (layer.performance.clusterAtZoomLessThan ?? 3) > 0;
    map.addSource(srcId, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      cluster: clusterEnabled,
      clusterRadius: layer.style.clusterPixels ?? 48,
      clusterMaxZoom: Math.max(0, (layer.performance.clusterAtZoomLessThan ?? 3) + 1),
    });
  }

  if (layer.id === "trade-routes") {
    ensureTradeRouteLayers(layer, map);
    return;
  }

  if (layer.id === "trade-route-nodes") {
    ensureTradeRouteNodeLayers(layer, map);
    return;
  }

  if (layer.id === "ai-data-centers") {
    ensureAiDataCenterLayers(layer, map);
    return;
  }

  if (layer.id === "economic-centers") {
    ensureEconomicCenterLayers(layer, map);
    return;
  }

  // Security layers with distinct visual treatments
  if (layer.id === "military-bases") { ensureMilitaryBaseLayers(layer, map); return; }
  if (layer.id === "nuclear-sites") { ensureNuclearSiteLayers(layer, map); return; }
  if (layer.id === "military-activity") { ensureMilitaryActivityLayers(layer, map); return; }
  if (layer.id === "armed-conflict") { ensureArmedConflictLayers(layer, map); return; }
  if (layer.id === "refugee-camps") { ensureRefugeeCampLayers(layer, map); return; }
  if (layer.id === "ucdp-events") { ensureUcdpEventLayers(layer, map); return; }

  if (layer.type === "geojsonLines" && !map.getLayer(ids[0])) {
    map.addLayer({
      id: ids[0],
      type: "line",
      source: srcId,
      paint: {
        "line-color": layer.style.lineColor ?? "#5c8cb5",
        "line-width": layer.style.lineWidth ?? 1.2,
      },
    });
    return;
  }

  if (layer.type === "geojsonPolygons") {
    if (!map.getLayer(ids[0])) {
      map.addLayer({
        id: ids[0],
        type: "fill",
        source: srcId,
        paint: {
          "fill-color": layer.style.polygonFill ?? "#5c8cb533",
          "fill-opacity": 0.35,
        },
      });
    }
    if (!map.getLayer(ids[1])) {
      map.addLayer({
        id: ids[1],
        type: "line",
        source: srcId,
        paint: {
          "line-color": layer.style.polygonOutline ?? "#8db3d8",
          "line-width": layer.style.lineWidth ?? 1,
        },
      });
    }
    const badgeProp = layer.style.badgeProperty;
    const badgeId = `si-news-layer-${layer.id}-badge`;
    if (badgeProp && !map.getLayer(badgeId)) {
      map.addLayer({
        id: badgeId,
        type: "symbol",
        source: srcId,
        filter: [">", ["coalesce", ["get", badgeProp], 0], 1],
        layout: {
          "text-field": ["concat", ["get", badgeProp], ""],
          "text-size": 11,
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#000000",
          "text-halo-width": 1.2,
        },
      });
    }
    return;
  }

  if (layer.type === "heatmap") {
    if (!map.getLayer(ids[0])) {
      map.addLayer({
        id: ids[0],
        type: "heatmap",
        source: srcId,
      });
    }
    return;
  }

  // Generic point layer (non-security layers that don't have dedicated renderers)
  if (!map.getLayer(ids[0])) {
    map.addLayer({
      id: ids[0],
      type: "circle",
      source: srcId,
      filter: ["!=", ["get", "cluster"], true],
      paint: {
        "circle-color": layer.style.pointColor ?? "#f4d03f",
        "circle-radius": layer.style.pointPixelSize ?? 5,
        "circle-stroke-width": layer.style.pointStrokeWidth ?? 1,
        "circle-stroke-color": layer.style.pointStrokeColor ?? "#17202a",
      },
    });
  }

  const shouldRenderClusters = (layer.performance.clusterAtZoomLessThan ?? 3) > 0;

  if (shouldRenderClusters && !map.getLayer(ids[1])) {
    map.addLayer({
      id: ids[1],
      type: "circle",
      source: srcId,
      filter: ["==", ["get", "cluster"], true],
      paint: {
        "circle-color": "#f4d03f",
        "circle-radius": ["step", ["get", "point_count"], 8, 10, 11, 25, 15],
      },
    });
  }

  if (shouldRenderClusters && !map.getLayer(ids[2])) {
    map.addLayer({
      id: ids[2],
      type: "symbol",
      source: srcId,
      filter: ["==", ["get", "cluster"], true],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-size": 10,
      },
      paint: {
        "text-color": "#000000",
      },
    });
  }
}

/* ── Military Bases: solid institutional markers with labels ──────────── */

function ensureMilitaryBaseLayers(layer: LayerRegistryEntry, map: MapLike): void {
  const srcId = sourceId(layer.id);
  const ids = layerIds(layer); // [circle, label, cluster, cluster-count]

  // Main circle — crisp blue square-feel with thick dark stroke
  if (!map.getLayer(ids[0])) {
    map.addLayer({
      id: ids[0],
      type: "circle",
      source: srcId,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": "#4a90d9",
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 5, 4, 7, 8, 9],
        "circle-opacity": 0.9,
        "circle-stroke-width": 2.5,
        "circle-stroke-color": "#1a3a5c",
      },
    });
  }

  // Label (zoom ≥ 5)
  if (!map.getLayer(ids[1])) {
    map.addLayer({
      id: ids[1],
      type: "symbol",
      source: srcId,
      filter: ["!", ["has", "point_count"]],
      minzoom: 5,
      layout: {
        "text-field": ["get", "name"],
        "text-size": 10,
        "text-offset": [0, 1.4],
        "text-anchor": "top",
        "text-max-width": 10,
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      },
      paint: {
        "text-color": "#a0c4e8",
        "text-halo-color": "#000000",
        "text-halo-width": 1,
      },
    });
  }

  // Cluster bubble
  if (!map.getLayer(ids[2])) {
    map.addLayer({
      id: ids[2],
      type: "circle",
      source: srcId,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#4a90d9",
        "circle-radius": ["step", ["get", "point_count"], 8, 10, 11, 25, 15],
        "circle-opacity": 0.85,
      },
    });
  }

  // Cluster count
  if (!map.getLayer(ids[3])) {
    map.addLayer({
      id: ids[3],
      type: "symbol",
      source: srcId,
      filter: ["has", "point_count"],
      layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 10 },
      paint: { "text-color": "#ffffff" },
    });
  }
}

/* ── Nuclear Sites: hazard halo with status-colored core ─────────────── */

const NUCLEAR_STATUS_COLOR = [
  "match",
  ["coalesce", ["get", "status"], ""],
  "Operating",          "#8bc34a",
  "Under Construction", "#ffc107",
  "Planned",            "#90caf9",
  "Decommissioning",    "#ffb74d",
  "Retired",            "#b0bec5",
  /* default */         "#f4d03f",
];

function ensureNuclearSiteLayers(layer: LayerRegistryEntry, map: MapLike): void {
  const srcId = sourceId(layer.id);
  const ids = layerIds(layer); // [halo, circle, label, cluster, cluster-count]

  // Hazard halo — pulsing ring, color by status
  if (!map.getLayer(ids[0])) {
    map.addLayer({
      id: ids[0],
      type: "circle",
      source: srcId,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": NUCLEAR_STATUS_COLOR,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 12, 4, 16, 8, 22],
        "circle-opacity": 0.15,
        "circle-blur": 0.8,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": NUCLEAR_STATUS_COLOR,
        "circle-stroke-opacity": 0.3,
      },
    });
  }

  // Core circle — status-colored with gold stroke
  if (!map.getLayer(ids[1])) {
    map.addLayer({
      id: ids[1],
      type: "circle",
      source: srcId,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": NUCLEAR_STATUS_COLOR,
        "circle-radius": [
          "case",
          ["any", ["==", ["get", "type"], "Nuclear Power Plant"], ["==", ["get", "type"], "Research Reactor"]],
          7, 5,
        ],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffd700",
      },
    });
  }

  // Label (zoom ≥ 5)
  if (!map.getLayer(ids[2])) {
    map.addLayer({
      id: ids[2],
      type: "symbol",
      source: srcId,
      filter: ["!", ["has", "point_count"]],
      minzoom: 5,
      layout: {
        "text-field": ["concat", ["get", "name"], "\n", ["coalesce", ["get", "status"], ""]],
        "text-size": 9,
        "text-offset": [0, 1.6],
        "text-anchor": "top",
        "text-max-width": 10,
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      },
      paint: {
        "text-color": "#fff9c4",
        "text-halo-color": "#000000",
        "text-halo-width": 1,
      },
    });
  }

  // Cluster bubble
  if (!map.getLayer(ids[3])) {
    map.addLayer({
      id: ids[3],
      type: "circle",
      source: srcId,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#ffd700",
        "circle-radius": ["step", ["get", "point_count"], 8, 10, 11, 25, 15],
        "circle-opacity": 0.85,
      },
    });
  }

  // Cluster count
  if (!map.getLayer(ids[4])) {
    map.addLayer({
      id: ids[4],
      type: "symbol",
      source: srcId,
      filter: ["has", "point_count"],
      layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 10 },
      paint: { "text-color": "#000000" },
    });
  }
}

/* ── Military Activity: radar blip — soft glow + small bright dot ────── */

function ensureMilitaryActivityLayers(layer: LayerRegistryEntry, map: MapLike): void {
  const srcId = sourceId(layer.id);
  const ids = layerIds(layer); // [halo, circle, cluster, cluster-count]

  // Radar glow — wide, soft, orange
  if (!map.getLayer(ids[0])) {
    map.addLayer({
      id: ids[0],
      type: "circle",
      source: srcId,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": "#ff6b35",
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 10, 4, 16, 8, 22],
        "circle-opacity": 0.12,
        "circle-blur": 1.0,
        "circle-stroke-width": 0,
      },
    });
  }

  // Core — small bright dot, no stroke for clean blip look
  if (!map.getLayer(ids[1])) {
    map.addLayer({
      id: ids[1],
      type: "circle",
      source: srcId,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": "#ff6b35",
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 3, 4, 4, 8, 5],
        "circle-opacity": 0.95,
        "circle-stroke-width": 0,
      },
    });
  }

  // Cluster bubble
  if (!map.getLayer(ids[2])) {
    map.addLayer({
      id: ids[2],
      type: "circle",
      source: srcId,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#ff6b35",
        "circle-radius": ["step", ["get", "point_count"], 8, 10, 11, 25, 15],
        "circle-opacity": 0.85,
      },
    });
  }

  // Cluster count
  if (!map.getLayer(ids[3])) {
    map.addLayer({
      id: ids[3],
      type: "symbol",
      source: srcId,
      filter: ["has", "point_count"],
      layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 10 },
      paint: { "text-color": "#ffffff" },
    });
  }
}

/* ── Armed Conflict: impact burst — severity halo + colored core ─────── */

const ARMED_CONFLICT_COLOR = [
  "case",
  [">=", ["coalesce", ["get", "severity"], 0], 75], "#ff5a5f",
  [">=", ["coalesce", ["get", "severity"], 0], 50], "#ff9800",
  [">=", ["coalesce", ["get", "severity"], 0], 25], "#f4d03f",
  /* default */ "#7ddf64",
];

const ARMED_CONFLICT_RADIUS = [
  "interpolate", ["linear"],
  ["coalesce", ["get", "severity"], 0],
  0, 4, 25, 5, 50, 7, 100, 9,
];

function ensureArmedConflictLayers(layer: LayerRegistryEntry, map: MapLike): void {
  const srcId = sourceId(layer.id);
  const ids = layerIds(layer); // [halo, circle, cluster, cluster-count]

  // Impact burst halo — severity-scaled, red glow
  if (!map.getLayer(ids[0])) {
    map.addLayer({
      id: ids[0],
      type: "circle",
      source: srcId,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": ARMED_CONFLICT_COLOR,
        "circle-radius": [
          "interpolate", ["linear"],
          ["coalesce", ["get", "severity"], 0],
          0, 10, 25, 14, 50, 20, 100, 30,
        ],
        "circle-opacity": 0.18,
        "circle-blur": 0.8,
        "circle-stroke-width": 0,
      },
    });
  }

  // Core circle — severity color + thick red stroke for contrast
  if (!map.getLayer(ids[1])) {
    map.addLayer({
      id: ids[1],
      type: "circle",
      source: srcId,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": ARMED_CONFLICT_COLOR,
        "circle-radius": ARMED_CONFLICT_RADIUS,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#c62828",
      },
    });
  }

  // Cluster bubble
  if (!map.getLayer(ids[2])) {
    map.addLayer({
      id: ids[2],
      type: "circle",
      source: srcId,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#ff5a5f",
        "circle-radius": ["step", ["get", "point_count"], 8, 10, 11, 25, 15],
        "circle-opacity": 0.85,
      },
    });
  }

  // Cluster count
  if (!map.getLayer(ids[3])) {
    map.addLayer({
      id: ids[3],
      type: "symbol",
      source: srcId,
      filter: ["has", "point_count"],
      layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 10 },
      paint: { "text-color": "#ffffff" },
    });
  }
}

/* ── Refugee Camps: humanitarian marker — orange with white ring + labels */

function ensureRefugeeCampLayers(layer: LayerRegistryEntry, map: MapLike): void {
  const srcId = sourceId(layer.id);
  const ids = layerIds(layer); // [circle, label, cluster, cluster-count]

  // Core circle — larger orange with distinctive white stroke
  if (!map.getLayer(ids[0])) {
    map.addLayer({
      id: ids[0],
      type: "circle",
      source: srcId,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": "#ff7043",
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 6, 4, 8, 8, 10],
        "circle-opacity": 0.9,
        "circle-stroke-width": 2.5,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-opacity": 0.8,
      },
    });
  }

  // Label — camp name + population at zoom ≥ 4
  if (!map.getLayer(ids[1])) {
    map.addLayer({
      id: ids[1],
      type: "symbol",
      source: srcId,
      filter: ["!", ["has", "point_count"]],
      minzoom: 4,
      layout: {
        "text-field": ["concat", ["get", "name"], "\n", ["coalesce", ["to-string", ["get", "population"]], ""]],
        "text-size": 10,
        "text-offset": [0, 1.5],
        "text-anchor": "top",
        "text-max-width": 10,
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      },
      paint: {
        "text-color": "#ffccbc",
        "text-halo-color": "#000000",
        "text-halo-width": 1,
      },
    });
  }

  // Cluster bubble
  if (!map.getLayer(ids[2])) {
    map.addLayer({
      id: ids[2],
      type: "circle",
      source: srcId,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#ff7043",
        "circle-radius": ["step", ["get", "point_count"], 8, 10, 11, 25, 15],
        "circle-opacity": 0.85,
      },
    });
  }

  // Cluster count
  if (!map.getLayer(ids[3])) {
    map.addLayer({
      id: ids[3],
      type: "symbol",
      source: srcId,
      filter: ["has", "point_count"],
      layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 10 },
      paint: { "text-color": "#ffffff" },
    });
  }
}

/* ── UCDP Events: data pin — outer ring + severity-colored core ──────── */

const UCDP_SEVERITY_COLOR = [
  "case",
  [">=", ["coalesce", ["get", "severity"], 0], 75], "#9b30ff",
  [">=", ["coalesce", ["get", "severity"], 0], 50], "#b455e0",
  [">=", ["coalesce", ["get", "severity"], 0], 25], "#d4a0f0",
  /* default */ "#e8ccf5",
];

const UCDP_FATALITY_RADIUS = [
  "interpolate", ["linear"],
  ["ln", ["+", 1, ["coalesce", ["get", "fatalities_best"], 1]]],
  0, 3, 2, 5, 4, 8, 6, 12,
];

function ensureUcdpEventLayers(layer: LayerRegistryEntry, map: MapLike): void {
  const srcId = sourceId(layer.id);
  const ids = layerIds(layer); // [ring, circle, cluster, cluster-count]

  // Outer ring — thin, sharp, at 2x radius, low opacity
  if (!map.getLayer(ids[0])) {
    map.addLayer({
      id: ids[0],
      type: "circle",
      source: srcId,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": "transparent",
        "circle-radius": [
          "interpolate", ["linear"],
          ["ln", ["+", 1, ["coalesce", ["get", "fatalities_best"], 1]]],
          0, 7, 2, 11, 4, 16, 6, 22,
        ],
        "circle-opacity": 0,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": UCDP_SEVERITY_COLOR,
        "circle-stroke-opacity": 0.35,
      },
    });
  }

  // Core circle — severity-colored, fatality-sized
  if (!map.getLayer(ids[1])) {
    map.addLayer({
      id: ids[1],
      type: "circle",
      source: srcId,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": UCDP_SEVERITY_COLOR,
        "circle-radius": UCDP_FATALITY_RADIUS,
        "circle-stroke-width": 1,
        "circle-stroke-color": "#7b2d9e",
      },
    });
  }

  // Cluster bubble
  if (!map.getLayer(ids[2])) {
    map.addLayer({
      id: ids[2],
      type: "circle",
      source: srcId,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#b455e0",
        "circle-radius": ["step", ["get", "point_count"], 8, 10, 11, 25, 15],
        "circle-opacity": 0.85,
      },
    });
  }

  // Cluster count
  if (!map.getLayer(ids[3])) {
    map.addLayer({
      id: ids[3],
      type: "symbol",
      source: srcId,
      filter: ["has", "point_count"],
      layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 10 },
      paint: { "text-color": "#ffffff" },
    });
  }
}

/* ── AI Data Centers: importance-sized circles with confidence halos ── */

const AIDC_IMPORTANCE_RADIUS_EXPR = [
  "interpolate", ["linear"],
  ["coalesce", ["get", "importance"], 30],
  0, 4, 30, 6, 60, 10, 80, 14, 100, 20,
];

const AIDC_IMPORTANCE_COLOR_EXPR = [
  "case",
  [">=", ["coalesce", ["get", "importance"], 0], 70], "#7c4dff",
  [">=", ["coalesce", ["get", "importance"], 0], 50], "#9575cd",
  [">=", ["coalesce", ["get", "importance"], 0], 30], "#b39ddb",
  /* default */ "#ce93d8",
];

const AIDC_CONFIDENCE_HALO_OPACITY = [
  "interpolate", ["linear"],
  ["coalesce", ["get", "confidence"], 50],
  0, 0.04, 50, 0.08, 80, 0.14, 100, 0.20,
];

function ensureAiDataCenterLayers(layer: LayerRegistryEntry, map: MapLike): void {
  const srcId = sourceId(layer.id);
  const ids = layerIds(layer); // [halo, circle, label, cluster, cluster-count]

  // Confidence halo
  if (!map.getLayer(ids[0])) {
    map.addLayer({
      id: ids[0],
      type: "circle",
      source: srcId,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": "#7c4dff",
        "circle-radius": ["interpolate", ["linear"], ["coalesce", ["get", "importance"], 30],
          0, 12, 100, 40],
        "circle-opacity": AIDC_CONFIDENCE_HALO_OPACITY,
        "circle-blur": 1.0,
        "circle-stroke-width": 0,
      },
    });
  }

  // Main circle (sized by importance)
  if (!map.getLayer(ids[1])) {
    map.addLayer({
      id: ids[1],
      type: "circle",
      source: srcId,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": AIDC_IMPORTANCE_COLOR_EXPR,
        "circle-radius": AIDC_IMPORTANCE_RADIUS_EXPR,
        "circle-stroke-width": 1,
        "circle-stroke-color": "#17202a",
      },
    });
  }

  // Label (visible at higher zoom)
  if (!map.getLayer(ids[2])) {
    map.addLayer({
      id: ids[2],
      type: "symbol",
      source: srcId,
      filter: ["!", ["has", "point_count"]],
      minzoom: 5,
      layout: {
        "text-field": ["get", "name"],
        "text-size": 10,
        "text-offset": [0, 1.4],
        "text-anchor": "top",
        "text-max-width": 10,
      },
      paint: {
        "text-color": "#e0d0ff",
        "text-halo-color": "#000000",
        "text-halo-width": 1,
      },
    });
  }

  // Cluster bubble
  if (!map.getLayer(ids[3])) {
    map.addLayer({
      id: ids[3],
      type: "circle",
      source: srcId,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#7c4dff",
        "circle-radius": ["step", ["get", "point_count"], 8, 10, 11, 25, 15],
        "circle-opacity": 0.85,
      },
    });
  }

  // Cluster count
  if (!map.getLayer(ids[4])) {
    map.addLayer({
      id: ids[4],
      type: "symbol",
      source: srcId,
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-size": 10,
      },
      paint: { "text-color": "#ffffff" },
    });
  }
}

/* ── Economic Centers: score-sized circles with halo ─────────────────── */

const EC_SCORE_RADIUS_EXPR = [
  "interpolate", ["linear"],
  ["coalesce", ["get", "scoreTotal"], 40],
  0,  5,
  40, 6,
  60, 9,
  80, 13,
  100, 18,
];

const EC_SCORE_COLOR_EXPR = [
  "case",
  [">=", ["coalesce", ["get", "scoreTotal"], 0], 80], "#f4a261",
  [">=", ["coalesce", ["get", "scoreTotal"], 0], 60], "#e9a046",
  [">=", ["coalesce", ["get", "scoreTotal"], 0], 40], "#d4954a",
  /* default */ "#c09060",
];

function ensureEconomicCenterLayers(layer: LayerRegistryEntry, map: MapLike): void {
  const srcId = sourceId(layer.id);
  const ids = layerIds(layer); // [halo, circle, cluster, cluster-count]

  // Halo: soft ambient glow behind each hub marker
  if (!map.getLayer(ids[0])) {
    map.addLayer({
      id: ids[0],
      type: "circle",
      source: srcId,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": "#f4a261",
        "circle-radius": ["interpolate", ["linear"], ["coalesce", ["get", "scoreTotal"], 40],
          0, 10, 100, 36],
        "circle-opacity": 0.12,
        "circle-blur": 1.0,
        "circle-stroke-width": 0,
      },
    });
  }

  // Main circle
  if (!map.getLayer(ids[1])) {
    map.addLayer({
      id: ids[1],
      type: "circle",
      source: srcId,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": EC_SCORE_COLOR_EXPR,
        "circle-radius": EC_SCORE_RADIUS_EXPR,
        "circle-stroke-width": 1,
        "circle-stroke-color": "#17202a",
      },
    });
  }

  // Cluster bubble
  if (!map.getLayer(ids[2])) {
    map.addLayer({
      id: ids[2],
      type: "circle",
      source: srcId,
      filter: ["==", ["get", "cluster"], true],
      paint: {
        "circle-color": "#f4a261",
        "circle-radius": ["step", ["get", "point_count"], 8, 10, 11, 25, 15],
        "circle-opacity": 0.85,
      },
    });
  }

  // Cluster count label
  if (!map.getLayer(ids[3])) {
    map.addLayer({
      id: ids[3],
      type: "symbol",
      source: srcId,
      filter: ["==", ["get", "cluster"], true],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-size": 10,
      },
      paint: { "text-color": "#000000" },
    });
  }
}

/* ── Trade Routes: category-colored, importance-weighted lines ────────── */

const TRADE_CATEGORY_COLOR_EXPR = [
  "match",
  ["coalesce", ["get", "category"], ""],
  "container", "#4fc3f7",
  "energy",    "#ffab40",
  "bulk",      "#76ff03",
  "strategic", "#ea80fc",
  /* default */ "#7f9fbe",
];

const TRADE_IMPORTANCE_WIDTH_EXPR = [
  "interpolate", ["linear"],
  ["coalesce", ["get", "importance"], 3],
  1, 1.2,
  2, 1.8,
  3, 2.4,
  4, 3.2,
  5, 4.0,
];

const TRADE_GLOW_WIDTH_EXPR = [
  "interpolate", ["linear"],
  ["coalesce", ["get", "importance"], 3],
  1, 4,
  2, 6,
  3, 8,
  4, 10,
  5, 14,
];

function ensureTradeRouteLayers(layer: LayerRegistryEntry, map: MapLike): void {
  const srcId = sourceId(layer.id);
  const ids = layerIds(layer);

  if (!map.getLayer(ids[0])) {
    map.addLayer({
      id: ids[0],
      type: "line",
      source: srcId,
      paint: {
        "line-color": TRADE_CATEGORY_COLOR_EXPR,
        "line-width": TRADE_GLOW_WIDTH_EXPR,
        "line-opacity": 0.18,
        "line-blur": 4,
      },
    });
  }

  if (!map.getLayer(ids[1])) {
    map.addLayer({
      id: ids[1],
      type: "line",
      source: srcId,
      paint: {
        "line-color": TRADE_CATEGORY_COLOR_EXPR,
        "line-width": TRADE_IMPORTANCE_WIDTH_EXPR,
        "line-opacity": 0.85,
        "line-dasharray": [2, 1.5],
      },
    });
  }

  if (!map.getLayer(ids[2])) {
    map.addLayer({
      id: ids[2],
      type: "symbol",
      source: srcId,
      minzoom: 4,
      layout: {
        "symbol-placement": "line-center",
        "text-field": ["get", "name"],
        "text-size": 11,
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-allow-overlap": false,
        "text-ignore-placement": false,
        "text-max-angle": 30,
        "text-offset": [0, -0.8],
      },
      paint: {
        "text-color": TRADE_CATEGORY_COLOR_EXPR,
        "text-halo-color": "#0a0e14",
        "text-halo-width": 1.5,
        "text-opacity": 0.9,
      },
    });
  }
}

/* ── Trade Route Nodes: hub halos + chokepoint dots ──────────────────── */

function ensureTradeRouteNodeLayers(layer: LayerRegistryEntry, map: MapLike): void {
  const srcId = sourceId(layer.id);
  const ids = layerIds(layer);

  if (!map.getLayer(ids[0])) {
    map.addLayer({
      id: ids[0],
      type: "circle",
      source: srcId,
      filter: ["==", ["get", "nodeType"], "hub"],
      paint: {
        "circle-color": "#4fc3f7",
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          1, 3,
          4, 6,
          8, 10,
        ],
        "circle-opacity": 0.5,
        "circle-stroke-color": "#4fc3f7",
        "circle-stroke-width": 1.5,
        "circle-stroke-opacity": 0.8,
        "circle-blur": 0.4,
      },
    });
  }

  if (!map.getLayer(ids[1])) {
    map.addLayer({
      id: ids[1],
      type: "circle",
      source: srcId,
      filter: ["==", ["get", "nodeType"], "chokepoint"],
      paint: {
        "circle-color": "#ff5252",
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          1, 2.5,
          4, 4.5,
          8, 7,
        ],
        "circle-opacity": 0.7,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1,
        "circle-stroke-opacity": 0.9,
      },
    });
  }

  if (!map.getLayer(ids[2])) {
    map.addLayer({
      id: ids[2],
      type: "symbol",
      source: srcId,
      minzoom: 3,
      layout: {
        "text-field": ["get", "name"],
        "text-size": [
          "interpolate", ["linear"], ["zoom"],
          3, 9,
          6, 12,
        ],
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-allow-overlap": false,
        "text-offset": [0, 1.2],
        "text-anchor": "top",
      },
      paint: {
        "text-color": [
          "match", ["get", "nodeType"],
          "hub", "#4fc3f7",
          "chokepoint", "#ff5252",
          "#ffffff",
        ],
        "text-halo-color": "#0a0e14",
        "text-halo-width": 1.2,
      },
    });
  }
}

export const maplibreRenderer: LayerRenderer<MapLike> = {
  mount(layer, map) {
    if (!isMapLike(map)) return;
    if (layer.type === "rasterTiles") {
      ensureRasterLayer(layer, map);
      return;
    }
    ensureGeoJsonLayer(layer, map);
  },

  updateData(layer, map, data) {
    if (!isMapLike(map)) return;
    if (layer.type === "rasterTiles") return;

    const src = map.getSource(sourceId(layer.id));
    if (src?.setData) src.setData(toGeoJson(data));
  },

  setVisibility(layer, map, visible) {
    if (!isMapLike(map)) return;
    const mode = visible ? "visible" : "none";
    for (const id of layerIds(layer)) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", mode);
    }
  },

  setOrder(layer, map) {
    if (!isMapLike(map)) return;
    for (const id of layerIds(layer)) {
      if (!map.getLayer(id)) continue;
      try {
        map.moveLayer(id);
      } catch {
        // no-op
      }
    }
  },

  unmount(layer, map) {
    if (!isMapLike(map)) return;
    for (const id of layerIds(layer)) {
      removeLayerSafe(map, id);
    }
    const srcId = sourceId(layer.id);
    if (map.getSource(srcId)) map.removeSource(srcId);
  },
};
