"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeCountryCode } from "../../lib/news/countryCode";
import type { GeoMarker } from "../../lib/news/types";
import CountryDetailModal from "./CountryDetailModal";
import { useWorldViewStore } from "../../store";
import Toggle from "../dashboard/controls/Toggle";
import { NEWS_LAYER_REGISTRY } from "../../lib/newsLayers/registry";
import { validateLayerRegistry } from "../../lib/newsLayers/validation";
import { NewsLayerRuntime } from "../../lib/newsLayers/runtime";
import { maplibreRenderer } from "../../lib/newsLayers/renderers/maplibreRenderer";
import type { LayerFeatureCollection, LayerHealthState } from "../../lib/newsLayers/types";

interface MapLibreNewsMapProps {
  onReady?: () => void;
}

type MapLibreModule = typeof import("maplibre-gl");
type MapInstance = import("maplibre-gl").Map;

const MAP_DEFAULT_CENTER: [number, number] = [10, 20];
const MAP_DEFAULT_ZOOM = 1.8;
const MAP_MAX_ZOOM = 8;
const MAP_MIN_ZOOM = 1;

const COUNTRY_GEOJSON_URL = "/data/ne_50m_admin_0_countries.geojson";

function markerColor(marker: GeoMarker): string {
  switch (marker.category) {
    case "markets":
      return "#36b37e";
    case "tech":
      return "#00e5ff";
    case "energy":
      return "#ffab40";
    case "defense":
      return "#ea80fc";
    case "crypto":
      return "#76ff03";
    case "local":
      return "#4fc3f7";
    case "filings":
      return "#7f9fbe";
    case "watchlist":
      return "#f4d03f";
    case "world":
    default:
      return "#ff5630";
  }
}

function markerRadius(marker: GeoMarker): number {
  if (marker.count && marker.count > 10) return 7;
  if (marker.count && marker.count > 3) return 5;
  return 4;
}

function toMarkerFeature(marker: GeoMarker): GeoJSON.Feature {
  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [marker.lon, marker.lat],
    },
    properties: {
      id: marker.id,
      articleId: marker.articleId,
      color: markerColor(marker),
      radius: markerRadius(marker),
      source: marker.source,
      headline: marker.headline,
      publishedAt: marker.publishedAt,
    },
  };
}

function firstString(props: Record<string, unknown> | undefined, keys: string[]): string | null {
  if (!props) return null;
  for (const key of keys) {
    const value = props[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed || trimmed === "-99") continue;
    return trimmed;
  }
  return null;
}

function countryCodeFromProps(props: Record<string, unknown> | undefined): string | null {
  const candidate = firstString(props, ["ISO_A2_EH", "ISO_A2", "WB_A2", "POSTAL", "NAME", "ADMIN"]);
  return normalizeCountryCode(candidate);
}

function toLayerHealthUi(status: LayerHealthState["status"]): "ok" | "loading" | "stale" | "error" {
  if (status === "live") return "ok";
  if (status === "cached") return "loading";
  if (status === "degraded") return "stale";
  return "error";
}

export default function MapLibreNewsMap({ onReady }: MapLibreNewsMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const maplibreRef = useRef<MapLibreModule | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const runtimeRef = useRef<NewsLayerRuntime | null>(null);
  const mountedLayersRef = useRef<Set<string>>(new Set());
  const layerDataRef = useRef<Map<string, LayerFeatureCollection>>(new Map());
  const hoveredCountryRef = useRef<string | null>(null);
  const mapReadyRef = useRef(false);

  const markers = useWorldViewStore((s) => s.news.markers);
  const feedItems = useWorldViewStore((s) => s.news.feedItems);
  const selectedCountry = useWorldViewStore((s) => s.news.selectedCountry);
  const layerToggles = useWorldViewStore((s) => s.news.layerToggles);
  const layerHealth = useWorldViewStore((s) => s.news.layerHealth);

  const setSelectedCountry = useWorldViewStore((s) => s.setSelectedCountry);
  const setNewsLayerToggle = useWorldViewStore((s) => s.setNewsLayerToggle);
  const setNewsLayerHealth = useWorldViewStore((s) => s.setNewsLayerHealth);
  const setNewsCameraBounds = useWorldViewStore((s) => s.setNewsCameraBounds);

  const [mapReady, setMapReady] = useState(false);
  const [dockSide, setDockSide] = useState<"left" | "right">("left");
  const onReadyRef = useRef(onReady);
  const countryByArticleIdRef = useRef<Map<string, string>>(new Map());
  const layerTogglesRef = useRef<Record<string, boolean>>({});

  const countryByArticleId = useMemo(() => {
    const byId = new Map<string, string>();
    for (const article of feedItems) {
      const normalized = normalizeCountryCode(article.country);
      if (normalized) byId.set(article.id, normalized);
    }
    return byId;
  }, [feedItems]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    countryByArticleIdRef.current = countryByArticleId;
  }, [countryByArticleId]);

  useEffect(() => {
    layerTogglesRef.current = layerToggles;
  }, [layerToggles]);

  const sortedLayers = useMemo(
    () => [...NEWS_LAYER_REGISTRY].sort((a, b) => a.stackOrder - b.stackOrder),
    []
  );

  const markerGeoJson = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: markers
        .filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lon))
        .map((m) => toMarkerFeature(m)),
    }),
    [markers]
  );

  const syncLayerMountedState = useCallback(
    async (layerId: string, enabled: boolean) => {
      const layer = sortedLayers.find((entry) => entry.id === layerId);
      const map = mapRef.current as unknown as Parameters<typeof maplibreRenderer.mount>[1] | null;
      const runtime = runtimeRef.current;
      if (!layer || !map || !runtime) return;

      if (enabled) {
        if (!mountedLayersRef.current.has(layerId)) {
          maplibreRenderer.mount(layer, map);
          mountedLayersRef.current.add(layerId);
          await runtime.primeFromCache(layerId);
          runtime.enable(layerId);
        }
        const cachedData = layerDataRef.current.get(layerId);
        if (cachedData) maplibreRenderer.updateData(layer, map, cachedData);
        maplibreRenderer.setVisibility(layer, map, true);
        maplibreRenderer.setOrder(layer, map, layer.stackOrder);
        return;
      }

      runtime.disable(layerId);
      if (mountedLayersRef.current.has(layerId)) {
        maplibreRenderer.unmount(layer, map);
        mountedLayersRef.current.delete(layerId);
      }
    },
    [sortedLayers]
  );

  useEffect(() => {
    const errors = validateLayerRegistry(sortedLayers);
    if (errors.length) {
      console.warn("[news-layers] registry validation errors", errors);
    }
  }, [sortedLayers]);

  useEffect(() => {
    let cancelled = false;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;
    let windowResizeHandler: (() => void) | null = null;

    const init = async () => {
      if (!containerRef.current || mapRef.current) return;

      const rectAtInit = containerRef.current.getBoundingClientRect();
      // #region agent log
      fetch("http://127.0.0.1:7928/ingest/3da76906-48e1-4cba-af71-0b7fc1ab7982", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "8cccc8",
        },
        body: JSON.stringify({
          sessionId: "8cccc8",
          runId: "initial",
          hypothesisId: "H1",
          location: "MapLibreNewsMap.tsx:init",
          message: "Map container size at init",
          data: {
            width: rectAtInit?.width ?? null,
            height: rectAtInit?.height ?? null,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      const maplibre = await import("maplibre-gl");
      if (cancelled || !containerRef.current || mapRef.current) return;
      maplibreRef.current = maplibre;

      const markReady = () => {
        if (cancelled || mapReadyRef.current) return;
        mapReadyRef.current = true;
        setMapReady(true);
        onReadyRef.current?.();
      };

      // Safety net: always clear the overlay after 15 s in case load/error never fires
      safetyTimer = setTimeout(markReady, 15_000);

      let map: MapInstance;
      try {
        map = new maplibre.Map({
          container: containerRef.current,
          style: {
            version: 8,
            glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
            sources: {
              base: {
                type: "raster",
                tiles: [
                  "https://a.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}.png",
                  "https://b.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}.png",
                  "https://c.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}.png",
                ],
                tileSize: 256,
              },
            },
            layers: [{ id: "base", type: "raster", source: "base" }],
          },
          center: MAP_DEFAULT_CENTER,
          zoom: MAP_DEFAULT_ZOOM,
          minZoom: MAP_MIN_ZOOM,
          maxZoom: MAP_MAX_ZOOM,
          maxBounds: [
            [-180, -80],
            [180, 84],
          ],
          attributionControl: { compact: true },
        });
      } catch (error) {
        console.error("[MapLibreNewsMap] Map constructor failed:", error);
        markReady();
        return;
      }

      mapRef.current = map;
      const queueResize = () => {
        const container = containerRef.current;
        const rect = container?.getBoundingClientRect();
        // #region agent log
        fetch("http://127.0.0.1:7928/ingest/3da76906-48e1-4cba-af71-0b7fc1ab7982", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "8cccc8",
          },
          body: JSON.stringify({
            sessionId: "8cccc8",
            runId: "initial",
            hypothesisId: "H2",
            location: "MapLibreNewsMap.tsx:queueResize:before",
            message: "queueResize before map.resize",
            data: {
              width: rect?.width ?? null,
              height: rect?.height ?? null,
              hasMapRef: !!mapRef.current,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion

        requestAnimationFrame(() => {
          try {
            map.resize();
          } catch (error) {
            // #region agent log
            fetch("http://127.0.0.1:7928/ingest/3da76906-48e1-4cba-af71-0b7fc1ab7982", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Debug-Session-Id": "8cccc8",
              },
              body: JSON.stringify({
                sessionId: "8cccc8",
                runId: "initial",
                hypothesisId: "H2",
                location: "MapLibreNewsMap.tsx:queueResize:catch",
                message: "map.resize threw",
                data: {
                  error: String(error),
                },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
            // #endregion
            // Ignore resize calls during teardown.
          }
        });
      };
      const onWindowResize = () => queueResize();
      windowResizeHandler = onWindowResize;

      // MapLibre inside draggable/resizable grids can initialize at stale dimensions.
      // Keep the WebGL canvas in sync with its panel size.
      if (typeof ResizeObserver !== "undefined" && containerRef.current) {
        resizeObserverRef.current?.disconnect();
        const observer = new ResizeObserver(() => queueResize());
        observer.observe(containerRef.current);
        resizeObserverRef.current = observer;
      }
      window.addEventListener("resize", onWindowResize);
      queueResize();

      runtimeRef.current = new NewsLayerRuntime(sortedLayers, {
        onData: (layerId, data, health) => {
          layerDataRef.current.set(layerId, data);
          setNewsLayerHealth(layerId, health);
          const layer = sortedLayers.find((entry) => entry.id === layerId);
          const liveMap = mapRef.current as unknown as Parameters<typeof maplibreRenderer.mount>[1] | null;
          if (!layer || !liveMap || !mountedLayersRef.current.has(layerId)) return;
          maplibreRenderer.updateData(layer, liveMap, data);
        },
        onHealth: (layerId, health) => {
          setNewsLayerHealth(layerId, health);
        },
      });

      map.on("load", async () => {
        if (cancelled) {
          markReady();
          return;
        }

        try {
          map.addSource("wv-country-src", {
            type: "geojson",
            data: COUNTRY_GEOJSON_URL,
            generateId: true,
          });

          map.addLayer({
            id: "wv-country-fill",
            type: "fill",
            source: "wv-country-src",
            paint: {
              "fill-color": "#142139",
              "fill-opacity": 0.18,
            },
          });

          map.addLayer({
            id: "wv-country-border",
            type: "line",
            source: "wv-country-src",
            paint: {
              "line-color": "#4e5c71",
              "line-width": 0.9,
              "line-opacity": 0.85,
            },
          });

          map.addLayer({
            id: "wv-country-highlight",
            type: "line",
            source: "wv-country-src",
            filter: ["==", ["get", "ISO_A2"], ""],
            paint: {
              "line-color": "#a9bfdc",
              "line-width": 1.8,
            },
          });

          map.addSource("wv-news-markers", {
            type: "geojson",
            data: markerGeoJson,
          });

          map.addLayer({
            id: "wv-news-markers-layer",
            type: "circle",
            source: "wv-news-markers",
            paint: {
              "circle-color": ["get", "color"],
              "circle-radius": ["get", "radius"],
              "circle-stroke-color": "#0d141c",
              "circle-stroke-width": 1,
            },
          });

          map.on("mousemove", "wv-country-fill", (event) => {
            const feature = event.features?.[0] as GeoJSON.Feature | undefined;
            const code = countryCodeFromProps((feature?.properties ?? {}) as Record<string, unknown>);
            hoveredCountryRef.current = code;
            map.setFilter("wv-country-highlight", ["==", ["get", "ISO_A2"], code ?? ""]);
            map.getCanvas().style.cursor = code ? "pointer" : "";
          });

          map.on("mouseleave", "wv-country-fill", () => {
            hoveredCountryRef.current = null;
            map.setFilter("wv-country-highlight", ["==", ["get", "ISO_A2"], ""]);
            map.getCanvas().style.cursor = "";
          });

          map.on("click", "wv-country-fill", (event) => {
            const feature = event.features?.[0] as GeoJSON.Feature | undefined;
            const code = countryCodeFromProps((feature?.properties ?? {}) as Record<string, unknown>);
            const x = typeof event.point?.x === "number" ? event.point.x : null;
            if (x !== null) {
              const halfWidth = map.getContainer().clientWidth / 2;
              setDockSide(x >= halfWidth ? "left" : "right");
            }
            if (code) setSelectedCountry(code);
          });

          map.on("click", "wv-news-markers-layer", (event) => {
            const feature = event.features?.[0] as GeoJSON.Feature | undefined;
            const articleId = String((feature?.properties as Record<string, unknown> | undefined)?.articleId ?? "");
            const x = typeof event.point?.x === "number" ? event.point.x : null;
            if (x !== null) {
              const halfWidth = map.getContainer().clientWidth / 2;
              setDockSide(x >= halfWidth ? "left" : "right");
            }
            const countryCode = countryByArticleIdRef.current.get(articleId) ?? null;
            if (countryCode) setSelectedCountry(countryCode);
          });

          map.on("moveend", () => {
            const bounds = map.getBounds();
            if (!bounds) return;
            setNewsCameraBounds({
              west: bounds.getWest(),
              south: bounds.getSouth(),
              east: bounds.getEast(),
              north: bounds.getNorth(),
            });
          });

          for (const layer of sortedLayers) {
            const enabled = layerTogglesRef.current[layer.id] ?? layer.defaultEnabled;
            if (enabled) {
              await syncLayerMountedState(layer.id, true);
            }
          }
        } catch (err) {
          console.error("[MapLibreNewsMap] load callback error:", err);
        } finally {
          queueResize();
          markReady();
        }
      });

      // Map-level errors (tile/style failures) should not block the ready state
      map.on("error", () => {
        markReady();
      });
    };

    void init();

    return () => {
      cancelled = true;
      if (safetyTimer !== null) clearTimeout(safetyTimer);
      if (windowResizeHandler) window.removeEventListener("resize", windowResizeHandler);
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
      if (mapRef.current) {
        // #region agent log
        fetch("http://127.0.0.1:7928/ingest/3da76906-48e1-4cba-af71-0b7fc1ab7982", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "8cccc8",
          },
          body: JSON.stringify({
            sessionId: "8cccc8",
            runId: "initial",
            hypothesisId: "H3",
            location: "MapLibreNewsMap.tsx:cleanup",
            message: "map.remove called in cleanup",
            data: {},
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        mapRef.current.remove();
        mapRef.current = null;
      }
      mountedLayersRef.current.clear();
      layerDataRef.current.clear();
    };
  }, [setNewsCameraBounds, setNewsLayerHealth, setSelectedCountry, setDockSide, sortedLayers, syncLayerMountedState]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("wv-news-markers")) return;
    const source = map.getSource("wv-news-markers") as unknown as { setData?: (data: GeoJSON.FeatureCollection) => void };
    source.setData?.(markerGeoJson);
  }, [markerGeoJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !(map as any).isStyleLoaded?.()) return;
    for (const layer of sortedLayers) {
      const enabled = layerToggles[layer.id] ?? layer.defaultEnabled;
      void syncLayerMountedState(layer.id, enabled);
    }
  }, [layerToggles, mapReady, sortedLayers, syncLayerMountedState]);

  const grouped = useMemo(() => {
    const byCat = new Map<string, typeof sortedLayers>();
    for (const layer of sortedLayers) {
      const rows = byCat.get(layer.category) ?? [];
      rows.push(layer);
      byCat.set(layer.category, rows);
    }
    return Array.from(byCat.entries());
  }, [sortedLayers]);

  return (
    <div className="wv-news-map-container">
      <div ref={containerRef} className="wv-news-map-canvas" />

      <aside className="wv-news-layers-panel" aria-label="News map layers">
        <div className="wv-news-layers-title">LAYERS</div>
        <div className="wv-news-layers-scroll">
          {grouped.map(([category, layers]) => (
            <div key={category} className="wv-news-layers-group">
              <div className="wv-news-layers-group-label">{category.toUpperCase()}</div>
              {layers.map((layer) => {
                const enabled = layerToggles[layer.id] ?? layer.defaultEnabled;
                const health = layerHealth[layer.id];
                const status = health?.status ?? "unavailable";
                return (
                  <div key={layer.id} className="wv-news-layer-row" data-cat={layer.category}>
                    <Toggle
                      checked={enabled}
                      onChange={(checked) => setNewsLayerToggle(layer.id, checked)}
                      label={`${layer.icon} ${layer.label}`}
                    />
                    <span className={`wv-panel-health is-${toLayerHealthUi(status)}`} title={status} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </aside>

      {selectedCountry ? (
        <CountryDetailModal countryCode={selectedCountry} dockSide={dockSide} onClose={() => setSelectedCountry(null)} />
      ) : null}
    </div>
  );
}
