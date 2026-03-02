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
  return `wv-news-src-${layerId}`;
}

function layerIds(layer: LayerRegistryEntry): string[] {
  const base = `wv-news-layer-${layer.id}`;
  if (layer.type === "geojsonPolygons") return [`${base}-fill`, `${base}-line`];
  if (layer.type === "geojsonPoints" || layer.type === "dynamicEntities") return [`${base}-circle`, `${base}-cluster`, `${base}-cluster-count`];
  return [base];
}

function toGeoJson(data: LayerFeatureCollection): GeoJSON.FeatureCollection {
  return {
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
    map.addSource(srcId, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      cluster: layer.type === "geojsonPoints" || layer.type === "dynamicEntities",
      clusterRadius: layer.style.clusterPixels ?? 48,
      clusterMaxZoom: Math.max(0, (layer.performance.clusterAtZoomLessThan ?? 3) + 1),
    });
  }

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

  if (!map.getLayer(ids[1])) {
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

  if (!map.getLayer(ids[2])) {
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
