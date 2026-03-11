import type { LayerFeature, LayerFeatureCollection, LayerRegistryEntry } from "../types";
import type { LayerRenderer } from "./rendererTypes";
import { getLayerClickHandler } from "../store";

type LeafletModule = typeof import("leaflet");
type LeafletMapLike = import("leaflet").Map;
type LeafletLayer = import("leaflet").Layer;
type LeafletLayerGroup = import("leaflet").LayerGroup;

const leafletByMap = new WeakMap<LeafletMapLike, LeafletModule>();
const layerRootByMap = new WeakMap<LeafletMapLike, Map<string, LeafletLayer>>();

export function registerLeafletForMap(map: LeafletMapLike, L: LeafletModule): void {
  leafletByMap.set(map, L);
}

function getLeaflet(map: LeafletMapLike): LeafletModule | null {
  return leafletByMap.get(map) ?? null;
}

function getLayerRoots(map: LeafletMapLike): Map<string, LeafletLayer> {
  let dict = layerRootByMap.get(map);
  if (!dict) {
    dict = new Map<string, LeafletLayer>();
    layerRootByMap.set(map, dict);
  }
  return dict;
}

function toGeoJson(data: LayerFeatureCollection): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: data.features.map((f) => ({
      type: "Feature",
      id: f.id,
      geometry: {
        type: f.geometry.type,
        coordinates: f.geometry.coordinates as unknown as
          | number[]
          | number[][]
          | number[][][],
      },
      properties: { ...f.properties, ts: f.ts },
    })),
  } as unknown as GeoJSON.FeatureCollection;
}

function ensureRootLayer(layer: LayerRegistryEntry, map: LeafletMapLike): LeafletLayer | null {
  const L = getLeaflet(map);
  if (!L) return null;
  const roots = getLayerRoots(map);
  const existing = roots.get(layer.id);
  if (existing) return existing;

  let root: LeafletLayer;

  if (layer.type === "rasterTiles" && layer.style.rasterUrlTemplate) {
    const urlTemplate = layer.style.rasterUrlTemplate;
    const hasUnsupportedTokens = /\{(Time|TileMatrixSet|TileMatrix|TileRow|TileCol)\}/.test(
      urlTemplate
    );

    if (hasUnsupportedTokens) {
      // Fallback: create an empty group for unsupported WMTS-style templates to avoid runtime errors.
      root = L.layerGroup();
    } else {
      root = L.tileLayer(urlTemplate, {
        opacity: layer.style.rasterAlpha ?? 0.45,
        pane: "si-news-layers",
      });
    }
  } else {
    root = L.layerGroup();
  }

  root.addTo(map);
  roots.set(layer.id, root);
  return root;
}

function clearRootLayer(root: LeafletLayer, map: LeafletMapLike): void {
  const group = root as LeafletLayerGroup;
  if (typeof group.clearLayers === "function") {
    group.clearLayers();
  } else {
    map.removeLayer(root);
  }
}

function escapeHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Builds a generic info popup for any point layer feature. */
function buildGenericPopupHtml(layer: LayerRegistryEntry, feature: any): string {
  const props = (feature.properties ?? {}) as Record<string, unknown>;
  const name = props.name ?? props.title ?? props.label ?? props.fullname ?? null;
  const typeVal = props.type ?? props.facilityType ?? props.category ?? null;
  const country = props.country ?? props.countryCode ?? null;

  const tsRaw = props.ts ?? props.time ?? props.timestamp ?? props.updatedAt;
  const tsMs =
    typeof tsRaw === "number"
      ? tsRaw
      : Number.isFinite(Number(tsRaw))
      ? Number(tsRaw)
      : NaN;
  const when = Number.isFinite(tsMs) ? new Date(tsMs) : null;
  const timeLabel = when && Number.isFinite(when.getTime()) ? when.toUTCString() : null;

  const coords =
    feature.geometry?.type === "Point" ? (feature.geometry.coordinates as number[]) : null;
  const lon = Array.isArray(coords) && coords.length >= 2 ? Number(coords[0]) : null;
  const lat = Array.isArray(coords) && coords.length >= 2 ? Number(coords[1]) : null;

  const parts: string[] = [];
  const displayName = name != null ? escapeHtml(name) : escapeHtml(layer.label);
  parts.push(`<div><strong>${escapeHtml(layer.icon)} ${displayName}</strong></div>`);
  if (name != null) parts.push(`<div>Layer: ${escapeHtml(layer.label)}</div>`);
  if (typeVal != null) parts.push(`<div>Type: ${escapeHtml(typeVal)}</div>`);
  if (country != null) parts.push(`<div>Country: ${escapeHtml(country)}</div>`);
  if (Number.isFinite(lat) && Number.isFinite(lon))
    parts.push(`<div>Location: ${(lat as number).toFixed(2)}, ${(lon as number).toFixed(2)}</div>`);
  if (timeLabel) parts.push(`<div>Updated: ${escapeHtml(timeLabel)}</div>`);
  return `<div>${parts.join("")}</div>`;
}

export const leafletRenderer: LayerRenderer<LeafletMapLike> = {
  mount(layer, map) {
    ensureRootLayer(layer, map);
  },

  updateData(layer, map, data) {
    if (layer.type === "rasterTiles") return;
    const L = getLeaflet(map);
    if (!L) return;
    const root = ensureRootLayer(layer, map);
    if (!root) return;

    const group = root as LeafletLayerGroup;
    if (typeof group.clearLayers === "function") {
      group.clearLayers();
    }

    const style = layer.style;
    const clickHandler = getLayerClickHandler(layer.id);
    const featureById = new Map<string, LayerFeature>();
    if (clickHandler) {
      for (const feature of data.features) {
        featureById.set(feature.id, feature);
      }
    }


    const isConflictLayer = layer.id === "conflict-zones";
    const isNuclearLayer = layer.id === "nuclear-sites";
    const willBindPopupForNuclear = isNuclearLayer && !clickHandler;


    // onEachFeature binds click handlers for polygon/line layers with clickHandler, or fallback popups.
    const onEachFeature =
      (layer.type === "geojsonPolygons" || layer.type === "geojsonLines") && clickHandler
        ? (feature: any, leafletLayer: any) => {
            const anyLayer = leafletLayer as any;
            if (!anyLayer) return;
            anyLayer.on("click", (e: any) => {
              L.DomEvent.stopPropagation(e);
              const layerFeature = featureById.get(String(feature.id ?? ""));
              if (layerFeature) clickHandler(layerFeature);
            });
          }
        : isConflictLayer
        ? (feature: any, leafletLayer: any) => {
            const anyLayer = leafletLayer as any;
            if (!anyLayer || typeof anyLayer.bindPopup !== "function") return;
            const props = (feature.properties ?? {}) as Record<string, unknown>;
            const titleRaw = props.name ?? props.fullname ?? props.label ?? "Conflict Zone";
            const title = String(titleRaw || "Conflict Zone");
            const countValue = props.count ?? props.aggregateCount;
            const count =
              typeof countValue === "number"
                ? countValue
                : Number.isFinite(Number(countValue))
                ? Number(countValue)
                : null;
            const tsRaw = props.ts ?? props.time ?? props.timestamp ?? props.updatedAt;
            const tsMs =
              typeof tsRaw === "number"
                ? tsRaw
                : Number.isFinite(Number(tsRaw))
                ? Number(tsRaw)
                : Date.now();
            const when = new Date(tsMs);
            const timeLabel = Number.isFinite(when.getTime()) ? when.toUTCString() : "Unknown";
            const coords =
              feature.geometry?.type === "Point"
                ? (feature.geometry.coordinates as number[])
                : null;
            const lon =
              Array.isArray(coords) && coords.length >= 2 ? Number(coords[0]) : null;
            const lat =
              Array.isArray(coords) && coords.length >= 2 ? Number(coords[1]) : null;
            const locationLabel =
              Number.isFinite(lat) && Number.isFinite(lon)
                ? `${(lat as number).toFixed(2)}, ${(lon as number).toFixed(2)}`
                : "Unknown";
            const parts = [
              `<div><strong>${title}</strong></div>`,
              `<div>Type: Conflict Zone</div>`,
            ];
            if (count != null) parts.push(`<div>Intensity: ${count}</div>`);
            parts.push(`<div>Time: ${timeLabel}</div>`);
            parts.push(`<div>Source: GDELT Geo 2.0</div>`);
            parts.push(`<div>Location: ${locationLabel}</div>`);
            anyLayer.bindPopup(`<div>${parts.join("")}</div>`, { pane: "si-popup-pane" });
            anyLayer.on("click", (e: any) => L.DomEvent.stopPropagation(e));
          }
        : isNuclearLayer && willBindPopupForNuclear
        ? (feature: any, leafletLayer: any) => {
            const anyLayer = leafletLayer as any;
            if (!anyLayer || typeof anyLayer.bindPopup !== "function") return;
            const props = (feature.properties ?? {}) as Record<string, unknown>;
            const name = String(props.name ?? "Nuclear Site");
            const type = String(props.facilityType ?? props.type ?? "Nuclear facility");
            const country = props.country != null ? String(props.country) : null;
            const operator =
              props.operator != null && String(props.operator).trim() !== ""
                ? String(props.operator)
                : null;
            const capacity = props.capacity != null ? String(props.capacity) : null;
            const source = String(props.source ?? "SIGINT infrastructure snapshot");
            const tsRaw = props.ts ?? props.time ?? props.timestamp ?? props.updatedAt;
            const tsMs =
              typeof tsRaw === "number"
                ? tsRaw
                : Number.isFinite(Number(tsRaw))
                ? Number(tsRaw)
                : Date.now();
            const when = new Date(tsMs);
            const timeLabel = Number.isFinite(when.getTime()) ? when.toUTCString() : "Unknown";
            const coords =
              feature.geometry?.type === "Point"
                ? (feature.geometry.coordinates as number[])
                : null;
            const lon =
              Array.isArray(coords) && coords.length >= 2 ? Number(coords[0]) : null;
            const lat =
              Array.isArray(coords) && coords.length >= 2 ? Number(coords[1]) : null;
            const locationLabel =
              Number.isFinite(lat) && Number.isFinite(lon)
                ? `${(lat as number).toFixed(2)}, ${(lon as number).toFixed(2)}`
                : "Unknown";
            const parts: string[] = [];
            parts.push(`<div><strong>${name}</strong></div>`);
            parts.push(`<div>Type: ${type}</div>`);
            if (country) parts.push(`<div>Country: ${country}</div>`);
            if (operator) parts.push(`<div>Operator: ${operator}</div>`);
            if (capacity) parts.push(`<div>Capacity: ${capacity}</div>`);
            parts.push(`<div>Source: ${source}</div>`);
            parts.push(`<div>Location: ${locationLabel}</div>`);
            parts.push(`<div>Updated: ${timeLabel}</div>`);
            anyLayer.bindPopup(`<div>${parts.join("")}</div>`, { pane: "si-popup-pane" });
            anyLayer.on("click", (e: any) => L.DomEvent.stopPropagation(e));
          }
        : undefined;

    const geoJson = L.geoJSON(toGeoJson(data) as any, {
      style:
        layer.type === "geojsonLines" || layer.type === "geojsonPolygons"
          ? () => ({
              color: style.lineColor ?? style.polygonOutline ?? "#5c8cb5",
              weight: style.lineWidth ?? 1.2,
              fillColor: style.polygonFill ?? "#5c8cb533",
              fillOpacity: layer.type === "geojsonPolygons" ? 0.35 : 0,
            })
          : undefined,
      pointToLayer:
        layer.type === "geojsonPoints" || layer.type === "dynamicEntities"
          ? (feature, latlng) => {
              const isArmedConflict = layer.id === "armed-conflict";
              const isUcdp = layer.id === "ucdp-events";
              const isEconomicCenter = layer.id === "economic-centers";
              let radius = style.pointPixelSize ?? 5;
              let color = style.pointColor ?? "#f4d03f";
              const weight = style.pointStrokeWidth ?? 1;

              if (isEconomicCenter) {
                const score = Number((feature.properties as any)?.scoreTotal ?? 40);
                color = score >= 80 ? "#f4a261" : score >= 60 ? "#e9a046" : score >= 40 ? "#d4954a" : "#c09060";
                radius = Math.max(6, Math.min(18, 5 + score / 10));
              } else if (isArmedConflict || isUcdp) {
                const sev = Number((feature.properties as any)?.severity ?? 0);
                if (sev >= 75) { color = "#ff5a5f"; }
                else if (sev >= 50) { color = "#ff9800"; }
                else if (sev >= 25) { color = "#f4d03f"; }
                else { color = "#7ddf64"; }

                if (isUcdp) {
                  const fb = Number((feature.properties as any)?.fatalities_best ?? 1);
                  radius = Math.max(3, Math.min(12, 3 + Math.log(1 + fb) * 1.5));
                } else {
                  if (sev >= 75) radius = 9;
                  else if (sev >= 50) radius = 7;
                  else if (sev >= 25) radius = 5;
                  else radius = 4;
                }
              }

              const size = radius * 2;
              const icon = L.divIcon({
                className: "",
                html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:${weight}px solid ${color};box-sizing:border-box;opacity:0.9;cursor:pointer;"></div>`,
                iconSize: [size, size] as [number, number],
                iconAnchor: [radius, radius] as [number, number],
              });
              const marker = L.marker(latlng, {
                icon,
                pane: "si-news-layers",
                interactive: true,
              });

              if (isArmedConflict) {
                const headline = (feature.properties as any)?.headline ?? "";
                const sevLabel = (feature.properties as any)?.severityLabel ?? "";
                if (headline) {
                  marker.bindTooltip(
                    `<strong>${escapeHtml(headline)}</strong><br/>${escapeHtml(sevLabel)}`,
                    { pane: "si-tooltip-pane", direction: "top", offset: [0, -radius] }
                  );
                }
              }

              marker.on("click", (e: any) => {
                L.DomEvent.stopPropagation(e);
                if (clickHandler && feature.id != null) {
                  const layerFeature = featureById.get(String(feature.id));
                  if (layerFeature) {
                    clickHandler(layerFeature);
                    return;
                  }
                }
                if (!isConflictLayer && !isNuclearLayer && !isArmedConflict) {
                  const html = buildGenericPopupHtml(layer, feature);
                  marker.bindPopup(html, { pane: "si-popup-pane" }).openPopup();
                }
              });

              return marker;
            }
          : undefined,
      onEachFeature,
      pane: "si-news-layers",
    });

    geoJson.addTo(group);
  },

  setVisibility(layer, map, visible) {
    const root = getLayerRoots(map).get(layer.id);
    if (!root) return;
    const anyRoot = root as any;
    if (visible) {
      if (typeof anyRoot.addTo === "function") {
        anyRoot.addTo(map);
      }
      if (typeof anyRoot.bringToFront === "function") {
        anyRoot.bringToFront();
      }
    } else {
      map.removeLayer(root);
    }
  },

  setOrder(layer, map) {
    const root = getLayerRoots(map).get(layer.id) as any;
    if (root && typeof root.bringToFront === "function") {
      root.bringToFront();
    }
  },

  unmount(layer, map) {
    const roots = getLayerRoots(map);
    const root = roots.get(layer.id);
    if (!root) return;
    clearRootLayer(root, map);
    map.removeLayer(root);
    roots.delete(layer.id);
  },
};
