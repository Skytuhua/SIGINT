"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DivIcon,
  GeoJSON as LeafletGeoJSON,
  LayerGroup,
  LeafletMouseEvent,
  Map as LeafletMap,
  Marker,
  Path,
} from "leaflet";
import { CATEGORY_COLORS } from "../../config/newsConfig";
import { normalizeCountryCode } from "../../lib/news/countryCode";
import type { GeoMarker } from "../../lib/news/types";
import { useWorldViewStore } from "../../store";
import CountryDetailModal from "./CountryDetailModal";

const MAP_DEFAULT_CENTER: [number, number] = [20, 10];
const MAP_DEFAULT_ZOOM = 2;
const MAP_MAX_ZOOM = 8;
const MAP_ABSOLUTE_MIN_ZOOM = 0;
const MAP_LAT_MIN = -80;
const MAP_LAT_MAX = 84;
const MAP_WORLD_BOUNDS: [[number, number], [number, number]] = [
  [MAP_LAT_MIN, -180],
  [MAP_LAT_MAX, 180],
];
/** Dark basemap with no baked-in labels so we can render consistent English country labels. */
const CARTO_DARK_NOLABELS_TEMPLATE = "https://{s}.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}.png";

const THREAT_LEGEND = [
  { label: "High Alert", color: "#e53935" },
  { label: "Elevated", color: "#f4d03f" },
  { label: "Monitoring", color: "#5c8cb5" },
  { label: "Base", color: "#4caf50" },
];

type ManagedLeafletMap = LeafletMap & { __wvResizeObserver?: ResizeObserver };
interface ReverseNominatimPayload {
  result?: {
    countryCode?: string | null;
    country?: string | null;
  } | null;
}
interface ReverseMapTilerPayload {
  features?: Array<{
    text?: string;
    place_name?: string;
    properties?: {
      short_code?: string;
      country_code?: string;
    };
  }>;
}
interface ReverseLookupCacheEntry {
  value: string | null;
  expiresAt: number;
}

interface NewsWorldMapProps {
  onReady?: () => void;
}

const COUNTRY_CACHE_TTL_MS = 30 * 60_000;
const NULL_CACHE_TTL_MS = 20_000;
const COUNTRY_BASE_STYLE = {
  color: "#4e5c71",
  weight: 0.8,
  opacity: 0.85,
  fillColor: "#142139",
  fillOpacity: 0.18,
  lineJoin: "round" as const,
  lineCap: "round" as const,
};
const COUNTRY_HOVER_STYLE = {
  color: "#a9bfdc",
  weight: 1.4,
  opacity: 1,
  fillColor: "#6d86aa",
  fillOpacity: 0.45,
  lineJoin: "round" as const,
  lineCap: "round" as const,
};
const COUNTRY_GEOJSON_URL = "/data/ne_50m_admin_0_countries.geojson";
const MAX_COUNTRY_LABELS = 260;
const COUNTRY_FIXED_MAX_RANK = 8;
const COUNTRY_LABEL_MIN_DISTANCE_PX = 28;

type CountryFeatureProps = Record<string, unknown>;

function firstString(props: CountryFeatureProps | undefined, keys: string[]): string | null {
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

function countryCodeFromProps(props: CountryFeatureProps | undefined): string | null {
  const codeCandidate = firstString(props, ["ISO_A2_EH", "ISO_A2", "WB_A2", "POSTAL", "NAME", "ADMIN"]);
  return normalizeCountryCode(codeCandidate);
}

function countryLabelFromProps(props: CountryFeatureProps | undefined): string | null {
  return firstString(props, ["NAME_EN", "NAME", "ADMIN", "NAME_LONG"]);
}

function countryLabelRankFromProps(props: CountryFeatureProps | undefined): number {
  if (!props) return 6;
  const raw =
    props.LABELRANK ??
    props.labelrank ??
    props.MIN_LABEL ??
    props.min_label ??
    props.SCALERANK ??
    props.scalerank;
  const rank = Number(raw);
  return Number.isFinite(rank) ? rank : 6;
}

function markerColor(marker: GeoMarker): string {
  return CATEGORY_COLORS[marker.category] ?? "#4caf50";
}

function markerRadius(marker: GeoMarker): number {
  if (marker.count && marker.count > 10) return 6;
  if (marker.count && marker.count > 3) return 4.5;
  return 3;
}

function oppositeDockSideForLng(lng: number): "left" | "right" {
  // If selection is on the eastern hemisphere, open dock on the left, and vice versa.
  return lng >= 0 ? "left" : "right";
}

export default function NewsWorldMap({ onReady }: NewsWorldMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapCanvasRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<ManagedLeafletMap | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const countryLayerRef = useRef<LeafletGeoJSON | null>(null);
  const countryLabelLayerRef = useRef<LayerGroup | null>(null);
  const countryLabelMarkersRef = useRef<Map<string, Marker>>(new Map());
  const countryLabelCandidatesRef = useRef<Array<{ key: string; name: string; rank: number; lat: number; lon: number }>>([]);
  const countryLayersByIsoRef = useRef<Map<string, Path[]>>(new Map());
  const hoveredCountryIsoRef = useRef<string | null>(null);
  const markerLayerRef = useRef<LayerGroup | null>(null);
  const suppressMapClickRef = useRef(false);
  const reverseLookupCacheRef = useRef<Map<string, ReverseLookupCacheEntry>>(new Map());
  const reverseLookupRequestIdRef = useRef(0);
  const hasLoadedTileRef = useRef(false);
  const regionDisplayRef = useRef<Intl.DisplayNames | null>(null);
  const readyNotifiedRef = useRef(false);
  const onReadyRef = useRef<(() => void) | undefined>(onReady);

  const markers = useWorldViewStore((s) => s.news.markers);
  const feedItems = useWorldViewStore((s) => s.news.feedItems);
  const selectedCountry = useWorldViewStore((s) => s.news.selectedCountry);
  const setSelectedCountry = useWorldViewStore((s) => s.setSelectedCountry);
  const setSelectedCountryRef = useRef(setSelectedCountry);
  const selectedCountryRef = useRef<string | null>(selectedCountry);

  const mapTilerKey = (process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "").trim();
  const hasMapTilerKey = mapTilerKey.length > 0;

  const [tileLoadError, setTileLoadError] = useState(false);
  const [dockSide, setDockSide] = useState<"left" | "right">("left");
  const [countryGeometryVersion, setCountryGeometryVersion] = useState(0);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    setSelectedCountryRef.current = setSelectedCountry;
  }, [setSelectedCountry]);

  useEffect(() => {
    selectedCountryRef.current = selectedCountry;
  }, [selectedCountry]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("country");
    const normalized = raw ? normalizeCountryCode(raw) : null;
    if (normalized) {
      setSelectedCountryRef.current(normalized);
    }
    // Only apply once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolveDockSideForCountry = useCallback(
    (countryCode: string | null, fallbackLng?: number): "left" | "right" => {
      let side: "left" | "right" = "left";
      let reason = "default";
      let avgLon: number | null = null;

      if (countryCode) {
        const labelEntries = countryLabelCandidatesRef.current.filter((entry) => entry.key === countryCode);
        if (labelEntries.length > 0) {
          const sumLon = labelEntries.reduce((acc, entry) => acc + (Number.isFinite(entry.lon) ? entry.lon : 0), 0);
          const countLon = labelEntries.reduce((acc, entry) => (Number.isFinite(entry.lon) ? acc + 1 : acc), 0);
          avgLon = countLon > 0 ? sumLon / countLon : NaN;
          if (Number.isFinite(avgLon)) {
            side = oppositeDockSideForLng(avgLon);
            reason = "labels";
          }
        }
      }

      if (reason === "default" && typeof fallbackLng === "number" && Number.isFinite(fallbackLng)) {
        side = oppositeDockSideForLng(fallbackLng);
        reason = "fallbackLng";
      }

      return side;
    },
    []
  );

  useEffect(() => {
    if (!selectedCountry) return;
    const resolvedDockSide = resolveDockSideForCountry(selectedCountry);
    setDockSide(resolvedDockSide);
  }, [countryGeometryVersion, resolveDockSideForCountry, selectedCountry]);

  const countryByArticleId = useMemo(() => {
    const byId = new Map<string, string>();
    for (const article of feedItems) {
      const normalized = normalizeCountryCode(article.country);
      if (normalized) byId.set(article.id, normalized);
    }
    return byId;
  }, [feedItems]);

  const resolveCountryFromLatLon = useCallback(async (lat: number, lon: number): Promise<string | null> => {
    const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    const now = Date.now();
    const cached = reverseLookupCacheRef.current.get(key);
    if (cached && cached.expiresAt > now) return cached.value;
    if (cached && cached.expiresAt <= now) {
      reverseLookupCacheRef.current.delete(key);
    }

    const putCache = (value: string | null, ttlMs: number) => {
      reverseLookupCacheRef.current.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
      });
    };

    const fetchWithTimeout = async (url: string, timeoutMs: number) => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(url, { cache: "no-store", signal: controller.signal });
      } finally {
        window.clearTimeout(timeout);
      }
    };

    if (hasMapTilerKey) {
      try {
        const maptilerUrl =
          `https://api.maptiler.com/geocoding/${lon.toFixed(6)},${lat.toFixed(6)}.json` +
          `?types=country&limit=1&key=${encodeURIComponent(mapTilerKey)}`;
        const fallbackRes = await fetchWithTimeout(maptilerUrl, 2_000);
        if (fallbackRes.ok) {
          const fallbackPayload = (await fallbackRes.json()) as ReverseMapTilerPayload;
          const feature = fallbackPayload.features?.[0];
          const normalized = normalizeCountryCode(
            feature?.properties?.short_code ??
              feature?.properties?.country_code ??
              feature?.text ??
              feature?.place_name ??
              null
          );
          if (normalized) {
            putCache(normalized, COUNTRY_CACHE_TTL_MS);
            return normalized;
          }
        }
      } catch {
        // continue to server-side reverse fallback below
      }
    }

    try {
      const params = new URLSearchParams({
        lat: lat.toFixed(6),
        lon: lon.toFixed(6),
      });
      const res = await fetchWithTimeout(`/api/news/nominatim?${params.toString()}`, 3_500);
      if (res.ok) {
        const payload = (await res.json()) as ReverseNominatimPayload;
        const normalized = normalizeCountryCode(payload.result?.countryCode ?? payload.result?.country ?? null);
        if (normalized) {
          putCache(normalized, COUNTRY_CACHE_TTL_MS);
          return normalized;
        }
      }
    } catch {
      // ignore and return null below
    }

    putCache(null, NULL_CACHE_TTL_MS);
    return null;
  }, [hasMapTilerKey, mapTilerKey]);

  const handleMapCountryClick = useCallback(
    async (lat: number, lon: number) => {
      const requestId = ++reverseLookupRequestIdRef.current;
      const nextDockSide = resolveDockSideForCountry(null, lon);
      setDockSide(nextDockSide);
      const countryCode = await resolveCountryFromLatLon(lat, lon);
      if (requestId !== reverseLookupRequestIdRef.current) return;
      if (countryCode) {
        const resolvedDockSide = resolveDockSideForCountry(countryCode, lon);
        setDockSide(resolvedDockSide);
        setSelectedCountryRef.current(countryCode);
      }
    },
    [resolveCountryFromLatLon, resolveDockSideForCountry]
  );

  const applyCountryHoverStyle = useCallback((countryCode: string | null) => {
    const prev = hoveredCountryIsoRef.current;
    if (prev === countryCode) return;

    if (prev) {
      const prevLayers = countryLayersByIsoRef.current.get(prev) ?? [];
      for (const layer of prevLayers) {
        layer.setStyle(COUNTRY_BASE_STYLE);
      }
    }

    if (countryCode) {
      const nextLayers = countryLayersByIsoRef.current.get(countryCode) ?? [];
      for (const layer of nextLayers) {
        layer.setStyle(COUNTRY_HOVER_STYLE);
      }
    }

    hoveredCountryIsoRef.current = countryCode;
  }, []);

  const countryLabelFromCode = useCallback((countryCode: string): string => {
    if (!regionDisplayRef.current) {
      try {
        regionDisplayRef.current = new Intl.DisplayNames(["en"], { type: "region" });
      } catch {
        regionDisplayRef.current = null;
      }
    }
    const label = regionDisplayRef.current?.of(countryCode);
    return label && label !== countryCode ? label : countryCode;
  }, []);

  const notifyReady = useCallback(() => {
    if (readyNotifiedRef.current) return;
    readyNotifiedRef.current = true;
    onReadyRef.current?.();
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!mapCanvasRef.current || mapRef.current) return undefined;

    const initMap = async () => {
      const L = await import("leaflet");
      if (cancelled || !mapCanvasRef.current || mapRef.current) return;

      leafletRef.current = L;
      hasLoadedTileRef.current = false;
      setTileLoadError(false);

      const map = L.map(mapCanvasRef.current, {
        center: MAP_DEFAULT_CENTER,
        zoom: MAP_DEFAULT_ZOOM,
        minZoom: MAP_ABSOLUTE_MIN_ZOOM,
        maxZoom: MAP_MAX_ZOOM,
        maxBounds: MAP_WORLD_BOUNDS,
        maxBoundsViscosity: 1,
        zoomControl: false,
        worldCopyJump: false,
      }) as ManagedLeafletMap;
      mapRef.current = map;
      map.attributionControl.setPrefix("");
      if (!map.getPane("wv-country-fill")) {
        const pane = map.createPane("wv-country-fill");
        pane.style.zIndex = "420";
      }
      if (!map.getPane("wv-country-labels")) {
        const pane = map.createPane("wv-country-labels");
        pane.style.zIndex = "1000";
      }

      const tileLayer = L.tileLayer(CARTO_DARK_NOLABELS_TEMPLATE, {
        subdomains: "abc",
        minZoom: MAP_ABSOLUTE_MIN_ZOOM,
        maxZoom: MAP_MAX_ZOOM,
        noWrap: true,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions/" target="_blank" rel="noreferrer">CARTO</a>',
      });

      tileLayer.on("tileerror", () => {
        if (cancelled || hasLoadedTileRef.current) return;
        setTileLoadError(true);
      });
      tileLayer.on("tileload", () => {
        if (cancelled) return;
        hasLoadedTileRef.current = true;
        setTileLoadError(false);
      });
      tileLayer.on("load", () => {
        if (cancelled) return;
        hasLoadedTileRef.current = true;
        setTileLoadError(false);
        notifyReady();
      });

      tileLayer.addTo(map);
      markerLayerRef.current = L.layerGroup().addTo(map);
      countryLabelLayerRef.current = L.layerGroup().addTo(map);
      countryLabelMarkersRef.current.clear();
      countryLabelCandidatesRef.current = [];

      try {
        const countriesRes = await fetch(COUNTRY_GEOJSON_URL, { cache: "force-cache" });
        if (!countriesRes.ok || cancelled) {
          throw new Error(`countries-status:${countriesRes.status}`);
        }
        const countriesGeoJson = (await countriesRes.json()) as unknown;
        if (cancelled) return;

        const byIso = new Map<string, Path[]>();
        const labelCandidates: Array<{ key: string; name: string; rank: number; lat: number; lon: number }> = [];
        const labelIconCache = new Map<string, DivIcon>();

        const countryLayer = L.geoJSON(countriesGeoJson as never, {
          style: () => COUNTRY_BASE_STYLE,
          interactive: true,
          bubblingMouseEvents: false,
          pane: "wv-country-fill",
          onEachFeature: (feature, layer) => {
            const props = (feature as { properties?: CountryFeatureProps } | undefined)?.properties;
            const iso = countryCodeFromProps(props);
            if (!iso) return;

            const label = countryLabelFromProps(props) ?? countryLabelFromCode(iso);
            const path = layer as unknown as Path;
            const existingLayers = byIso.get(iso);
            if (existingLayers) existingLayers.push(path);
            else byIso.set(iso, [path]);

            const rank = countryLabelRankFromProps(props);
            const withBounds = layer as unknown as { getBounds?: () => { getCenter: () => { lat: number; lng: number } } };
            const bounds = withBounds.getBounds?.();
            if (bounds) {
              const center = bounds.getCenter();
              labelCandidates.push({
                key: iso,
                name: label,
                rank,
                lat: center.lat,
                lon: center.lng,
              });
            }

            layer.on("mouseover", () => {
              applyCountryHoverStyle(iso);
            });

            layer.on("mouseout", () => {
              if (hoveredCountryIsoRef.current === iso) {
                applyCountryHoverStyle(null);
              }
            });

            layer.on("click", (event: LeafletMouseEvent) => {
              suppressMapClickRef.current = true;
              L.DomEvent.stopPropagation(event);
              const resolvedDockSide = resolveDockSideForCountry(iso, event.latlng.lng);
              setDockSide(resolvedDockSide);
              setSelectedCountryRef.current(iso);
              window.setTimeout(() => {
                suppressMapClickRef.current = false;
              }, 0);
            });
          },
        });

        countryLayer.addTo(map);
        countryLayerRef.current = countryLayer;
        countryLayersByIsoRef.current = byIso;
        countryLabelCandidatesRef.current = labelCandidates;
        setCountryGeometryVersion((v) => v + 1);

        const renderCountryLabels = () => {
          const labelLayer = countryLabelLayerRef.current;
          if (!labelLayer) return;
          const rawVisible = countryLabelCandidatesRef.current
            .filter((entry) => entry.rank <= COUNTRY_FIXED_MAX_RANK)
            .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
            .slice(0, MAX_COUNTRY_LABELS);

          // Build a static, collision-aware country label set once.
          const nextVisible: typeof rawVisible = [];
          const placed: Array<{ x: number; y: number }> = [];
          for (const entry of rawVisible) {
            const p = map.latLngToContainerPoint([entry.lat, entry.lon]);
            let overlaps = false;
            for (const prev of placed) {
              const dx = p.x - prev.x;
              const dy = p.y - prev.y;
              if (dx * dx + dy * dy < COUNTRY_LABEL_MIN_DISTANCE_PX * COUNTRY_LABEL_MIN_DISTANCE_PX) {
                overlaps = true;
                break;
              }
            }
            if (overlaps) continue;
            placed.push({ x: p.x, y: p.y });
            nextVisible.push(entry);
          }

          const keep = new Set(nextVisible.map((entry) => entry.key));
          const removeKeys: string[] = [];
          countryLabelMarkersRef.current.forEach((marker, key) => {
            if (keep.has(key)) return;
            labelLayer.removeLayer(marker);
            removeKeys.push(key);
          });
          for (const key of removeKeys) {
            countryLabelMarkersRef.current.delete(key);
          }

          for (const entry of nextVisible) {
            if (countryLabelMarkersRef.current.has(entry.key)) continue;
            let icon = labelIconCache.get(entry.name);
            if (!icon) {
              icon = L.divIcon({
                className: "wv-news-map-country-label",
                html: `<span>${entry.name}</span>`,
                iconSize: undefined,
              });
              labelIconCache.set(entry.name, icon);
            }
            const marker = L.marker([entry.lat, entry.lon], {
              pane: "wv-country-labels",
              icon,
              interactive: false,
              keyboard: false,
            });
            marker.addTo(labelLayer);
            countryLabelMarkersRef.current.set(entry.key, marker);
          }
        };

        renderCountryLabels();
      } catch {
        countryLayerRef.current = null;
        countryLayersByIsoRef.current.clear();
        countryLabelCandidatesRef.current = [];
      }

      const worldBounds = L.latLngBounds(MAP_WORLD_BOUNDS);
      const syncMinZoomToViewport = () => {
        // Clamp zoom-out to the fitted world extent so the map border remains at world limits.
        const fitZoomRaw = map.getBoundsZoom(worldBounds, true);
        const fitZoom = Number.isFinite(fitZoomRaw)
          ? Math.max(MAP_ABSOLUTE_MIN_ZOOM, Math.min(MAP_MAX_ZOOM, fitZoomRaw))
          : MAP_ABSOLUTE_MIN_ZOOM;

        map.setMinZoom(fitZoom);
        if (map.getZoom() < fitZoom) {
          map.setZoom(fitZoom, { animate: false });
        }
        map.panInsideBounds(worldBounds, { animate: false });
      };

      syncMinZoomToViewport();
      map.on("click", (event) => {
        if (suppressMapClickRef.current) return;
        void handleMapCountryClick(event.latlng.lat, event.latlng.lng);
      });
      map.on("moveend", () => {
        if (!selectedCountryRef.current) return;
        const resolvedDockSide = resolveDockSideForCountry(selectedCountryRef.current);
        setDockSide(resolvedDockSide);
      });
      map.on("zoomend", () => {
        if (!selectedCountryRef.current) return;
        const resolvedDockSide = resolveDockSideForCountry(selectedCountryRef.current);
        setDockSide(resolvedDockSide);
      });
      map.on("mouseout", () => {
        applyCountryHoverStyle(null);
      });

      const resizeObserver = new ResizeObserver(() => {
        map.invalidateSize({ pan: false, animate: false });
        syncMinZoomToViewport();
      });
      if (mapContainerRef.current) resizeObserver.observe(mapContainerRef.current);
      map.__wvResizeObserver = resizeObserver;
    };

    void initMap();

    return () => {
      cancelled = true;

      if (mapRef.current?.__wvResizeObserver) {
        mapRef.current.__wvResizeObserver.disconnect();
      }
      mapRef.current?.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      countryLayerRef.current = null;
      countryLabelLayerRef.current = null;
      countryLayersByIsoRef.current.clear();
      countryLabelCandidatesRef.current = [];
      countryLabelMarkersRef.current.clear();
      hoveredCountryIsoRef.current = null;
      leafletRef.current = null;
      suppressMapClickRef.current = false;
      reverseLookupRequestIdRef.current = 0;
      hasLoadedTileRef.current = false;
    };
  }, [applyCountryHoverStyle, countryLabelFromCode, handleMapCountryClick, notifyReady, resolveDockSideForCountry]);

  useEffect(() => {
    const L = leafletRef.current;
    const markerLayer = markerLayerRef.current;
    if (!L || !markerLayer) return;

    markerLayer.clearLayers();

    for (const marker of markers) {
      if (!Number.isFinite(marker.lat) || !Number.isFinite(marker.lon)) continue;

      const circle = L.circleMarker([marker.lat, marker.lon], {
        radius: markerRadius(marker),
        fillColor: markerColor(marker),
        color: markerColor(marker),
        weight: 0.75,
        opacity: 0.7,
        fillOpacity: 0.9,
      });

      circle.on("click", (event) => {
        suppressMapClickRef.current = true;
        L.DomEvent.stopPropagation(event);
        setDockSide(resolveDockSideForCountry(null, marker.lon));
        const countryCode = countryByArticleId.get(marker.articleId) ?? null;
        if (countryCode) {
          setDockSide(resolveDockSideForCountry(countryCode, marker.lon));
          setSelectedCountryRef.current(countryCode);
        }
        window.setTimeout(() => {
          suppressMapClickRef.current = false;
        }, 0);
      });

      circle.addTo(markerLayer);
    }
  }, [countryByArticleId, markers, resolveDockSideForCountry]);

  const handleZoomIn = useCallback(() => {
    mapRef.current?.zoomIn();
  }, []);

  const handleZoomOut = useCallback(() => {
    mapRef.current?.zoomOut();
  }, []);

  const showMapError = tileLoadError;
  const mapErrorTitle = "MAP TILES UNAVAILABLE";
  const mapErrorBody = "Unable to load OpenStreetMap/CARTO tiles right now. Check network connectivity and retry.";

  return (
    <div ref={mapContainerRef} className="wv-news-map-container">
      <div ref={mapCanvasRef} className="wv-news-map-canvas" />

      {showMapError ? (
        <div className="wv-news-map-overlay-error" role="status" aria-live="polite">
          <strong className="wv-news-map-overlay-error-title">{mapErrorTitle}</strong>
          <span className="wv-news-map-overlay-error-text">{mapErrorBody}</span>
        </div>
      ) : null}

      <div className="wv-news-map-zoom">
        <button type="button" onClick={handleZoomIn} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={handleZoomOut} aria-label="Zoom out">
          -
        </button>
      </div>

      <div className="wv-news-map-legend">
        <span className="wv-news-map-legend-title">LEGEND</span>
        {THREAT_LEGEND.map((item) => (
          <span key={item.label} className="wv-news-map-legend-item">
            <span className="wv-news-map-legend-dot" style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>

      {selectedCountry && (
        <CountryDetailModal
          countryCode={selectedCountry}
          dockSide={dockSide}
          onClose={() => setSelectedCountry(null)}
        />
      )}
    </div>
  );
}
