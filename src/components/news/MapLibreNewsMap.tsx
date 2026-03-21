"use client";

// Pre-warm the maplibre-gl module so the dynamic import inside useEffect resolves
// from cache rather than incurring the full network + parse cost at mount time.
if (typeof window !== "undefined") {
  void import("maplibre-gl");
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getOrFetchCountryBorders } from "../../lib/maps/countryBordersCache";
import { normalizeCountryCode } from "../../lib/news/countryCode";
import { perfMark } from "../../lib/news/perf";
import type { GeoMarker, NewsCameraBounds } from "../../lib/news/types";
import CountryDetailModal from "./CountryDetailModal";
import MapDotDetailPanel, { type DotDetailData } from "./MapDotDetailPanel";
import HotspotDetailCard, {
  hotspotDetailFromProps,
  type HotspotDetailData,
  type HotspotTimeWindow,
} from "./HotspotDetailCard";
import NuclearSiteDetailCard, {
  type NuclearSiteDetailData,
} from "./NuclearSiteDetailCard";
import ArmsEmbargoZoneDetailCard, {
  type ArmsEmbargoZoneDetailData,
} from "./ArmsEmbargoZoneDetailCard";
import ConflictZoneDetailCard, {
  type ConflictZoneDetailData,
} from "./ConflictZoneDetailCard";
import { propsToConflictZoneDetail } from "../../lib/server/news/conflictZones/types";
import UcdpEventDetailCard, {
  type UcdpEventDetailData,
} from "./UcdpEventDetailCard";
import SanctionsEntityDetailCard, {
  type SanctionsEntityDetailData,
} from "./SanctionsEntityDetailCard";
import CriticalMineralDetailCard, {
  type CriticalMineralDetailData,
} from "./CriticalMineralDetailCard";
import EconomicCenterDetailCard, {
  type EconomicCenterDetailData,
} from "./EconomicCenterDetailCard";
import AiDataCenterDetailCard, {
  type AiDataCenterDetailData,
} from "./AiDataCenterDetailCard";
import AiDataCenterSummaryPanel, {
  type AiDataCenterClusterSummary,
} from "./AiDataCenterSummaryPanel";
import UcdpSummaryPanel, { type UcdpSummaryMeta } from "./UcdpSummaryPanel";
import { aggregateUcdpStats, type UcdpAggregatedStats } from "../../lib/ucdp/aggregation";
import { generateUcdpSummary, type UcdpSummaryInput } from "../../lib/ucdp/summarizer";
import { useSIGINTStore, type ArmsEmbargoFilters, type ConflictFilters, type UcdpFilters, type EconomicCenterFilters } from "../../store";
import Toggle from "../dashboard/controls/Toggle";
import { applyConflictZoneFilters } from "../../lib/newsLayers/conflictZoneFilters";
import { NEWS_LAYER_REGISTRY, NEWS_LAYER_REGISTRY_BY_ID } from "../../lib/newsLayers/registry";
import { validateLayerRegistry } from "../../lib/newsLayers/validation";
import { NewsLayerRuntime } from "../../lib/newsLayers/runtime";
import { maplibreRenderer } from "../../lib/newsLayers/renderers/maplibreRenderer";
import type { LayerFeatureCollection, LayerHealthState, LayerRegistryEntry } from "../../lib/newsLayers/types";
import { useIsMobile } from "../../hooks/useIsMobile";

interface MapLibreNewsMapProps {
  onReady?: () => void;
  onFatalError?: (reason: string) => void;
}

type MapLibreModule = typeof import("maplibre-gl");
type MapInstance = import("maplibre-gl").Map;

const MAP_DEFAULT_CENTER: [number, number] = [10, 20];
const MAP_DEFAULT_ZOOM = 1.8;
const MAP_MAX_ZOOM = 8;
const MAP_MIN_ZOOM = 1;

const COUNTRY_GEOJSON_URL = "/data/ne_50m_admin_0_countries.geojson";

type NuclearFilters = {
  types: string[];
  statuses: string[];
  searchText: string;
  inViewportOnly: boolean;
};

function applyNuclearFilters(
  data: LayerFeatureCollection,
  filters: NuclearFilters | null | undefined,
  cameraBounds: NewsCameraBounds | null
): LayerFeatureCollection {
  if (!filters) return data;
  const search = filters.searchText.trim().toLowerCase();
  const hasSearch = search.length > 0;

  const filtered = data.features.filter((feature) => {
    const coords =
      feature.geometry.type === "Point"
        ? (feature.geometry.coordinates as [number, number])
        : null;
    const lon = coords ? Number(coords[0]) : NaN;
    const lat = coords ? Number(coords[1]) : NaN;

    if (filters.inViewportOnly && cameraBounds) {
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        lon < cameraBounds.west ||
        lon > cameraBounds.east ||
        lat < cameraBounds.south ||
        lat > cameraBounds.north
      ) {
        return false;
      }
    }

    const props = feature.properties as Record<string, unknown>;
    const type = String(props.type ?? "").trim();
    const status = String(props.status ?? "").trim();

    if (filters.types.length && !filters.types.includes(type)) return false;
    if (filters.statuses.length && !filters.statuses.includes(status)) return false;

    if (hasSearch) {
      const name = String(props.name ?? "").toLowerCase();
      const operator = String(props.operator ?? "").toLowerCase();
      const country = String(props.country ?? "").toLowerCase();
      const admin1 = String(props.admin1 ?? "").toLowerCase();
      const sourceIds = (props.sourceIds ?? {}) as Record<string, unknown>;
      const qid = String(sourceIds.wikidataQid ?? "").toLowerCase();

      const haystack = `${name} ${operator} ${country} ${admin1} ${qid}`;
      if (!haystack.includes(search)) return false;
    }

    return true;
  });

  return {
    type: "FeatureCollection",
    features: filtered,
  };
}

function applyArmsEmbargoFilters(
  data: LayerFeatureCollection,
  filters: ArmsEmbargoFilters | null | undefined,
  cameraBounds: NewsCameraBounds | null
): LayerFeatureCollection {
  if (!filters) return data;
  const search = filters.searchText.trim().toLowerCase();
  const hasSearch = search.length > 0;

  const filtered = data.features.filter((feature) => {
    const props = feature.properties as Record<string, unknown>;

    if (filters.inViewportOnly && cameraBounds) {
      const centLon = Number(props.centroidLon ?? NaN);
      const centLat = Number(props.centroidLat ?? NaN);
      if (
        !Number.isFinite(centLat) ||
        !Number.isFinite(centLon) ||
        centLon < cameraBounds.west ||
        centLon > cameraBounds.east ||
        centLat < cameraBounds.south ||
        centLat > cameraBounds.north
      ) {
        return false;
      }
    }

    const status = String(props.status ?? "");
    const scope = String(props.scope ?? "");

    if (filters.statuses.length && !filters.statuses.includes(status)) return false;
    if (filters.scopes.length && !filters.scopes.includes(scope)) return false;

    // Parse programmes JSON once per feature instead of up to 3 times.
    const needsProgrammes = filters.authorities.length > 0 || !!filters.startYearRange || hasSearch;
    let programmes: any[] | null = null;
    if (needsProgrammes) {
      try {
        programmes = typeof props.programmes === "string" ? JSON.parse(props.programmes) : [];
      } catch { programmes = []; }
    }

    if (filters.authorities.length && programmes) {
      const hasMatchingAuthority = programmes.some(
        (p: any) => filters.authorities.includes(p.authority)
      );
      if (!hasMatchingAuthority) return false;
    }

    if (filters.startYearRange && programmes) {
      const years = programmes
        .map((p: any) => p.startDate ? new Date(p.startDate).getFullYear() : NaN)
        .filter(Number.isFinite);
      const earliest = years.length ? Math.min(...years) : NaN;
      if (Number.isFinite(earliest)) {
        const [minY, maxY] = filters.startYearRange;
        if (earliest < minY || earliest > maxY) return false;
      }
    }

    if (hasSearch) {
      const countryLabel = String(props.countryLabel ?? "").toLowerCase();
      const countryCode = String(props.countryCode ?? "").toLowerCase();
      const progNames = (programmes ?? [])
        .map((p: any) => `${p.name ?? ""} ${p.legalBasis ?? ""}`)
        .join(" ")
        .toLowerCase();
      const haystack = `${countryLabel} ${countryCode} ${progNames}`;
      if (!haystack.includes(search)) return false;
    }

    return true;
  });

  return { type: "FeatureCollection", features: filtered };
}

function applyUcdpFilters(
  data: LayerFeatureCollection,
  filters: UcdpFilters | null | undefined,
  cameraBounds: NewsCameraBounds | null
): LayerFeatureCollection {
  if (!filters) return data;

  const filtered = data.features.filter((feature) => {
    const props = feature.properties as Record<string, unknown>;

    if (filters.inViewportOnly && cameraBounds) {
      const lon = Number(props.lon ?? NaN);
      const lat = Number(props.lat ?? NaN);
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        lon < cameraBounds.west ||
        lon > cameraBounds.east ||
        lat < cameraBounds.south ||
        lat > cameraBounds.north
      ) {
        return false;
      }
    }

    const vt = String(props.violenceType ?? "");
    if (filters.violenceTypes.length && !filters.violenceTypes.includes(vt)) return false;

    const fb = Number(props.fatalities_best ?? 0);
    if (fb < filters.minFatalities) return false;

    if (filters.countries.length) {
      const c = String(props.country ?? "");
      if (!filters.countries.includes(c)) return false;
    }

    return true;
  });

  return { type: "FeatureCollection", features: filtered };
}

function applyEconomicCenterFilters(
  data: LayerFeatureCollection,
  filters: EconomicCenterFilters | null | undefined,
  cameraBounds: NewsCameraBounds | null
): LayerFeatureCollection {
  if (!filters) return data;
  const search = filters.searchText.trim().toLowerCase();
  const hasSearch = search.length > 0;

  const filtered = data.features.filter((feature) => {
    const props = feature.properties as Record<string, unknown>;
    const coords =
      feature.geometry.type === "Point"
        ? (feature.geometry.coordinates as [number, number])
        : null;
    const lon = coords ? Number(coords[0]) : NaN;
    const lat = coords ? Number(coords[1]) : NaN;

    // Viewport filter
    if (filters.viewportOnly && cameraBounds) {
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        lon < cameraBounds.west ||
        lon > cameraBounds.east ||
        lat < cameraBounds.south ||
        lat > cameraBounds.north
      ) {
        return false;
      }
    }

    // Score threshold
    const score = Number(props.scoreTotal ?? 0);
    if (score < filters.scoreThreshold) return false;

    // Region filter (country name partial match)
    if (filters.regionFilter.length > 0) {
      const country = String(props.country ?? "").toLowerCase();
      if (!filters.regionFilter.some((r) => country.includes(r.toLowerCase()))) return false;
    }

    // Search text
    if (hasSearch) {
      const name = String(props.name ?? "").toLowerCase();
      const country = String(props.country ?? "").toLowerCase();
      const admin1 = String(props.admin1 ?? "").toLowerCase();
      if (![name, country, admin1].some((f) => f.includes(search))) return false;
    }

    return true;
  });

  return { type: "FeatureCollection", features: filtered };
}

function buildMilitaryBaseDetail(
  feature: GeoJSON.Feature,
  event: any
): DotDetailData | null {
  if (!feature || feature.geometry?.type !== "Point") return null;
  const coords = feature.geometry.coordinates as number[] | undefined;
  const lon =
    Array.isArray(coords) && coords.length >= 2 ? Number(coords[0]) : event.lngLat?.lng;
  const lat =
    Array.isArray(coords) && coords.length >= 2 ? Number(coords[1]) : event.lngLat?.lat;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const props = (feature.properties ?? {}) as Record<string, unknown>;
  const nameValue = props.name;
  const baseName =
    typeof nameValue === "string" && nameValue.trim() ? nameValue.trim() : "Military Base";

  const akaRaw = props.aka;
  const sponsorRaw = props.sponsor;
  const originRaw = props.origin;
  const summaryRaw = props.summary;

  const fields: DotDetailData["fields"] = [];
  if (typeof akaRaw === "string" && akaRaw.trim()) {
    fields.push({ label: "ALSO KNOWN AS", value: akaRaw.trim() });
  }
  if (typeof sponsorRaw === "string" && sponsorRaw.trim()) {
    fields.push({ label: "SPONSOR", value: sponsorRaw.trim() });
  }
  if (typeof originRaw === "string" && originRaw.trim()) {
    fields.push({ label: "ORIGIN", value: originRaw.trim() });
  }
  if (typeof summaryRaw === "string" && summaryRaw.trim()) {
    fields.push({ label: "PROFILE", value: summaryRaw.trim() });
  }
  fields.push({ label: "LOC", value: `${lat.toFixed(3)}, ${lon.toFixed(3)}` });
  fields.push({ label: "SOURCE", value: "SIGINT Military Bases snapshot" });

  return {
    layerId: "military-bases",
    layerType: "MILITARY BASE",
    title: baseName,
    fields,
    lat,
    lon,
    uid: `${lat}_${lon}_${Date.now()}`,
  };
}

/** Returns all MapLibre GL layer IDs that maplibreRenderer creates for a given registry layer. */
function getMaplibreLayerIds(layerId: string, type: LayerRegistryEntry["type"]): string[] {
  const prefix = `si-news-layer-${layerId}`;
  if (layerId === "trade-routes") {
    return [`${prefix}-glow`, `${prefix}-line`, `${prefix}-label`];
  }
  if (layerId === "trade-route-nodes") {
    return [`${prefix}-hub`, `${prefix}-choke`, `${prefix}-label`];
  }
  if (layerId === "ai-data-centers") {
    return [`${prefix}-halo`, `${prefix}-circle`, `${prefix}-label`, `${prefix}-cluster`, `${prefix}-cluster-count`];
  }
  if (type === "geojsonPoints" || type === "dynamicEntities") {
    return [`${prefix}-circle`, `${prefix}-cluster`, `${prefix}-cluster-count`];
  }
  if (type === "geojsonPolygons") {
    return [`${prefix}-fill`, `${prefix}-line`];
  }
  return [prefix]; // geojsonLines, rasterTiles, heatmap
}

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

export default function MapLibreNewsMap({ onReady, onFatalError }: MapLibreNewsMapProps) {
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const maplibreRef = useRef<MapLibreModule | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const runtimeRef = useRef<NewsLayerRuntime | null>(null);
  const mountedLayersRef = useRef<Set<string>>(new Set());
  const layerDataRef = useRef<Map<string, LayerFeatureCollection>>(new Map());
  const mapReadyRef = useRef(false);
  const mapDestroyedRef = useRef(false);
  const dotDetailRef = useRef<DotDetailData | null>(null);
  const hotspotDetailRef = useRef<HotspotDetailData | null>(null);
   const nuclearDetailRef = useRef<NuclearSiteDetailData | null>(null);
  const economicCenterDetailRef = useRef<EconomicCenterDetailData | null>(null);
  const aiDataCenterDetailRef = useRef<AiDataCenterDetailData | null>(null);
  const suppressCountryClickRef = useRef(false);

  const markers = useSIGINTStore((s) => s.news.markers);
  const feedItems = useSIGINTStore((s) => s.news.feedItems);
  const selectedCountry = useSIGINTStore((s) => s.news.selectedCountry);
  const layerToggles = useSIGINTStore((s) => s.news.layerToggles);
  const layerHealth = useSIGINTStore((s) => s.news.layerHealth);
  const nuclearFilters = useSIGINTStore((s) => s.news.nuclearFilters);
  const armsEmbargoFilters = useSIGINTStore((s) => s.news.armsEmbargoFilters);
  const ucdpFilters = useSIGINTStore((s) => s.news.ucdpFilters);
  const conflictFilters = useSIGINTStore((s) => s.news.conflictFilters);
  const economicCenterFilters = useSIGINTStore((s) => s.news.economicCenterFilters);
  const cameraBounds = useSIGINTStore((s) => s.news.cameraBounds);
  const nuclearLayerEnabled = layerToggles["nuclear-sites"] ?? false;
  const armsEmbargoLayerEnabled = layerToggles["arms-embargo-zones"] ?? false;
  const conflictZoneLayerEnabled = layerToggles["conflict-zones"] ?? false;
  const ucdpLayerEnabled = layerToggles["ucdp-events"] ?? false;
  const economicCenterLayerEnabled = layerToggles["economic-centers"] ?? false;
  const setSelectedCountry = useSIGINTStore((s) => s.setSelectedCountry);
  const setNewsLayerToggle = useSIGINTStore((s) => s.setNewsLayerToggle);
  const setNewsLayerHealth = useSIGINTStore((s) => s.setNewsLayerHealth);
  const setNewsCameraBounds = useSIGINTStore((s) => s.setNewsCameraBounds);
  const setNuclearFilters = useSIGINTStore((s) => s.setNuclearFilters);
  const setArmsEmbargoFilters = useSIGINTStore((s) => s.setArmsEmbargoFilters);
  const setUcdpFilters = useSIGINTStore((s) => s.setUcdpFilters);
  const setConflictFilters = useSIGINTStore((s) => s.setConflictFilters);
  const setEconomicCenterFilters = useSIGINTStore((s) => s.setEconomicCenterFilters);
  const [mapReady, setMapReady] = useState(false);
  const [mobileLayersOpen, setMobileLayersOpen] = useState(false);
  const [dockSide, setDockSide] = useState<"left" | "right">("left");
  const [dotDetail, setDotDetail] = useState<DotDetailData | null>(null);
  const [hotspotDetail, setHotspotDetail] = useState<HotspotDetailData | null>(null);
  const [nuclearDetail, setNuclearDetail] = useState<NuclearSiteDetailData | null>(null);
  const [armsEmbargoDetail, setArmsEmbargoDetail] = useState<ArmsEmbargoZoneDetailData | null>(null);
  const armsEmbargoDetailRef = useRef<ArmsEmbargoZoneDetailData | null>(null);
  const [conflictZoneDetail, setConflictZoneDetail] = useState<ConflictZoneDetailData | null>(null);
  const conflictZoneDetailRef = useRef<ConflictZoneDetailData | null>(null);
  const [ucdpDetail, setUcdpDetail] = useState<UcdpEventDetailData | null>(null);
  const ucdpDetailRef = useRef<UcdpEventDetailData | null>(null);
  const [sanctionsDetail, setSanctionsDetail] = useState<SanctionsEntityDetailData | null>(null);
  const sanctionsDetailRef = useRef<SanctionsEntityDetailData | null>(null);
  const criticalMineralDetailRef = useRef<CriticalMineralDetailData | null>(null);
  const [criticalMineralDetail, setCriticalMineralDetail] = useState<CriticalMineralDetailData | null>(null);
  const [economicCenterDetail, setEconomicCenterDetail] = useState<EconomicCenterDetailData | null>(null);
  const [aiDataCenterDetail, setAiDataCenterDetail] = useState<AiDataCenterDetailData | null>(null);
  const [ucdpStats, setUcdpStats] = useState<UcdpAggregatedStats | null>(null);
  const [ucdpMeta, setUcdpMeta] = useState<UcdpSummaryMeta | null>(null);
  const [ucdpHeatmap, setUcdpHeatmap] = useState(false);
  const [ucdpBriefing, setUcdpBriefing] = useState<string | null>(null);
  const [ucdpBriefingLoading, setUcdpBriefingLoading] = useState(false);
  const [ucdpBriefingDegraded, setUcdpBriefingDegraded] = useState(false);
  const [nuclearSourceStatus, setNuclearSourceStatus] = useState<
    Record<string, "live" | "cached" | "degraded" | "unavailable"> | null
  >(null);
  const [embargoSourceStatus, setEmbargoSourceStatus] = useState<
    Record<string, "live" | "cached" | "degraded" | "unavailable"> | null
  >(null);
  const [conflictZoneSourceStatus, setConflictZoneSourceStatus] = useState<
    Record<string, "live" | "cached" | "degraded" | "unavailable"> | null
  >(null);
  const [layerSearchQuery, setLayerSearchQuery] = useState("");
  const [intelTimeWindow, setIntelTimeWindow] = useState<HotspotTimeWindow>("24h");
  const [conflictTimeWindow, setConflictTimeWindow] = useState<"6h" | "24h" | "7d" | "30d" | "90d">("7d");
  const [conflictMode, setConflictMode] = useState<"strict" | "broad">("strict");
  const [conflictVerifiedOverlay, setConflictVerifiedOverlay] = useState(false);
  const onReadyRef = useRef(onReady);
  const onFatalErrorRef = useRef(onFatalError);
  const countryByArticleIdRef = useRef<Map<string, string>>(new Map());
  const layerTogglesRef = useRef<Record<string, boolean>>({});
  const nuclearFiltersRef = useRef<typeof nuclearFilters | null>(null);
  const armsEmbargoFiltersRef = useRef<typeof armsEmbargoFilters | null>(null);
  const ucdpFiltersRef = useRef<typeof ucdpFilters | null>(null);
  const conflictFiltersRef = useRef<typeof conflictFilters | null>(null);
  const economicCenterFiltersRef = useRef<typeof economicCenterFilters | null>(null);
  const cameraBoundsRef = useRef<typeof cameraBounds | null>(null);

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
    onFatalErrorRef.current = onFatalError;
  }, [onFatalError]);

  useEffect(() => {
    countryByArticleIdRef.current = countryByArticleId;
  }, [countryByArticleId]);

  useEffect(() => {
    layerTogglesRef.current = layerToggles;
  }, [layerToggles]);

  useEffect(() => {
    if (!dotDetail) return;
    const enabled = layerToggles[dotDetail.layerId] ?? true;
    if (!enabled) {
      dotDetailRef.current = null;
      setDotDetail(null);
    }
  }, [layerToggles, dotDetail]);

  useEffect(() => {
    if (!hotspotDetail) return;
    const enabled = layerToggles["intel-hotspots"] ?? true;
    if (!enabled) {
      hotspotDetailRef.current = null;
      setHotspotDetail(null);
    }
  }, [layerToggles, hotspotDetail]);

  useEffect(() => {
    if (!nuclearDetail) return;
    const enabled = layerToggles["nuclear-sites"] ?? true;
    if (!enabled) {
      nuclearDetailRef.current = null;
      setNuclearDetail(null);
    }
  }, [layerToggles, nuclearDetail]);

  useEffect(() => {
    if (!economicCenterDetail) return;
    const enabled = layerToggles["economic-centers"] ?? true;
    if (!enabled) {
      economicCenterDetailRef.current = null;
      setEconomicCenterDetail(null);
    }
  }, [layerToggles, economicCenterDetail]);

  useEffect(() => {
    if (!aiDataCenterDetail) return;
    const enabled = layerToggles["ai-data-centers"] ?? false;
    if (!enabled) {
      aiDataCenterDetailRef.current = null;
      setAiDataCenterDetail(null);
    }
  }, [layerToggles, aiDataCenterDetail]);

  useEffect(() => {
    if (!sanctionsDetail) return;
    const enabled = layerToggles["sanctions-entities"] ?? true;
    if (!enabled) {
      sanctionsDetailRef.current = null;
      setSanctionsDetail(null);
    }
  }, [layerToggles, sanctionsDetail]);

  useEffect(() => {
    if (!criticalMineralDetail) return;
    const enabled = layerToggles["critical-minerals"] ?? false;
    if (!enabled) {
      criticalMineralDetailRef.current = null;
      setCriticalMineralDetail(null);
    }
  }, [layerToggles, criticalMineralDetail]);

  useEffect(() => {
    if (!conflictZoneDetail) return;
    const enabled = layerToggles["conflict-zones"] ?? true;
    if (!enabled) {
      conflictZoneDetailRef.current = null;
      setConflictZoneDetail(null);
    }
  }, [layerToggles, conflictZoneDetail]);

  useEffect(() => {
    nuclearFiltersRef.current = nuclearFilters ?? null;
  }, [nuclearFilters]);

  useEffect(() => {
    armsEmbargoFiltersRef.current = armsEmbargoFilters ?? null;
  }, [armsEmbargoFilters]);

  useEffect(() => {
    ucdpFiltersRef.current = ucdpFilters ?? null;
  }, [ucdpFilters]);

  useEffect(() => {
    conflictFiltersRef.current = conflictFilters ?? null;
  }, [conflictFilters]);

  useEffect(() => {
    economicCenterFiltersRef.current = economicCenterFilters ?? null;
  }, [economicCenterFilters]);

  useEffect(() => {
    if (!ucdpLayerEnabled) return;
    let cancelled = false;
    fetch("/api/news/layers/ucdp-events/status")
      .then((r) => r.json())
      .then((data: any) => {
        if (cancelled) return;
        setUcdpMeta({
          datasetVersion: String(data.datasetVersion ?? ""),
          releaseDate: String(data.releaseDate ?? ""),
          lastRefresh: Number(data.lastRefreshedAt ?? 0),
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [ucdpLayerEnabled]);

  useEffect(() => {
    if (!ucdpLayerEnabled || !ucdpStats || ucdpStats.eventCount === 0) {
      setUcdpBriefing(null);
      return;
    }
    const version = ucdpMeta?.datasetVersion ?? "";
    const yr = ucdpFilters?.yearRange;
    const input: UcdpSummaryInput = {
      stats: ucdpStats,
      datasetVersion: version,
      timeWindow: yr ? `${yr[0]}–${yr[1]}` : "",
      filters: [
        ucdpFilters?.violenceTypes?.length ? `violence: ${ucdpFilters.violenceTypes.join(",")}` : "",
        ucdpFilters?.minFatalities && ucdpFilters.minFatalities > 1 ? `min fatalities: ${ucdpFilters.minFatalities}` : "",
        ucdpFilters?.countries?.length ? `countries: ${ucdpFilters.countries.join(",")}` : "",
      ].filter(Boolean).join("; ") || "none",
      sampleIsSmall: ucdpStats.eventCount < 20,
    };

    let cancelled = false;
    setUcdpBriefingLoading(true);

    const timer = setTimeout(() => {
      generateUcdpSummary(input)
        .then(({ text, degraded }) => {
          if (cancelled) return;
          setUcdpBriefing(text || null);
          setUcdpBriefingDegraded(degraded);
        })
        .catch(() => {
          if (!cancelled) setUcdpBriefingDegraded(true);
        })
        .finally(() => {
          if (!cancelled) setUcdpBriefingLoading(false);
        });
    }, 1500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ucdpLayerEnabled, ucdpStats, ucdpMeta, ucdpFilters]);

  useEffect(() => {
    cameraBoundsRef.current = cameraBounds ?? null;
  }, [cameraBounds]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("wv:intel-hotspots:timeWindow");
    const value: HotspotTimeWindow = stored === "6h" || stored === "7d" ? stored : "24h";
    setIntelTimeWindow(value);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const tw = window.localStorage.getItem("wv:conflict-zones:timeWindow");
      if (tw === "6h" || tw === "24h" || tw === "7d" || tw === "30d" || tw === "90d") {
        setConflictTimeWindow(tw);
      }
      const mode = window.localStorage.getItem("wv:conflict-zones:mode");
      if (mode === "broad") setConflictMode("broad");
      const verified = window.localStorage.getItem("wv:conflict-zones:verifiedOverlay");
      setConflictVerifiedOverlay(verified === "1" || verified === "true");
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!nuclearLayerEnabled) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/news/layers/nuclear-sites/status", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as {
          sources?: Record<string, { status: "live" | "cached" | "degraded" | "unavailable" }>;
        };
        if (cancelled) return;
        if (body.sources) {
          const simplified: Record<string, "live" | "cached" | "degraded" | "unavailable"> = {};
          for (const [k, v] of Object.entries(body.sources)) {
            if (!v?.status) continue;
            simplified[k] = v.status;
          }
          setNuclearSourceStatus(simplified);
        }
      } catch {
        // no-op
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [nuclearLayerEnabled]);

  useEffect(() => {
    if (!armsEmbargoLayerEnabled) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/news/layers/arms-embargo-zones/status", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as {
          sources?: Record<string, { status: "live" | "cached" | "degraded" | "unavailable" }>;
        };
        if (cancelled) return;
        if (body.sources) {
          const simplified: Record<string, "live" | "cached" | "degraded" | "unavailable"> = {};
          for (const [k, v] of Object.entries(body.sources)) {
            if (!v?.status) continue;
            simplified[k] = v.status;
          }
          setEmbargoSourceStatus(simplified);
        }
      } catch {
        // no-op
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [armsEmbargoLayerEnabled]);

  useEffect(() => {
    if (!conflictZoneLayerEnabled) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/news/layers/conflict-zones/status", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { sources?: Record<string, string> };
        if (cancelled) return;
        if (body.sources) {
          const simplified: Record<string, "live" | "cached" | "degraded" | "unavailable"> = {};
          for (const [k, v] of Object.entries(body.sources)) {
            if (v === "live" || v === "cached" || v === "degraded" || v === "unavailable") {
              simplified[k] = v;
            }
          }
          setConflictZoneSourceStatus(simplified);
        }
      } catch {
        // no-op
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [conflictZoneLayerEnabled]);

  const bringLayerToFront = useCallback(
    (id: string) => {
      const map = mapRef.current as MapInstance | null;
      if (!map) return;
      const anyMap = map as any;
      if (!anyMap.getLayer?.(id)) return;
      try {
        anyMap.moveLayer?.(id);
      } catch {
        // Ignore ordering errors; z-order is a best-effort enhancement.
      }
    },
    []
  );

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
      if (dotDetailRef.current?.layerId === layerId) {
        dotDetailRef.current = null;
        setDotDetail(null);
      }
      if (layerId === "intel-hotspots" && hotspotDetailRef.current) {
        hotspotDetailRef.current = null;
        setHotspotDetail(null);
      }
      if (layerId === "nuclear-sites" && nuclearDetailRef.current) {
        nuclearDetailRef.current = null;
        setNuclearDetail(null);
      }
      if (layerId === "economic-centers" && economicCenterDetailRef.current) {
        economicCenterDetailRef.current = null;
        setEconomicCenterDetail(null);
      }
      if (layerId === "sanctions-entities" && sanctionsDetailRef.current) {
        sanctionsDetailRef.current = null;
        setSanctionsDetail(null);
      }
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
    let fatalErrorNotified = false;

    const init = async () => {
      if (!containerRef.current || mapRef.current) return;
      const notifyFatalError = (reason: string) => {
        if (fatalErrorNotified) return;
        fatalErrorNotified = true;
        onFatalErrorRef.current?.(reason);
      };

      // Pre-fetch country borders in parallel with the MapLibre module load.
      // This overlaps the ~1.7 MB GeoJSON download with the JS bundle parse so
      // the data is ready (or nearly ready) by the time the map fires its 'load' event.
      const countryDataPromise = getOrFetchCountryBorders(COUNTRY_GEOJSON_URL);

      const maplibre = await import("maplibre-gl");
      if (cancelled || !containerRef.current || mapRef.current) return;
      maplibreRef.current = maplibre;

      const markReady = () => {
        if (cancelled || mapReadyRef.current) return;
        mapReadyRef.current = true;
        setMapReady(true);
        onReadyRef.current?.();
      };

      const failAndReady = (reason: string) => {
        notifyFatalError(reason);
        markReady();
      };

      // Safety net: switch to fallback if style/load path stalls.
      safetyTimer = setTimeout(() => failAndReady("timeout"), 15_000);

      // Defer map creation until container has valid dimensions (avoids MapLibre
      // "Cannot read properties of null" when container is zero-sized at mount).
      const tryCreateMap = (): MapInstance | null => {
        const container = containerRef.current;
        if (!container || cancelled) return null;
        const rect = container.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return null;
        const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "";
        const mapStyle = maptilerKey
          ? `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${maptilerKey}`
          : ({
              version: 8 as const,
              glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
              sources: {
                base: {
                  type: "raster" as const,
                  tiles: [
                    "https://a.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}.png",
                    "https://b.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}.png",
                    "https://c.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}.png",
                  ],
                  tileSize: 256,
                },
              },
              layers: [{ id: "base", type: "raster" as const, source: "base" }],
            } as import("maplibre-gl").StyleSpecification);
        try {
          return new maplibre.Map({
            container,
            style: mapStyle,
            center: MAP_DEFAULT_CENTER,
            zoom: MAP_DEFAULT_ZOOM,
            minZoom: MAP_MIN_ZOOM,
            maxZoom: MAP_MAX_ZOOM,
            maxBounds: [
              [-180, -80],
              [180, 84],
            ],
            attributionControl: { compact: true },
            trackResize: false,
          });
        } catch (error) {
          console.error("[MapLibreNewsMap] Map constructor failed:", error);
          notifyFatalError("constructor-failed");
          return null;
        }
      };

      let map: MapInstance | null = tryCreateMap();
      if (!map) {
        const scheduleRetry = (attempt: number) => {
          if (cancelled || mapRef.current) return;
          if (attempt > 50) {
            failAndReady("container-never-sized");
            return;
          }
          requestAnimationFrame(() => {
            if (cancelled || mapRef.current) return;
            const m = tryCreateMap();
            if (m) {
              map = m;
              proceedWithMap(map);
            } else {
              scheduleRetry(attempt + 1);
            }
          });
        };
        scheduleRetry(0);
        return;
      }

      function proceedWithMap(m: MapInstance) {
        if (cancelled || mapRef.current) return;
        mapRef.current = m;
        mapDestroyedRef.current = false;

        const originalResize = m.resize.bind(m);
        (m as any).resize = () => {
          const container = m.getContainer?.() ?? containerRef.current;
          const rect = container?.getBoundingClientRect?.();
          const destroyed = mapDestroyedRef.current;

          if (!container || !rect || rect.width <= 0 || rect.height <= 0 || destroyed) {
            return m;
          }

          try {
            return originalResize();
          } catch {
            // Ignore resize errors, typically during teardown or transient layout changes.
            return m;
          }
        };
        const queueResize = () => {
          requestAnimationFrame(() => {
            try {
              m.resize();
            } catch {
              // Ignore resize calls during teardown or transient layout changes.
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

          const filters = nuclearFiltersRef.current ?? undefined;
          const aFilters = armsEmbargoFiltersRef.current ?? undefined;
          const uFilters = ucdpFiltersRef.current ?? undefined;
          const cFilters = conflictFiltersRef.current ?? undefined;
          const ecFilters = economicCenterFiltersRef.current ?? undefined;
          const bounds = cameraBoundsRef.current ?? null;
          let toRender = data;
          if (layerId === "nuclear-sites") {
            toRender = applyNuclearFilters(data, filters as NuclearFilters | undefined, bounds);
          } else if (layerId === "arms-embargo-zones") {
            toRender = applyArmsEmbargoFilters(data, aFilters as ArmsEmbargoFilters | undefined, bounds);
          } else if (layerId === "conflict-zones") {
            toRender = applyConflictZoneFilters(data, cFilters as ConflictFilters | undefined, bounds);
          } else if (layerId === "ucdp-events") {
            toRender = applyUcdpFilters(data, uFilters as UcdpFilters | undefined, bounds);
            try { setUcdpStats(aggregateUcdpStats(toRender)); } catch { /* ignore */ }
          } else if (layerId === "economic-centers") {
            toRender = applyEconomicCenterFilters(data, ecFilters as EconomicCenterFilters | undefined, bounds);
          }

          maplibreRenderer.updateData(layer, liveMap, toRender);
        },
        onHealth: (layerId, health) => {
          setNewsLayerHealth(layerId, health);
        },
      });

      m.on("load", async () => {
        if (cancelled) {
          markReady();
          return;
        }
        try {
          // Start with an empty source so layers exist immediately (no rendering stall).
          // The pre-fetched GeoJSON will be applied asynchronously below.
          const emptyFc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
          m.addSource("si-country-src", {
            type: "geojson",
            data: emptyFc,
            generateId: true,
          });

          m.addLayer({
            id: "si-country-fill",
            type: "fill",
            source: "si-country-src",
            paint: {
              "fill-color": "#142139",
              "fill-opacity": 0.18,
            },
          });

          m.addLayer({
            id: "si-country-border",
            type: "line",
            source: "si-country-src",
            paint: {
              "line-color": "#4e5c71",
              "line-width": 0.9,
              "line-opacity": 0.85,
            },
          });

          m.addLayer({
            id: "si-country-highlight",
            type: "line",
            source: "si-country-src",
            filter: ["==", ["get", "ISO_A2"], ""],
            paint: {
              "line-color": "#a9bfdc",
              "line-width": 1.8,
            },
          });

          // Apply pre-fetched country data once it arrives (non-blocking).
          countryDataPromise.then((geoJson) => {
            if (cancelled || !geoJson) return;
            const src = m.getSource("si-country-src") as { setData?: (d: GeoJSON.FeatureCollection) => void } | undefined;
            src?.setData?.(geoJson);
          });

          m.addSource("si-news-markers", {
            type: "geojson",
            data: markerGeoJson,
          });

          m.addLayer({
            id: "si-news-markers-layer",
            type: "circle",
            source: "si-news-markers",
            paint: {
              "circle-color": ["get", "color"],
              "circle-radius": ["get", "radius"],
              "circle-stroke-color": "#0d141c",
              "circle-stroke-width": 1,
            },
          });

          m.on("mousemove", "si-country-fill", (event) => {
            const feature = event.features?.[0] as GeoJSON.Feature | undefined;
            const code = countryCodeFromProps((feature?.properties ?? {}) as Record<string, unknown>);
            m.setFilter("si-country-highlight", ["==", ["get", "ISO_A2"], code ?? ""]);
            m.getCanvas().style.cursor = code ? "pointer" : "";
          });

          m.on("mouseleave", "si-country-fill", () => {
            m.setFilter("si-country-highlight", ["==", ["get", "ISO_A2"], ""]);
            m.getCanvas().style.cursor = "";
          });

          const intelCircleLayerId = "si-news-layer-intel-hotspots-circle";
          const intelClusterLayerId = "si-news-layer-intel-hotspots-cluster";
          const intelClusterCountLayerId = "si-news-layer-intel-hotspots-cluster-count";
          const conflictZoneFillLayerId = "si-news-layer-conflict-zones-fill";
          const nuclearCircleLayerId = "si-news-layer-nuclear-sites-circle";
          const nuclearClusterLayerId = "si-news-layer-nuclear-sites-cluster";

          const tryOpenNewsLayerPopupAtPoint = (event: any, directFeature?: GeoJSON.Feature): boolean => {
            if (!maplibreRef.current) return false;
            if (!event?.point) return false;

            let features: any[] = [];

            if (directFeature) {
              features = [directFeature as any];
            } else {
              const candidateLayers = [
                intelCircleLayerId,
                intelClusterLayerId,
                intelClusterCountLayerId,
                nuclearCircleLayerId,
                nuclearClusterLayerId,
              ];

              const layersToQuery = candidateLayers.filter((id) => Boolean((map as any).getLayer?.(id)));

              const padding = 10;
              const queryGeometry =
                typeof event.point.x === "number" && typeof event.point.y === "number"
                  ? [
                      [event.point.x - padding, event.point.y - padding],
                      [event.point.x + padding, event.point.y + padding],
                    ]
                  : event.point;

              try {
                // IMPORTANT: queryRenderedFeatures throws if any layer in `layers` doesn't exist.
                // We filter to mounted layers so toggling other layers can't break hotspot clicks.
                if (layersToQuery.length > 0) {
                  features =
                    (map as any).queryRenderedFeatures?.(queryGeometry as any, {
                      layers: layersToQuery,
                    }) ?? [];
                } else {
                  features = [];
                }
              } catch {
                // Fallback: query without a layer filter and then narrow by candidate IDs.
                // This protects against rare style timing issues while still preventing country hits.
                try {
                  const all = (map as any).queryRenderedFeatures?.(queryGeometry as any) ?? [];
                  features = Array.isArray(all)
                    ? all.filter((f: any) => candidateLayers.includes(String(f?.layer?.id ?? "")))
                    : [];
                } catch {
                  features = [];
                }
              }
            }
            if (!Array.isArray(features) || features.length === 0) return false;

            const feature = features[0] as GeoJSON.Feature | undefined;
            if (!feature || feature.geometry?.type !== "Point") return false;

            const layerId = (feature as any).layer?.id as string | undefined;
            const isIntel =
              layerId === intelCircleLayerId ||
              layerId === intelClusterLayerId ||
              layerId === intelClusterCountLayerId;
            const isNuclear =
              layerId === nuclearCircleLayerId || layerId === nuclearClusterLayerId;
            if (!isIntel && !isNuclear) return false;

            const props = (feature.properties ?? {}) as Record<string, unknown>;
            const clusterCountRaw = props.point_count ?? props.point_count_abbreviated ?? null;
            const clusterCount =
              clusterCountRaw != null && Number.isFinite(Number(clusterCountRaw)) ? Number(clusterCountRaw) : null;

            const titleRaw =
              isIntel
                ? clusterCount != null
                  ? `${clusterCount} Intel Hotspots`
                  : props.name ?? props.fullname ?? props.label ?? "Intel Hotspot"
                : clusterCount != null
                ? `${clusterCount} Nuclear Sites`
                : props.name ?? props.fullname ?? props.label ?? "Nuclear Site";

            const titleDisplay = String(titleRaw || (isIntel ? "Intel Hotspot" : "Nuclear Site"));

            const countValue = props.count ?? props.aggregateCount ?? clusterCount;
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
              feature.geometry?.type === "Point" ? (feature.geometry.coordinates as number[]) : null;
            const lon = Array.isArray(coords) && coords.length >= 2 ? Number(coords[0]) : event.lngLat?.lng;
            const lat = Array.isArray(coords) && coords.length >= 2 ? Number(coords[1]) : event.lngLat?.lat;
            if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;

            const uid = `${lat}_${lon}_${Date.now()}`;

            const buildIntelFields = (placeContext?: { displayName?: string; country?: string }) => {
              const intelProps = { ...props, id: (feature as any).id } as Record<string, unknown> & { id: unknown };
              const idStr = String(intelProps.id ?? "");
              const nameStr = String((intelProps as any).name ?? (intelProps as any).label ?? (intelProps as any).fullname ?? "Intel Hotspot");
              const isUcdp =
                idStr.toLowerCase().includes("ucdp-events") ||
                nameStr.toLowerCase().includes("ucdp-events");

              const fields: Array<{ label: string; value: string }> = [];
              const placeDisplay = placeContext?.displayName?.trim();
              const countryFromPlace = placeContext?.country?.trim();
              const countryFromProps = (intelProps.country ?? intelProps.countryCode) as string | undefined;
              const country = countryFromProps?.trim() ?? countryFromPlace;
              if (placeDisplay) fields.push({ label: "PLACE", value: placeDisplay });
              else if (country) fields.push({ label: "COUNTRY", value: country });

              const typeVal = intelProps.type ?? intelProps.eventType ?? intelProps.category ?? (isUcdp ? "Conflict event" : null);
              if (typeVal != null && String(typeVal).trim()) fields.push({ label: "TYPE", value: String(typeVal).trim() });

              const desc = intelProps.description ?? (isUcdp ? "Conflict or armed violence event from Uppsala Conflict Data Program." : null);
              if (desc != null && String(desc).trim()) fields.push({ label: "DESC", value: String(desc).trim() });

              const fatalities = intelProps.fatalities;
              if (fatalities != null) fields.push({ label: "FATAL", value: String(fatalities) });
              else if (isUcdp) fields.push({ label: "FATAL", value: "Not reported" });

              if (count != null) fields.push({ label: "INTENSITY", value: String(count) });

              fields.push({ label: "UPDATED", value: timeLabel });
              const dataSource = isUcdp ? "UCDP (Uppsala Conflict Data Program)" : "Configurable Intel Hotspots feed";
              fields.push({ label: "SOURCE", value: dataSource });
              fields.push({ label: "LOC", value: `${lat.toFixed(3)}, ${lon.toFixed(3)}` });
              return fields;
            };

            if (isIntel) {
              const intelDetail = hotspotDetailFromProps({ ...props, id: (feature as any).id });
              if (intelDetail) {
                hotspotDetailRef.current = intelDetail;
                setHotspotDetail(intelDetail);
                return true;
              }
            }
            if (isNuclear) {
              return openNuclearPopupForFeature(event, feature);
            }
            return false;
          };

          const openMilitaryActivityPopup = (event: any, feature: GeoJSON.Feature): boolean => {
            if (!maplibreRef.current) return false;
            if (!feature || feature.geometry?.type !== "Point") return false;

            const coords = feature.geometry.coordinates as number[] | undefined;
            const lon =
              Array.isArray(coords) && coords.length >= 2 ? Number(coords[0]) : event.lngLat?.lng;
            const lat =
              Array.isArray(coords) && coords.length >= 2 ? Number(coords[1]) : event.lngLat?.lat;
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;

            const props = (feature.properties ?? {}) as Record<string, unknown>;
            const callsign = typeof props.callsign === "string" ? props.callsign.trim() || null : null;
            const icao = typeof props.icao === "string" ? props.icao.trim() : "";
            const onGround = props.onGround === true;
            const tsRaw = props.ts;
            const tsMs =
              typeof tsRaw === "number"
                ? tsRaw
                : Number.isFinite(Number(tsRaw))
                ? Number(tsRaw)
                : NaN;
            const when = Number.isFinite(tsMs) ? new Date(tsMs) : null;
            const timeLabel = when && Number.isFinite(when.getTime()) ? when.toUTCString() : "Unknown";

            const fmtNum = (v: unknown, digits = 0): string | null => {
              const n = typeof v === "number" ? v : Number(v);
              if (!Number.isFinite(n)) return null;
              return digits > 0 ? n.toFixed(digits) : String(Math.round(n));
            };
            const fmtSpeed = (speedMs: unknown): string | null => {
              const n = typeof speedMs === "number" ? speedMs : Number(speedMs);
              if (!Number.isFinite(n)) return null;
              const kts = n * 1.94384;
              const kmh = n * 3.6;
              return `${Math.round(kts)} kts (${Math.round(kmh)} km/h)`;
            };
            const fmtAlt = (altM: unknown): string | null => {
              const n = typeof altM === "number" ? altM : Number(altM);
              if (!Number.isFinite(n)) return null;
              const ft = n * 3.28084;
              return `${Math.round(ft).toLocaleString()} ft (${Math.round(n).toLocaleString()} m)`;
            };
            const fmtVRate = (vRate: unknown): string | null => {
              const n = typeof vRate === "number" ? vRate : Number(vRate);
              if (!Number.isFinite(n)) return null;
              const fpm = n * 196.850394;
              const dir = n > 0 ? "climb" : n < 0 ? "descent" : "level";
              return `${Math.round(fpm)} fpm (${dir})`;
            };

            const status = onGround ? "On ground" : "Airborne";
            const speed = fmtSpeed(props.speedMs);
            const alt = fmtAlt(props.altM);
            const heading = fmtNum(props.heading, 0);
            const vRate = fmtVRate(props.vRate);
            const country = typeof props.country === "string" ? props.country.trim() : "";
            const reg = typeof props.registration === "string" ? props.registration.trim() : "";
            const typeCode = typeof props.aircraftType === "string" ? props.aircraftType.trim() : "";
            const typeDesc =
              typeof props.aircraftTypeDescription === "string" ? props.aircraftTypeDescription.trim() : "";
            const squawk = props.squawk != null ? String(props.squawk).trim() : "";
            const route = typeof props.route === "string" ? props.route.trim() : "";
            const feed = typeof props.source === "string" ? props.source.trim() : "";
            const isMock = Boolean(props.isMock);

            const fields: Array<{ label: string; value: string }> = [];
            fields.push({ label: "STATUS", value: status });
            if (callsign) fields.push({ label: "CALLSIGN", value: callsign });
            if (icao) fields.push({ label: "ICAO", value: icao });
            if (country) fields.push({ label: "COUNTRY", value: country });
            if (reg) fields.push({ label: "REG", value: reg });
            if (typeCode || typeDesc) fields.push({ label: "TYPE", value: typeDesc ? `${typeCode} — ${typeDesc}`.trim() : typeCode });
            if (speed) fields.push({ label: "SPEED", value: speed });
            if (alt) fields.push({ label: "ALT", value: alt });
            if (heading) fields.push({ label: "HDG", value: `${heading}°` });
            if (vRate) fields.push({ label: "V/S", value: vRate });
            if (squawk) fields.push({ label: "SQUAWK", value: squawk });
            if (route) fields.push({ label: "ROUTE", value: route });
            if (feed) fields.push({ label: "FEED", value: feed });
            fields.push({ label: "TIME", value: timeLabel });
            fields.push({ label: "LOC", value: `${lat.toFixed(3)}, ${lon.toFixed(3)}` });
            fields.push({ label: "SOURCE", value: isMock ? "adsb.lol military feed (fallback)" : "adsb.lol military feed" });

            const detail: DotDetailData = {
              layerId: "military-activity",
              layerType: "MILITARY ACTIVITY",
              title: `MIL / ${callsign || icao || "Unknown"}`,
              fields,
              uid: `${lat}_${lon}_${Date.now()}`,
            };
            dotDetailRef.current = detail;
            setDotDetail(detail);
            return true;
          };

          const openNuclearPopupForFeature = (event: any, feature: GeoJSON.Feature): boolean => {
            if (!maplibreRef.current) return false;
            if (!feature || feature.geometry?.type !== "Point") return false;

            const coords = feature.geometry.coordinates as number[] | undefined;
            const lon =
              Array.isArray(coords) && coords.length >= 2 ? Number(coords[0]) : event.lngLat?.lng;
            const lat =
              Array.isArray(coords) && coords.length >= 2 ? Number(coords[1]) : event.lngLat?.lat;
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;

            const props = (feature.properties ?? {}) as Record<string, unknown>;
            const nameRaw = props.name ?? "Nuclear Site";
            const typeRaw = props.facilityType ?? props.type ?? "Nuclear facility";
            const operatorRaw = props.operator as string | undefined;
            const countryRaw = props.country as string | undefined;
            const admin1Raw = props.admin1 as string | undefined;
            const capacityMw = (props.capacityMw as number | undefined) ??
              (typeof props.capacity === "number" ? (props.capacity as number) : undefined);
            const reactorCount = props.reactorCount as number | undefined;
            const sourceIds = (props.sourceIds ?? {}) as Record<string, unknown>;

            const tsRaw = props.ts ?? props.time ?? props.timestamp ?? props.lastUpdated;
            const tsMs =
              typeof tsRaw === "number"
                ? tsRaw
                : Number.isFinite(Number(tsRaw))
                ? Number(tsRaw)
                : NaN;

            const summaryBase =
              String(typeRaw ?? "Nuclear facility").toLowerCase().includes("power plant") ||
              typeRaw === "Nuclear Power Plant"
                ? "Open-source listed nuclear power facility."
                : "Open-source listed nuclear facility.";
            const extras: string[] = [];
            if (operatorRaw && String(operatorRaw).trim()) extras.push("operator metadata");
            if (typeof capacityMw === "number" && Number.isFinite(capacityMw)) {
              extras.push("capacity metadata");
            }
            if (typeof reactorCount === "number" && Number.isFinite(reactorCount)) {
              extras.push("reactor count metadata");
            }
            const summary =
              extras.length > 0 ? `${summaryBase} With ${extras.join(" and ")}.` : summaryBase;

            const names: string[] = [];
            if (sourceIds.wikidataQid) names.push("Wikidata");
            if (sourceIds.nrcId) names.push("NRC (US)");
            if (sourceIds.osmId) names.push("OSM (verification)");

            const wikidataUrl =
              typeof sourceIds.wikidataQid === "string" && sourceIds.wikidataQid
                ? `https://www.wikidata.org/wiki/${sourceIds.wikidataQid}`
                : undefined;
            const osmId =
              typeof sourceIds.osmId === "string" && sourceIds.osmId ? (sourceIds.osmId as string) : "";
            const osmUrl = osmId ? `https://www.openstreetmap.org/${osmId}` : undefined;
            const nrcUrl =
              typeof sourceIds.nrcId === "string" && sourceIds.nrcId
                ? undefined
                : undefined;

            const detail: NuclearSiteDetailData = {
              id: String(feature.id ?? nameRaw ?? ""),
              name: String(nameRaw),
              type: String(typeRaw ?? "Nuclear facility"),
              status: (props.status as any) ?? "Unknown",
              country: countryRaw,
              admin1: admin1Raw,
              operator: operatorRaw,
              capacityMw: capacityMw,
              reactorCount: reactorCount,
              lat,
              lon,
              summary,
              sourceNames: names.length ? names : ["Open-source datasets"],
              wikidataUrl,
              osmUrl,
              nrcUrl,
              lastUpdated: Number.isFinite(tsMs) ? tsMs : null,
              sourceStatus: nuclearSourceStatus ?? undefined,
            };
            nuclearDetailRef.current = detail;
            setNuclearDetail(detail);
            return true;
          };

          const tryOpenNuclearPopupAtPoint = (event: any): boolean => {
            if (!maplibreRef.current) return false;
            if (!event?.point) return false;

            const hasCircleLayer = Boolean((map as any).getLayer?.(nuclearCircleLayerId));
            const hasClusterLayer = Boolean((map as any).getLayer?.(nuclearClusterLayerId));
            if (!hasCircleLayer && !hasClusterLayer) return false;

            const candidateLayers = [
              hasCircleLayer ? nuclearCircleLayerId : null,
              hasClusterLayer ? nuclearClusterLayerId : null,
            ].filter(Boolean) as string[];

            let features: any[] = [];
            try {
              const padding = 6;
              const queryGeometry =
                typeof event.point.x === "number" && typeof event.point.y === "number"
                  ? [
                      [event.point.x - padding, event.point.y - padding],
                      [event.point.x + padding, event.point.y + padding],
                    ]
                  : event.point;

              features =
                ((map as any).queryRenderedFeatures?.(queryGeometry as any, {
                  layers: candidateLayers,
                }) as any[]) ?? [];
            } catch {
              features = [];
            }

            if (!Array.isArray(features) || features.length === 0) return false;

            const feature = features[0] as GeoJSON.Feature | undefined;
            if (!feature) return false;
            return openNuclearPopupForFeature(event, feature);
          };

          // Generic popup for any mounted point layer that does NOT have a dedicated handler.
          // This covers UCDP Events, Military Activity, Sanctions Entities, Piracy, etc.
          const tryOpenGenericLayerPopupAtPoint = (event: any): boolean => {
            if (!maplibreRef.current) return false;
            if (!event?.point) return false;

            // These layers already have dedicated popup / panel handlers — skip them here.
            const dedicatedLayerIds = new Set([
              intelCircleLayerId, intelClusterLayerId, intelClusterCountLayerId,
              "si-news-layer-conflict-zones-circle", "si-news-layer-conflict-zones-cluster", "si-news-layer-conflict-zones-cluster-count",
              nuclearCircleLayerId, nuclearClusterLayerId,
              "si-news-markers-layer",
              "si-news-layer-military-activity-circle",
              "si-news-layer-military-activity-cluster",
              "si-news-layer-military-activity-cluster-count",
              "si-news-layer-trade-route-nodes-hub",
              "si-news-layer-trade-route-nodes-choke",
              "si-news-layer-trade-route-nodes-label",
              "si-news-layer-ai-data-centers-halo",
              "si-news-layer-ai-data-centers-circle",
              "si-news-layer-ai-data-centers-label",
              "si-news-layer-ai-data-centers-cluster",
              "si-news-layer-ai-data-centers-cluster-count",
              "si-news-layer-critical-minerals-circle",
              "si-news-layer-critical-minerals-cluster",
              "si-news-layer-critical-minerals-cluster-count",
              "si-news-layer-sanctions-entities-circle",
              "si-news-layer-sanctions-entities-cluster",
              "si-news-layer-sanctions-entities-cluster-count",
              "si-news-layer-economic-centers-halo",
              "si-news-layer-economic-centers-circle",
              "si-news-layer-economic-centers-cluster",
              "si-news-layer-economic-centers-cluster-count",
              "si-news-layer-ucdp-events-circle",
              "si-news-layer-ucdp-events-cluster",
              "si-news-layer-ucdp-events-cluster-count",
            ]);

            const candidateLayers = Array.from(mountedLayersRef.current).flatMap((lid) => {
              const entry = NEWS_LAYER_REGISTRY_BY_ID.get(lid);
              if (!entry) return [];
              if (entry.type !== "geojsonPoints" && entry.type !== "dynamicEntities") return [];
              return getMaplibreLayerIds(lid, entry.type).filter((mlId) => !dedicatedLayerIds.has(mlId));
            }).filter((id) => Boolean((map as any).getLayer?.(id)));

            if (candidateLayers.length === 0) return false;

            const padding = 8;
            const queryGeometry =
              typeof event.point.x === "number" && typeof event.point.y === "number"
                ? [
                    [event.point.x - padding, event.point.y - padding],
                    [event.point.x + padding, event.point.y + padding],
                  ]
                : event.point;

            let features: any[] = [];
            try {
              features =
                ((map as any).queryRenderedFeatures?.(queryGeometry as any, {
                  layers: candidateLayers,
                }) as any[]) ?? [];
            } catch {
              features = [];
            }

            if (!Array.isArray(features) || features.length === 0) return false;
            const feature = features[0] as GeoJSON.Feature | undefined;
            if (!feature) return false;

            // Derive the registry layer from the MapLibre layer ID
            const mlLayerId = (feature as any).layer?.id as string | undefined;
            const registryId = mlLayerId
              ?.replace(/^si-news-layer-/, "")
              .replace(/-(halo|circle|label|cluster|cluster-count)$/, "");
            const registryEntry = registryId ? NEWS_LAYER_REGISTRY_BY_ID.get(registryId) : null;
            const layerLabel = registryEntry?.label ?? registryId ?? "Feature";
            const layerIcon = registryEntry?.icon ?? "";

            const props = (feature.properties ?? {}) as Record<string, unknown>;
            const nameRaw = props.name ?? props.title ?? props.label ?? props.fullname ?? null;
            const typeRaw = props.type ?? props.category ?? props.eventType ?? props.facilityType ?? null;

            const coords =
              feature.geometry?.type === "Point" ? (feature.geometry.coordinates as number[]) : null;
            const lon =
              Array.isArray(coords) && coords.length >= 2 ? Number(coords[0]) : event.lngLat?.lng;
            const lat =
              Array.isArray(coords) && coords.length >= 2 ? Number(coords[1]) : event.lngLat?.lat;
            if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;

            const tsRaw = props.ts ?? props.time ?? props.timestamp ?? props.updatedAt;
            const tsMs =
              typeof tsRaw === "number"
                ? tsRaw
                : Number.isFinite(Number(tsRaw))
                ? Number(tsRaw)
                : NaN;
            const when = Number.isFinite(tsMs) ? new Date(tsMs) : null;
            const timeLabel = when && Number.isFinite(when.getTime()) ? when.toUTCString() : null;

            const fields: Array<{ label: string; value: string }> = [];
            if (nameRaw != null) fields.push({ label: "LAYER", value: layerLabel });
            if (typeRaw != null) fields.push({ label: "TYPE", value: String(typeRaw) });
            fields.push({ label: "LOC", value: `${lat.toFixed(3)}, ${lon.toFixed(3)}` });
            if (timeLabel) fields.push({ label: "UPDATED", value: timeLabel });

            const title = nameRaw != null ? String(nameRaw) : `${layerIcon} ${layerLabel}`.trim();
            const detail: DotDetailData = {
              layerId: registryId ?? "unknown",
              layerType: layerLabel.toUpperCase(),
              title,
              fields,
              uid: `${lat}_${lon}_${Date.now()}`,
            };
            dotDetailRef.current = detail;
            setDotDetail(detail);
            return true;
          };

          const getPointFeaturePriority = (mlLayerId: string): number => {
            if (mlLayerId === "si-news-markers-layer") return 4;
            const registryId = mlLayerId
              ?.replace(/^si-news-layer-/, "")
              .replace(/-(halo|circle|cluster|cluster-count)$/, "");
            if (!registryId) return 10;
            if (registryId === "military-bases") return 0;
            if (registryId === "nuclear-sites") return 1;
            if (registryId === "economic-centers") return 1.2;
            if (registryId === "sanctions-entities") return 1.5;
            if (registryId === "intel-hotspots" || registryId === "conflict-zones") return 2;
            return 3;
          };

          const handlePointClick = (event: any): boolean => {
            const anyMap = map as any;
            if (!event?.point) return false;

            const padding = 8;
            const queryGeometry =
              typeof event.point.x === "number" && typeof event.point.y === "number"
                ? [
                    [event.point.x - padding, event.point.y - padding],
                    [event.point.x + padding, event.point.y + padding],
                  ]
                : event.point;

            const candidateLayers = [
              "si-news-markers-layer",
              ...Array.from(mountedLayersRef.current).flatMap((lid) => {
                const entry = NEWS_LAYER_REGISTRY_BY_ID.get(lid);
                if (!entry) return [];
                if (entry.type !== "geojsonPoints" && entry.type !== "dynamicEntities") return [];
                return getMaplibreLayerIds(lid, entry.type);
              }),
            ].filter((id) => Boolean(anyMap.getLayer?.(id)));

            if (candidateLayers.length === 0) return false;

            let features: any[] = [];
            try {
              features =
                (anyMap.queryRenderedFeatures?.(queryGeometry as any, {
                  layers: candidateLayers,
                }) as any[]) ?? [];
            } catch {
              features = [];
            }

            if (!Array.isArray(features) || features.length === 0) return false;

            let bestFeature: GeoJSON.Feature | null = null;
            let bestLayerId = "";
            let bestPriority = Number.POSITIVE_INFINITY;

            for (const f of features) {
              const mlLayerId = String((f as any)?.layer?.id ?? "");
              const priority = getPointFeaturePriority(mlLayerId);
              if (priority < bestPriority) {
                bestPriority = priority;
                bestFeature = f as GeoJSON.Feature;
                bestLayerId = mlLayerId;
              }
            }

            if (!bestFeature || !Number.isFinite(bestPriority)) return false;

            let registryId: string | null = null;
            if (bestLayerId === "si-news-markers-layer") {
              registryId = "markers";
            } else if (bestLayerId.startsWith("si-news-layer-")) {
              registryId = bestLayerId
                .replace(/^si-news-layer-/, "")
                .replace(/-(halo|circle|label|cluster|cluster-count)$/, "");
              // Fix special layer ID suffixes for trade-route-nodes
              if (
                registryId === "trade-route-nodes-hub" ||
                registryId === "trade-route-nodes-choke" ||
                registryId === "trade-route-nodes-label"
              ) {
                registryId = "trade-route-nodes";
              }
            }

            if (registryId === "nuclear-sites") {
              return openNuclearPopupForFeature(event, bestFeature);
            }

            if (registryId === "economic-centers") {
              const props = (bestFeature.properties ?? {}) as Record<string, unknown>;
              const coords =
                bestFeature.geometry?.type === "Point"
                  ? (bestFeature.geometry.coordinates as number[])
                  : null;
              const lon = Array.isArray(coords) ? Number(coords[0]) : (event.lngLat?.lng ?? NaN);
              const lat = Array.isArray(coords) ? Number(coords[1]) : (event.lngLat?.lat ?? NaN);
              if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;

              let keyAssets: EconomicCenterDetailData["keyAssets"] = { exchanges: [], ports: [], airports: [] };
              let sourceTrace: EconomicCenterDetailData["sourceTrace"] = null;
              let scoreBreakdown: EconomicCenterDetailData["scoreBreakdown"] = { finance: 0, trade: 0, urban: 0, macro: 0 };
              try {
                if (typeof props.keyAssets === "string") keyAssets = JSON.parse(props.keyAssets);
                if (typeof props.sourceTrace === "string") sourceTrace = JSON.parse(props.sourceTrace);
                if (typeof props.scoreBreakdown === "string") scoreBreakdown = JSON.parse(props.scoreBreakdown);
              } catch { /* ignore parse errors */ }

              const detail: EconomicCenterDetailData = {
                id:            String(props.id ?? ""),
                name:          String(props.name ?? "Economic Center"),
                country:       String(props.country ?? ""),
                countryIso2:   props.countryIso2 ? String(props.countryIso2) : undefined,
                admin1:        props.admin1 ? String(props.admin1) : undefined,
                lat,
                lon,
                population:    props.population != null ? Number(props.population) : undefined,
                scoreTotal:    Math.round(Number(props.scoreTotal ?? 0)),
                scoreBreakdown,
                rank:          Number(props.rank ?? 0),
                keyAssets,
                sourceTrace,
                lastUpdated:   props.ts ? Number(props.ts) : null,
              };

              economicCenterDetailRef.current = detail;
              setEconomicCenterDetail(detail);
              return true;
            }

            if (registryId === "ai-data-centers") {
              const props = (bestFeature.properties ?? {}) as Record<string, unknown>;
              const coords =
                bestFeature.geometry?.type === "Point"
                  ? (bestFeature.geometry.coordinates as number[])
                  : null;
              const lon = Array.isArray(coords) ? Number(coords[0]) : (event.lngLat?.lng ?? NaN);
              const lat = Array.isArray(coords) ? Number(coords[1]) : (event.lngLat?.lat ?? NaN);
              if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;

              let importanceBreakdown: AiDataCenterDetailData["importanceBreakdown"] = { operatorDiversity: 0, hyperscalerPresence: 0, siteScale: 0, regionWeight: 0 };
              let sourceTrace: AiDataCenterDetailData["sourceTrace"] = null;
              let operators: string[] = [];
              let operatorTypes: string[] = [];
              let sites: AiDataCenterDetailData["sites"] = [];
              try {
                if (typeof props.importanceBreakdown === "string") importanceBreakdown = JSON.parse(props.importanceBreakdown);
                if (typeof props.sourceTrace === "string") sourceTrace = JSON.parse(props.sourceTrace);
                if (typeof props.operators === "string") operators = JSON.parse(props.operators);
                if (typeof props.operatorTypes === "string") operatorTypes = JSON.parse(props.operatorTypes);
                if (typeof props.sites === "string") sites = JSON.parse(props.sites);
              } catch { /* ignore parse errors */ }

              const dcDetail: AiDataCenterDetailData = {
                id:                  String(props.id ?? ""),
                name:                String(props.name ?? "Data Center Cluster"),
                country:             String(props.country ?? ""),
                countryIso2:         props.countryIso2 ? String(props.countryIso2) : undefined,
                admin1:              props.admin1 ? String(props.admin1) : undefined,
                centroidLat:         lat,
                centroidLon:         lon,
                operators,
                operatorTypes,
                siteCount:           Number(props.siteCount ?? 0),
                confidence:          Number(props.confidence ?? 0),
                importance:          Number(props.importance ?? 0),
                importanceBreakdown,
                sites,
                notes:               String(props.notes ?? ""),
                sourceTrace,
                lastUpdated:         props.ts ? Number(props.ts) : null,
              };

              aiDataCenterDetailRef.current = dcDetail;
              setAiDataCenterDetail(dcDetail);
              return true;
            }

            if (registryId === "sanctions-entities") {
              const props = (bestFeature.properties ?? {}) as Record<string, unknown>;
              const sDetail: SanctionsEntityDetailData = {
                id: String(props.id ?? ""),
                name: String(props.name ?? ""),
                aliases: typeof props.aliases === "string" ? (props.aliases as string).split("; ").filter(Boolean) : [],
                entityType: String(props.entityType ?? ""),
                authority: String(props.authority ?? ""),
                program: String(props.program ?? ""),
                designationDate: props.designationDate ? String(props.designationDate) : null,
                status: String(props.status ?? ""),
                identifiers: typeof props.identifiers === "string" ? props.identifiers : "{}",
                jurisdictionCountry: props.jurisdictionCountry ? String(props.jurisdictionCountry) : null,
                linkedCountries: String(props.linkedCountries ?? ""),
                geoConfidence: props.geoConfidence ? String(props.geoConfidence) : null,
                placeName: props.placeName ? String(props.placeName) : null,
                sourceName: String(props.sourceName ?? ""),
                sourceUrl: String(props.sourceUrl ?? ""),
                datasetVersion: props.datasetVersion ? String(props.datasetVersion) : null,
                lastUpdated: props.lastUpdated ? String(props.lastUpdated) : null,
              };
              sanctionsDetailRef.current = sDetail;
              setSanctionsDetail(sDetail);
              return true;
            }

            if (registryId === "critical-minerals") {
              const props = (bestFeature.properties ?? {}) as Record<string, unknown>;
              const coords =
                bestFeature.geometry?.type === "Point"
                  ? (bestFeature.geometry.coordinates as number[])
                  : null;
              const lon = Array.isArray(coords) ? Number(coords[0]) : ((event as { lngLat?: { lng: number } }).lngLat?.lng ?? NaN);
              const lat = Array.isArray(coords) ? Number(coords[1]) : ((event as { lngLat?: { lat: number } }).lngLat?.lat ?? NaN);
              if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;

              let commodities: string[] = [];
              try {
                if (typeof props.commodities === "string") {
                  commodities = JSON.parse(props.commodities) as string[];
                } else if (Array.isArray(props.commodities)) {
                  commodities = props.commodities.map(String);
                }
              } catch { /* ignore */ }

              const cmDetail: CriticalMineralDetailData = {
                id:               String(props.id ?? ""),
                name:             String(props.name ?? "Critical Mineral Site"),
                mineralType:      String(props.mineralType ?? ""),
                commodities,
                depositType:      String(props.depositType ?? ""),
                country:          String(props.country ?? ""),
                countryName:      String(props.countryName ?? ""),
                region:           props.region != null ? String(props.region) : undefined,
                operator:         props.operator != null ? String(props.operator) : undefined,
                status:           String(props.status ?? "Unknown"),
                annualOutputTonnes: props.annualOutputTonnes != null ? Number(props.annualOutputTonnes) : undefined,
                reservesTonnes:   props.reservesTonnes != null ? Number(props.reservesTonnes) : undefined,
                strategicTier:    String(props.strategicTier ?? ""),
                supplyRisk:       String(props.supplyRisk ?? "Unknown"),
                geopoliticalNotes: props.geopoliticalNotes != null ? String(props.geopoliticalNotes) : undefined,
                lat,
                lon,
                lastUpdated:      props.ts != null ? Number(props.ts) : null,
              };
              criticalMineralDetailRef.current = cmDetail;
              setCriticalMineralDetail(cmDetail);
              return true;
            }

            if (registryId === "intel-hotspots") {
              return tryOpenNewsLayerPopupAtPoint(event, bestFeature);
            }

            if (registryId === "military-bases") {
              const detail = buildMilitaryBaseDetail(bestFeature, event);
              if (!detail) return false;
              dotDetailRef.current = detail;
              setDotDetail(detail);
              return true;
            }

            if (registryId === "military-activity") {
              return openMilitaryActivityPopup(event, bestFeature);
            }

            if (registryId === "ucdp-events") {
              const props = (bestFeature.properties ?? {}) as Record<string, unknown>;
              const uDetail: UcdpEventDetailData = {
                id: String(props.id ?? ""),
                violenceType: String(props.violenceType ?? ""),
                conflictId: Number(props.conflictId ?? 0),
                conflictName: String(props.conflictName ?? ""),
                actor1Name: String(props.actor1Name ?? ""),
                actor2Name: props.actor2Name ? String(props.actor2Name) : null,
                country: String(props.country ?? ""),
                admin1: String(props.admin1 ?? ""),
                locationName: String(props.locationName ?? ""),
                lat: Number(props.lat ?? 0),
                lon: Number(props.lon ?? 0),
                date: String(props.date ?? ""),
                fatalities_best: Number(props.fatalities_best ?? 0),
                fatalities_low: Number(props.fatalities_low ?? 0),
                fatalities_high: Number(props.fatalities_high ?? 0),
                severity: Number(props.severity ?? 0),
                severityLabel: String(props.severityLabel ?? "Low"),
                sourceDatasetVersion: String(props.sourceDatasetVersion ?? ""),
                sourceUrl: String(props.sourceUrl ?? ""),
                lastUpdated: Number(props.lastUpdated ?? Date.now()),
              };
              ucdpDetailRef.current = uDetail;
              setUcdpDetail(uDetail);
              return true;
            }

            if (registryId === "markers") {
              const props = (bestFeature.properties ?? {}) as Record<string, unknown>;
              const articleId = String(props.articleId ?? "");
              const x = typeof event.point?.x === "number" ? event.point.x : null;
              if (x !== null) {
                const halfWidth = m.getContainer().clientWidth / 2;
                setDockSide(x >= halfWidth ? "left" : "right");
              }
              const countryCode = countryByArticleIdRef.current.get(articleId) ?? null;
              if (countryCode) {
                perfMark(`country:${countryCode}:click`);
                setSelectedCountry(countryCode);
              }
              return true;
            }

            if (registryId === "trade-route-nodes") {
              const tileProps = (bestFeature.properties ?? {}) as Record<string, unknown>;
              // MapLibre can truncate long string properties during internal tile conversion.
              // Look up the authoritative feature from the loaded layer data by name match.
              const tileNodeName = String(tileProps.name ?? "");
              const nodeDataCollection = layerDataRef.current.get("trade-route-nodes");
              const fullFeature = nodeDataCollection?.features.find(
                (f) => String(f.properties.name ?? "") === tileNodeName
              );
              const props: Record<string, unknown> = fullFeature?.properties ?? tileProps;
              const name = String(props.name ?? "Trade Route Node");
              const nodeType = String(props.nodeType ?? "hub");
              const country = String(props.country ?? "");
              const wikidataId = String(props.wikidataId ?? "");
              const isChokepoint = nodeType === "chokepoint";
              const coords =
                bestFeature.geometry?.type === "Point"
                  ? (bestFeature.geometry.coordinates as number[])
                  : null;
              const lon = Array.isArray(coords) ? Number(coords[0]) : event.lngLat?.lng;
              const lat = Array.isArray(coords) ? Number(coords[1]) : event.lngLat?.lat;
              if (!Number.isFinite(lon) || !Number.isFinite(lat)) return tryOpenGenericLayerPopupAtPoint(event);

              const fields: Array<{ label: string; value: string }> = [];
              fields.push({ label: "TYPE", value: isChokepoint ? "Strategic Chokepoint" : "Major Trade Hub" });
              if (country) fields.push({ label: "COUNTRY", value: country });
              fields.push({ label: "LOC", value: `${lat.toFixed(4)}, ${lon.toFixed(4)}` });

              // --- Static enrichment from GeoJSON properties ---
              const summary = String(props.summary ?? "").trim();
              if (summary) fields.push({ label: "ABOUT", value: summary });

              if (isChokepoint) {
                const dailyVessels = Number(props.dailyVessels);
                if (dailyVessels > 0) fields.push({ label: "DAILY VESSELS", value: `${dailyVessels.toLocaleString()} ships/day` });
                const tradeShare = String(props.tradeSharePct ?? "").trim();
                if (tradeShare) fields.push({ label: "TRADE SHARE", value: tradeShare });
                const widthKm = Number(props.widthKm);
                if (widthKm > 0) fields.push({ label: "MIN WIDTH", value: `${widthKm} km` });
                const controlledBy = String(props.controlledBy ?? "").trim();
                if (controlledBy) fields.push({ label: "CONTROLLED BY", value: controlledBy });
                const primaryCargo = String(props.primaryCommodities ?? "").trim();
                if (primaryCargo) fields.push({ label: "PRIMARY CARGO", value: primaryCargo });
              } else {
                const throughput = String(props.throughput ?? "").trim();
                if (throughput) fields.push({ label: "THROUGHPUT", value: throughput });
                const globalRank = String(props.globalRank ?? "").trim();
                if (globalRank) fields.push({ label: "GLOBAL RANK", value: globalRank });
                const topExports = String(props.topExports ?? "").trim();
                if (topExports) fields.push({ label: "TOP EXPORTS", value: topExports });
                const topImports = String(props.topImports ?? "").trim();
                if (topImports) fields.push({ label: "TOP IMPORTS", value: topImports });
              }

              if (wikidataId) fields.push({ label: "WIKIDATA_ID", value: wikidataId });

              const tsRaw = props.ts ?? props.timestamp;
              const tsMs = typeof tsRaw === "number" ? tsRaw : NaN;
              const when = Number.isFinite(tsMs) ? new Date(tsMs) : null;
              const timeLabel = when ? when.toUTCString() : null;
              if (timeLabel) fields.push({ label: "UPDATED", value: timeLabel });

              const detail: DotDetailData = {
                layerId: "trade-route-nodes",
                layerType: isChokepoint ? "TRADE CHOKEPOINT" : "TRADE HUB",
                title: name,
                fields,
                lat,
                lon,
                uid: `${lat}_${lon}_${Date.now()}`,
              };
              dotDetailRef.current = detail;
              setDotDetail(detail);
              return true;
            }

            return tryOpenGenericLayerPopupAtPoint(event);
          };

          const handleCountryClick = (event: any) => {
            const anyMap = map as any;
            if (!event?.point) return;

            let features: any[] = [];
            try {
              features =
                (anyMap.queryRenderedFeatures?.(event.point as any, {
                  layers: ["si-country-fill"],
                }) as any[]) ?? [];
            } catch {
              features = [];
            }

            const feature = (Array.isArray(features) && features.length > 0
              ? (features[0] as GeoJSON.Feature)
              : undefined) as GeoJSON.Feature | undefined;

            const code = countryCodeFromProps(
              (feature?.properties ?? {}) as Record<string, unknown>
            );
            const x = typeof event.point?.x === "number" ? event.point.x : null;
            if (x !== null) {
              const halfWidth = m.getContainer().clientWidth / 2;
              setDockSide(x >= halfWidth ? "left" : "right");
            }
            if (code) {
              perfMark(`country:${code}:click`);
              setSelectedCountry(code);
            }
          };

          const handleConflictZonePolygonClick = (event: any): boolean => {
            const anyMap = map as any;
            if (!event?.point) return false;
            const fillLayerId = "si-news-layer-conflict-zones-fill";
            if (!anyMap.getLayer?.(fillLayerId)) return false;
            if (!mountedLayersRef.current.has("conflict-zones")) return false;

            let features: any[] = [];
            try {
              features = (anyMap.queryRenderedFeatures?.(event.point, {
                layers: [fillLayerId],
              }) ?? []) as any[];
            } catch { features = []; }
            if (!features.length) return false;

            const feature = features[0] as GeoJSON.Feature;
            const props = (feature.properties ?? {}) as Record<string, unknown>;
            const detailProps = propsToConflictZoneDetail(props);
            if (!detailProps) return false;

            let mode: "strict" | "broad" = "strict";
            let verifiedOverlay = false;
            try {
              const m = window.localStorage.getItem("wv:conflict-zones:mode");
              if (m === "broad") mode = "broad";
              const v = window.localStorage.getItem("wv:conflict-zones:verifiedOverlay");
              verifiedOverlay = v === "1" || v === "true";
            } catch { /* ignore */ }

            const detail: ConflictZoneDetailData = detailProps;
            conflictZoneDetailRef.current = detail;
            setConflictZoneDetail(detail);
            suppressCountryClickRef.current = true;
            return true;
          };

          const handleEmbargoPolygonClick = (event: any): boolean => {
            const anyMap = map as any;
            if (!event?.point) return false;
            const fillLayerId = "si-news-layer-arms-embargo-zones-fill";
            if (!anyMap.getLayer?.(fillLayerId)) return false;
            if (!mountedLayersRef.current.has("arms-embargo-zones")) return false;

            let features: any[] = [];
            try {
              features = (anyMap.queryRenderedFeatures?.(event.point, {
                layers: [fillLayerId],
              }) ?? []) as any[];
            } catch { features = []; }
            if (!features.length) return false;

            const feature = features[0] as GeoJSON.Feature;
            const props = (feature.properties ?? {}) as Record<string, unknown>;
            let programmes: any[] = [];
            try {
              programmes = typeof props.programmes === "string"
                ? JSON.parse(props.programmes)
                : Array.isArray(props.programmes) ? props.programmes : [];
            } catch { programmes = []; }

            const detail: ArmsEmbargoZoneDetailData = {
              countryCode: String(props.countryCode ?? ""),
              countryLabel: String(props.countryLabel ?? "Unknown"),
              programmes,
              programmeCount: Number(props.programmeCount ?? programmes.length),
              activeProgrammeCount: Number(props.activeProgrammeCount ?? 0),
              lastUpdated: props.lastUpdated ? String(props.lastUpdated) : null,
              sourceStatus: embargoSourceStatus ?? undefined,
            };

            armsEmbargoDetailRef.current = detail;
            setArmsEmbargoDetail(detail);
            suppressCountryClickRef.current = true;
            return true;
          };

          const handleTradeRouteLineClick = (event: any): boolean => {
            const anyMap = map as any;
            if (!event?.point) return false;
            if (!mountedLayersRef.current.has("trade-routes")) return false;

            const lineLayerId = "si-news-layer-trade-routes-line";
            const glowLayerId = "si-news-layer-trade-routes-glow";
            const lineLayers = [lineLayerId, glowLayerId].filter((id) => Boolean(anyMap.getLayer?.(id)));
            if (lineLayers.length === 0) return false;

            const padding = 6;
            const queryGeometry =
              typeof event.point.x === "number" && typeof event.point.y === "number"
                ? [
                    [event.point.x - padding, event.point.y - padding],
                    [event.point.x + padding, event.point.y + padding],
                  ]
                : event.point;

            let features: any[] = [];
            try {
              features = (anyMap.queryRenderedFeatures?.(queryGeometry as any, { layers: lineLayers }) as any[]) ?? [];
            } catch { features = []; }

            if (!Array.isArray(features) || features.length === 0) return false;
            const feature = features[0] as GeoJSON.Feature;
            const props = (feature.properties ?? {}) as Record<string, unknown>;

            const name = props.name ? String(props.name) : "Trade Route";
            const category = props.category ? String(props.category) : null;
            const importance = props.importance != null ? Number(props.importance) : null;
            const startHub = props.startHub ? String(props.startHub) : null;
            const endHub = props.endHub ? String(props.endHub) : null;
            const whyItMatters = props.whyItMatters ? String(props.whyItMatters) : null;
            const keyChokepoints = props.keyChokepoints ? String(props.keyChokepoints) : null;
            const tsRaw = props.ts ?? props.timestamp;
            const tsMs = typeof tsRaw === "number" ? tsRaw : NaN;
            const when = Number.isFinite(tsMs) ? new Date(tsMs) : null;
            const timeLabel = when ? when.toUTCString() : null;

            const importanceLabel =
              importance != null
                ? importance >= 5 ? "Critical" : importance >= 4 ? "High" : importance >= 3 ? "Moderate" : "Low"
                : null;

            const fields: Array<{ label: string; value: string }> = [];
            if (category) fields.push({ label: "CATEGORY", value: category.toUpperCase() });
            if (importanceLabel) fields.push({ label: "IMPORTANCE", value: importanceLabel });
            if (startHub) fields.push({ label: "FROM", value: startHub });
            if (endHub) fields.push({ label: "TO", value: endHub });
            if (keyChokepoints) fields.push({ label: "CHOKEPOINTS", value: keyChokepoints });
            if (whyItMatters) fields.push({ label: "SIGNIFICANCE", value: whyItMatters });
            if (timeLabel) fields.push({ label: "UPDATED", value: timeLabel });

            const detail: DotDetailData = {
              layerId: "trade-routes",
              layerType: "TRADE ROUTE",
              title: name,
              fields,
              uid: `trade-route_${Date.now()}`,
            };
            dotDetailRef.current = detail;
            setDotDetail(detail);
            return true;
          };

          // ── AI Data Center click check (runs before unified dispatcher) ───
          const tryAiDataCenterClick = (event: any): boolean => {
            if (!event?.point) return false;
            const anyM = m as any;
            const aiLayers = [
              "si-news-layer-ai-data-centers-halo",
              "si-news-layer-ai-data-centers-circle",
              "si-news-layer-ai-data-centers-label",
            ].filter((id) => Boolean(anyM.getLayer?.(id)));
            if (aiLayers.length === 0) return false;

            const pad = 10;
            const qg = [
              [event.point.x - pad, event.point.y - pad],
              [event.point.x + pad, event.point.y + pad],
            ];
            let feats: any[] = [];
            try {
              feats = anyM.queryRenderedFeatures?.(qg, { layers: aiLayers }) ?? [];
            } catch { feats = []; }
            if (!Array.isArray(feats) || feats.length === 0) return false;

            const feature = feats[0] as GeoJSON.Feature;
            if (!feature || feature.geometry?.type !== "Point") return false;
            const fProps = (feature.properties ?? {}) as Record<string, unknown>;
            if (fProps.cluster || fProps.point_count) return false;

            const coords = (feature.geometry as any).coordinates as number[];
            const lon = Number(coords[0]);
            const lat = Number(coords[1]);
            if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;

            let importanceBreakdown: AiDataCenterDetailData["importanceBreakdown"] = { operatorDiversity: 0, hyperscalerPresence: 0, siteScale: 0, regionWeight: 0 };
            let sourceTrace: AiDataCenterDetailData["sourceTrace"] = null;
            let operators: string[] = [];
            let operatorTypes: string[] = [];
            let sites: AiDataCenterDetailData["sites"] = [];
            try {
              if (typeof fProps.importanceBreakdown === "string") importanceBreakdown = JSON.parse(fProps.importanceBreakdown);
              if (typeof fProps.sourceTrace === "string") sourceTrace = JSON.parse(fProps.sourceTrace);
              if (typeof fProps.operators === "string") operators = JSON.parse(fProps.operators);
              if (typeof fProps.operatorTypes === "string") operatorTypes = JSON.parse(fProps.operatorTypes);
              if (typeof fProps.sites === "string") sites = JSON.parse(fProps.sites);
            } catch { /* ignore */ }

            const dcDetail: AiDataCenterDetailData = {
              id:                  String(fProps.id ?? ""),
              name:                String(fProps.name ?? "Data Center Cluster"),
              country:             String(fProps.country ?? ""),
              countryIso2:         fProps.countryIso2 ? String(fProps.countryIso2) : undefined,
              admin1:              fProps.admin1 ? String(fProps.admin1) : undefined,
              centroidLat:         lat,
              centroidLon:         lon,
              operators,
              operatorTypes,
              siteCount:           Number(fProps.siteCount ?? 0),
              confidence:          Number(fProps.confidence ?? 0),
              importance:          Number(fProps.importance ?? 0),
              importanceBreakdown,
              sites,
              notes:               String(fProps.notes ?? ""),
              sourceTrace,
              lastUpdated:         fProps.ts ? Number(fProps.ts) : null,
            };

            // Clear any generic dot detail
            dotDetailRef.current = null;
            setDotDetail(null);

            aiDataCenterDetailRef.current = dcDetail;
            setAiDataCenterDetail(dcDetail);
            return true;
          };

          // Unified click dispatcher: point features (dots) always win over country background.
          m.on("click", (event) => {
            if (tryAiDataCenterClick(event)) return;
            if (handlePointClick(event)) return;
            if (handleTradeRouteLineClick(event)) return;
            if (handleConflictZonePolygonClick(event)) return;
            if (handleEmbargoPolygonClick(event)) return;
            handleCountryClick(event);
          });

          // Debounce moveend so rapid pan/zoom doesn't re-trigger all filter effects.
          let moveTimer: ReturnType<typeof setTimeout> | null = null;
          m.on("moveend", () => {
            if (moveTimer) clearTimeout(moveTimer);
            moveTimer = setTimeout(() => {
              const bounds = m.getBounds();
              if (!bounds) return;
              setNewsCameraBounds({
                west: bounds.getWest(),
                south: bounds.getSouth(),
                east: bounds.getEast(),
                north: bounds.getNorth(),
              });
            }, 300);
          });

          // Signal ready immediately — layer data loads asynchronously in the background.
          markReady();
          queueResize();

          // Split enabled layers into priority (defaultEnabled) vs user-toggled.
          // Priority layers mount immediately; user-toggled layers are staggered
          // to avoid flooding IndexedDB reads and network fetches at once.
          const priorityLayers: typeof sortedLayers = [];
          const userToggledLayers: typeof sortedLayers = [];
          const deferredLayers: typeof sortedLayers = [];

          for (const layer of sortedLayers) {
            const on = layerTogglesRef.current[layer.id] ?? layer.defaultEnabled;
            if (!on) { deferredLayers.push(layer); continue; }
            if (layer.defaultEnabled) priorityLayers.push(layer);
            else userToggledLayers.push(layer);
          }

          // Mount priority layers immediately (intel-hotspots, military-activity).
          await Promise.all(
            priorityLayers.map((layer) => syncLayerMountedState(layer.id, true))
          );

          // Stagger user-toggled layers: yield to the renderer between each mount
          // so that priority layer paints and the country borders aren't starved.
          for (const layer of userToggledLayers) {
            if (cancelled) break;
            await new Promise<void>((r) => requestAnimationFrame(() => r()));
            await syncLayerMountedState(layer.id, true);
          }

          // Bring the built-in news markers layer and ALL mounted overlay layers to the front
          // so they visually render above the country-fill polygon on land areas.
          bringLayerToFront("si-news-markers-layer");
          for (const lid of Array.from(mountedLayersRef.current)) {
            const entry = NEWS_LAYER_REGISTRY_BY_ID.get(lid);
            if (!entry) continue;
            for (const mlId of getMaplibreLayerIds(lid, entry.type)) {
              bringLayerToFront(mlId);
            }
          }

          // Pre-mount deferred layers in idle time so toggling them on later is instant.
          if (typeof requestIdleCallback === "function") {
            requestIdleCallback(() => {
              if (cancelled) return;
              for (const layer of deferredLayers) {
                const layerMap = mapRef.current as unknown as Parameters<typeof maplibreRenderer.mount>[1] | null;
                if (layerMap && !mountedLayersRef.current.has(layer.id)) {
                  maplibreRenderer.mount(layer, layerMap);
                }
              }
            });
          }
        } catch (err) {
          console.error("[MapLibreNewsMap] load callback error:", err);
          markReady();
          queueResize();
        }
      });

      // Log tile/network errors but do not abort initialization.
      // The 'load' event fires independently of tile fetch failures;
      // the safety timer handles genuine style-load failures.
      m.on("error", (e) => {
        console.warn("[MapLibreNewsMap] map error:", (e as any)?.error ?? e);
      });
    };

    proceedWithMap(map);
    };

    void init().catch((error) => {
      console.error("[MapLibreNewsMap] init failed:", error);
      if (!cancelled) {
        onFatalErrorRef.current?.("init-failed");
      }
    });

    return () => {
      cancelled = true;
      if (safetyTimer !== null) clearTimeout(safetyTimer);
      if (windowResizeHandler) window.removeEventListener("resize", windowResizeHandler);
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
      if (mapRef.current) {
        mapDestroyedRef.current = true;
        mapRef.current.remove();
        mapRef.current = null;
      }
      mountedLayersRef.current.clear();
      layerDataRef.current.clear();
    };
  }, [setNewsCameraBounds, setNewsLayerHealth, setSelectedCountry, setDockSide, sortedLayers, syncLayerMountedState]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("si-news-markers")) return;
    const source = map.getSource("si-news-markers") as unknown as { setData?: (data: GeoJSON.FeatureCollection) => void };
    source.setData?.(markerGeoJson);
  }, [markerGeoJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !(map as any).isStyleLoaded?.()) return;
    for (const layer of sortedLayers) {
      const enabled = layerToggles[layer.id] ?? layer.defaultEnabled;
      void syncLayerMountedState(layer.id, enabled);
    }

    bringLayerToFront("si-news-markers-layer");
    for (const lid of Array.from(mountedLayersRef.current)) {
      const entry = NEWS_LAYER_REGISTRY_BY_ID.get(lid);
      if (!entry) continue;
      for (const mlId of getMaplibreLayerIds(lid, entry.type)) {
        bringLayerToFront(mlId);
      }
    }
  }, [layerToggles, mapReady, sortedLayers, syncLayerMountedState]);

  // ── Nuclear sites filter ──────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current as MapInstance | null;
    if (!map || !mapReady || !(map as any).isStyleLoaded?.()) return;

    const layer = sortedLayers.find((entry) => entry.id === "nuclear-sites");
    const raw = layerDataRef.current.get("nuclear-sites");
    if (!layer || !raw || !mountedLayersRef.current.has("nuclear-sites")) return;

    const filters = nuclearFiltersRef.current ?? undefined;
    const bounds = cameraBoundsRef.current ?? null;
    const filtered = applyNuclearFilters(raw, filters as NuclearFilters | undefined, bounds);
    maplibreRenderer.updateData(layer, map as any, filtered);
  }, [mapReady, sortedLayers, nuclearFilters]);

  // ── Arms embargo filter ─────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current as MapInstance | null;
    if (!map || !mapReady || !(map as any).isStyleLoaded?.()) return;

    const layer = sortedLayers.find((entry) => entry.id === "arms-embargo-zones");
    const raw = layerDataRef.current.get("arms-embargo-zones");
    if (!layer || !raw || !mountedLayersRef.current.has("arms-embargo-zones")) return;

    const af = armsEmbargoFiltersRef.current ?? undefined;
    const bounds = cameraBoundsRef.current ?? null;
    const filtered = applyArmsEmbargoFilters(raw, af as ArmsEmbargoFilters | undefined, bounds);
    maplibreRenderer.updateData(layer, map as any, filtered);
  }, [mapReady, sortedLayers, armsEmbargoFilters]);

  // ── Conflict zones filter ───────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current as MapInstance | null;
    if (!map || !mapReady || !(map as any).isStyleLoaded?.()) return;

    const layer = sortedLayers.find((entry) => entry.id === "conflict-zones");
    const raw = layerDataRef.current.get("conflict-zones");
    if (!layer || !raw || !mountedLayersRef.current.has("conflict-zones")) return;

    const cf = conflictFiltersRef.current ?? undefined;
    const bounds = cameraBoundsRef.current ?? null;
    const filtered = applyConflictZoneFilters(raw, cf as ConflictFilters | undefined, bounds);
    maplibreRenderer.updateData(layer, map as any, filtered);
  }, [mapReady, sortedLayers, conflictFilters]);

  // ── UCDP events filter ──────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current as MapInstance | null;
    if (!map || !mapReady || !(map as any).isStyleLoaded?.()) return;

    const layer = sortedLayers.find((entry) => entry.id === "ucdp-events");
    const raw = layerDataRef.current.get("ucdp-events");
    if (!layer || !raw || !mountedLayersRef.current.has("ucdp-events")) return;

    const uf = ucdpFiltersRef.current ?? undefined;
    const bounds = cameraBoundsRef.current ?? null;
    const filtered = applyUcdpFilters(raw, uf as UcdpFilters | undefined, bounds);
    maplibreRenderer.updateData(layer, map as any, filtered);
    try { setUcdpStats(aggregateUcdpStats(filtered)); } catch { /* ignore */ }
  }, [mapReady, sortedLayers, ucdpFilters]);

  // ── Economic centers filter ─────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current as MapInstance | null;
    if (!map || !mapReady || !(map as any).isStyleLoaded?.()) return;

    const layer = sortedLayers.find((entry) => entry.id === "economic-centers");
    const raw = layerDataRef.current.get("economic-centers");
    if (!layer || !raw || !mountedLayersRef.current.has("economic-centers")) return;

    const ecf = economicCenterFiltersRef.current ?? undefined;
    const bounds = cameraBoundsRef.current ?? null;
    const filtered = applyEconomicCenterFilters(raw, ecf as EconomicCenterFilters | undefined, bounds);
    maplibreRenderer.updateData(layer, map as any, filtered);
  }, [mapReady, sortedLayers, economicCenterFilters]);

  // ── Viewport-only re-filter on camera move ──────────────────────────
  // Only re-apply filters when the camera actually moves AND at least one
  // layer has viewport-only filtering enabled. This avoids 5 redundant
  // filter runs on every pan when no viewport filtering is active.
  useEffect(() => {
    const map = mapRef.current as MapInstance | null;
    if (!map || !mapReady || !(map as any).isStyleLoaded?.()) return;

    const bounds = cameraBoundsRef.current ?? null;
    if (!bounds) return;

    const nf = nuclearFiltersRef.current;
    if (nf?.inViewportOnly) {
      const layer = sortedLayers.find((e) => e.id === "nuclear-sites");
      const raw = layerDataRef.current.get("nuclear-sites");
      if (layer && raw && mountedLayersRef.current.has("nuclear-sites")) {
        maplibreRenderer.updateData(layer, map as any, applyNuclearFilters(raw, nf as NuclearFilters, bounds));
      }
    }

    const af = armsEmbargoFiltersRef.current;
    if (af?.inViewportOnly) {
      const layer = sortedLayers.find((e) => e.id === "arms-embargo-zones");
      const raw = layerDataRef.current.get("arms-embargo-zones");
      if (layer && raw && mountedLayersRef.current.has("arms-embargo-zones")) {
        maplibreRenderer.updateData(layer, map as any, applyArmsEmbargoFilters(raw, af as ArmsEmbargoFilters, bounds));
      }
    }

    const cf = conflictFiltersRef.current;
    if ((cf as any)?.inViewportOnly) {
      const layer = sortedLayers.find((e) => e.id === "conflict-zones");
      const raw = layerDataRef.current.get("conflict-zones");
      if (layer && raw && mountedLayersRef.current.has("conflict-zones")) {
        maplibreRenderer.updateData(layer, map as any, applyConflictZoneFilters(raw, cf as ConflictFilters, bounds));
      }
    }

    const uf = ucdpFiltersRef.current;
    if ((uf as UcdpFilters | null)?.inViewportOnly) {
      const layer = sortedLayers.find((e) => e.id === "ucdp-events");
      const raw = layerDataRef.current.get("ucdp-events");
      if (layer && raw && mountedLayersRef.current.has("ucdp-events")) {
        const filtered = applyUcdpFilters(raw, uf as UcdpFilters, bounds);
        maplibreRenderer.updateData(layer, map as any, filtered);
        try { setUcdpStats(aggregateUcdpStats(filtered)); } catch { /* ignore */ }
      }
    }

    const ecf = economicCenterFiltersRef.current;
    if ((ecf as any)?.inViewportOnly) {
      const layer = sortedLayers.find((e) => e.id === "economic-centers");
      const raw = layerDataRef.current.get("economic-centers");
      if (layer && raw && mountedLayersRef.current.has("economic-centers")) {
        maplibreRenderer.updateData(layer, map as any, applyEconomicCenterFilters(raw, ecf as EconomicCenterFilters, bounds));
      }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, cameraBounds]);

  useEffect(() => {
    const map = mapRef.current as MapInstance | null;
    if (!map || !mapReady || !(map as any).isStyleLoaded?.()) return;

    const srcId = "si-news-src-ucdp-events";
    const heatId = "si-news-layer-ucdp-events-heatmap";
    const anyMap = map as any;

    if (ucdpHeatmap && ucdpLayerEnabled) {
      if (!anyMap.getSource(srcId)) return;
      if (!anyMap.getLayer(heatId)) {
        anyMap.addLayer({
          id: heatId,
          type: "heatmap",
          source: srcId,
          paint: {
            "heatmap-weight": [
              "interpolate",
              ["linear"],
              ["coalesce", ["get", "fatalities_best"], 1],
              0, 0,
              10, 0.5,
              100, 1,
            ],
            "heatmap-intensity": 0.6,
            "heatmap-radius": 20,
            "heatmap-opacity": 0.6,
          },
        });
      }
    } else {
      if (anyMap.getLayer(heatId)) anyMap.removeLayer(heatId);
    }
  }, [mapReady, ucdpHeatmap, ucdpLayerEnabled]);

  useEffect(() => {
    const map = mapRef.current as MapInstance | null;
    if (!map || !mapReady || !(map as any).isStyleLoaded?.()) return;

          const circleLayerId = "si-news-layer-military-bases-circle";

          const handleBaseClick = (event: any) => {
            const feature = event.features?.[0] as GeoJSON.Feature | undefined;
            if (!feature || feature.geometry?.type !== "Point") {
              return;
            }

            const detail = buildMilitaryBaseDetail(feature, event);
            if (!detail) return;
            dotDetailRef.current = detail;
            setDotDetail(detail);
          };

          const hasLayer = !!map.getLayer(circleLayerId);
          if (!hasLayer) return;

          map.on("click", circleLayerId, handleBaseClick);

          return () => {
            if ((map as any).off) {
              (map as any).off("click", circleLayerId, handleBaseClick);
            }
          };
        }, [mapReady]);

  useEffect(() => {
    // No-op effect currently; preserved in case mapReady side-effects are added later.
  }, [mapReady]);

  const grouped = useMemo(() => {
    const hidden = new Set(["trade-route-nodes"]);
    const byCat = new Map<string, typeof sortedLayers>();
    for (const layer of sortedLayers) {
      if (hidden.has(layer.id)) continue;
      const rows = byCat.get(layer.category) ?? [];
      rows.push(layer);
      byCat.set(layer.category, rows);
    }
    return Array.from(byCat.entries());
  }, [sortedLayers]);

  return (
    <div className="si-news-map-container">
      <div className={`si-news-map-layout${isMobile ? " is-phone" : ""}`.trim()}>
        <aside
          className={`si-news-layers-panel${isMobile ? " is-phone" : ""}${isMobile && mobileLayersOpen ? " is-mobile-open" : ""}`.trim()}
          aria-label="News map layers"
        >
          <div className="si-news-layers-header">
            <div className="si-news-layers-title">LAYERS</div>
            {isMobile ? (
              <button
                type="button"
                className="si-news-map-mobile-toggle"
                onClick={() => setMobileLayersOpen(false)}
              >
                CLOSE
              </button>
            ) : null}
          </div>
          <input
            type="text"
            className="si-news-layer-search"
            placeholder="Filter layers..."
            value={layerSearchQuery}
            onChange={(e) => setLayerSearchQuery(e.target.value)}
          />
          <div className="si-news-layers-scroll">
            {grouped.map(([category, layers]) => {
              const lq = layerSearchQuery.toLowerCase();
              const filtered = lq
                ? layers.filter((l) => l.label.toLowerCase().includes(lq) || l.id.toLowerCase().includes(lq))
                : layers;
              if (filtered.length === 0) return null;
              return [category, filtered] as const;
            }).filter(Boolean).map((entry) => {
              const [category, layers] = entry as [string, typeof sortedLayers];
              return (
              <div key={category} className="si-news-layers-group">
                <div className="si-news-layers-group-label">{category.toUpperCase()}</div>
                {layers.map((layer) => {
                  const enabled = layerToggles[layer.id] ?? layer.defaultEnabled;
                  const health = layerHealth[layer.id];
                  const status = health?.status ?? "unavailable";
                  const showIntelTimeWindow = layer.id === "intel-hotspots" && enabled;
                  const showConflictControls = layer.id === "conflict-zones" && enabled;
                  return (
                    <div key={layer.id} className="si-news-layer-row" data-cat={layer.category}>
                      <Toggle
                        checked={enabled}
                        onChange={(checked) => setNewsLayerToggle(layer.id, checked)}
                        label={`${layer.icon} ${layer.label}`}
                      />
                      {showIntelTimeWindow ? (
                        <select
                          className="si-hotspot-layer-window"
                          value={intelTimeWindow}
                          onChange={(event) => {
                            const next = event.target.value as HotspotTimeWindow;
                            if (next !== "6h" && next !== "24h" && next !== "7d") return;
                            setIntelTimeWindow(next);
                            try {
                              window.localStorage.setItem("wv:intel-hotspots:timeWindow", next);
                            } catch {
                              // no-op
                            }
                            runtimeRef.current?.refresh("intel-hotspots");
                          }}
                          aria-label="Intel hotspot time window"
                        >
                          <option value="6h">6h</option>
                          <option value="24h">24h</option>
                          <option value="7d">7d</option>
                        </select>
                      ) : null}
                      {showConflictControls ? (
                        <>
                          <select
                            className="si-hotspot-layer-window"
                            value={conflictTimeWindow}
                            onChange={(event) => {
                              const next = event.target.value as typeof conflictTimeWindow;
                              if (next !== "6h" && next !== "24h" && next !== "7d" && next !== "30d" && next !== "90d") return;
                              setConflictTimeWindow(next);
                              try {
                                window.localStorage.setItem("wv:conflict-zones:timeWindow", next);
                              } catch { /* no-op */ }
                              runtimeRef.current?.refresh("conflict-zones");
                            }}
                            aria-label="Conflict zone time window"
                          >
                            <option value="6h">6h</option>
                            <option value="24h">24h</option>
                            <option value="7d">7d</option>
                            <option value="30d">30d</option>
                            <option value="90d">90d</option>
                          </select>
                          <button
                            type="button"
                            className="si-hotspot-layer-window"
                            onClick={() => {
                              const next = conflictMode === "strict" ? "broad" : "strict";
                              setConflictMode(next);
                              try {
                                window.localStorage.setItem("wv:conflict-zones:mode", next);
                              } catch { /* no-op */ }
                              runtimeRef.current?.refresh("conflict-zones");
                            }}
                            aria-label="Strict or broader signals"
                          >
                            {conflictMode === "broad" ? "Signals+" : "Strict"}
                          </button>
                        </>
                      ) : null}
                      <span className={`si-panel-health is-${toLayerHealthUi(status)}`} title={status} />
                    </div>
                  );
                })}
              </div>
            );
            })}
            {nuclearLayerEnabled && nuclearFilters ? (
              <div className="si-news-layers-group">
                <div className="si-news-layers-group-label">NUCLEAR FILTERS</div>
                <div className="si-news-layer-row">
                  <div className="si-news-nuclear-chips">
                    {(nuclearFilters.types ?? []).map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`si-hotspot-window-btn ${
                          nuclearFilters.types?.includes(t) ? "is-active" : ""
                        }`}
                        onClick={() => {
                          const current = nuclearFilters.types ?? [];
                          const active = current.includes(t);
                          const next = active
                            ? current.filter((v) => v !== t)
                            : [...current, t];
                          setNuclearFilters({ types: next });
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="si-news-layer-row">
                  <div className="si-news-nuclear-chips">
                    {(nuclearFilters.statuses ?? []).map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`si-hotspot-window-btn ${
                          nuclearFilters.statuses?.includes(s) ? "is-active" : ""
                        }`}
                        onClick={() => {
                          const current = nuclearFilters.statuses ?? [];
                          const active = current.includes(s);
                          const next = active
                            ? current.filter((v) => v !== s)
                            : [...current, s];
                          setNuclearFilters({ statuses: next });
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="si-news-layer-row">
                  <label className="si-news-nuclear-viewport">
                    <input
                      type="checkbox"
                      checked={Boolean(nuclearFilters.inViewportOnly)}
                      onChange={(e) =>
                        setNuclearFilters({ inViewportOnly: e.target.checked })
                      }
                    />
                    Show only within viewport
                  </label>
                </div>
                <div className="si-news-layer-row">
                  <input
                    type="text"
                    className="si-hotspot-layer-window"
                    placeholder="Search name / operator / country"
                    value={nuclearFilters.searchText}
                    onChange={(e) =>
                      setNuclearFilters({ searchText: e.target.value })
                    }
                  />
                </div>
              </div>
            ) : null}
            {economicCenterLayerEnabled && economicCenterFilters ? (
              <div className="si-news-layers-group">
                <div className="si-news-layers-group-label">ECONOMIC CENTERS</div>
                <div className="si-news-layer-row">
                  <label style={{ fontSize: 10, color: "var(--si-text-muted,#6b7280)" }}>
                    Score threshold: {economicCenterFilters.scoreThreshold}
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={90}
                    step={5}
                    value={economicCenterFilters.scoreThreshold}
                    onChange={(e) =>
                      setEconomicCenterFilters({ scoreThreshold: Number(e.target.value) })
                    }
                    style={{ width: "100%" }}
                  />
                </div>
                <div className="si-news-layer-row">
                  <div className="si-news-nuclear-chips">
                    {(["balanced", "finance", "trade"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`si-hotspot-window-btn ${economicCenterFilters.mode === m ? "is-active" : ""}`}
                        onClick={() => setEconomicCenterFilters({ mode: m })}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="si-news-layer-row">
                  <label className="si-news-nuclear-viewport">
                    <input
                      type="checkbox"
                      checked={Boolean(economicCenterFilters.viewportOnly)}
                      onChange={(e) =>
                        setEconomicCenterFilters({ viewportOnly: e.target.checked })
                      }
                    />
                    Show only within viewport
                  </label>
                </div>
                <div className="si-news-layer-row">
                  <input
                    type="text"
                    className="si-hotspot-layer-window"
                    placeholder="Search city / country"
                    value={economicCenterFilters.searchText}
                    onChange={(e) =>
                      setEconomicCenterFilters({ searchText: e.target.value })
                    }
                  />
                </div>
              </div>
            ) : null}
            {armsEmbargoLayerEnabled && armsEmbargoFilters ? (
              <div className="si-news-layers-group">
                <div className="si-news-layers-group-label">EMBARGO FILTERS</div>
                <div className="si-news-layer-row">
                  <div className="si-news-nuclear-chips">
                    {["UNSC", "EU", "UK", "US", "Other"].map((auth) => (
                      <button
                        key={auth}
                        type="button"
                        className={`si-hotspot-window-btn ${
                          armsEmbargoFilters.authorities.includes(auth) ? "is-active" : ""
                        }`}
                        onClick={() => {
                          const current = armsEmbargoFilters.authorities;
                          const active = current.includes(auth);
                          const next = active
                            ? current.filter((v) => v !== auth)
                            : [...current, auth];
                          setArmsEmbargoFilters({ authorities: next });
                        }}
                      >
                        {auth}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="si-news-layer-row">
                  <div className="si-news-nuclear-chips">
                    {["Active", "Ended", "Unknown"].map((st) => (
                      <button
                        key={st}
                        type="button"
                        className={`si-hotspot-window-btn ${
                          armsEmbargoFilters.statuses.includes(st) ? "is-active" : ""
                        }`}
                        onClick={() => {
                          const current = armsEmbargoFilters.statuses;
                          const active = current.includes(st);
                          const next = active
                            ? current.filter((v) => v !== st)
                            : [...current, st];
                          setArmsEmbargoFilters({ statuses: next });
                        }}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="si-news-layer-row">
                  <div className="si-news-nuclear-chips">
                    {["Full", "Partial", "Unknown"].map((sc) => (
                      <button
                        key={sc}
                        type="button"
                        className={`si-hotspot-window-btn ${
                          armsEmbargoFilters.scopes.includes(sc) ? "is-active" : ""
                        }`}
                        onClick={() => {
                          const current = armsEmbargoFilters.scopes;
                          const active = current.includes(sc);
                          const next = active
                            ? current.filter((v) => v !== sc)
                            : [...current, sc];
                          setArmsEmbargoFilters({ scopes: next });
                        }}
                      >
                        {sc}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="si-news-layer-row">
                  <label className="si-news-nuclear-viewport">
                    <input
                      type="checkbox"
                      checked={Boolean(armsEmbargoFilters.inViewportOnly)}
                      onChange={(e) =>
                        setArmsEmbargoFilters({ inViewportOnly: e.target.checked })
                      }
                    />
                    Show only within viewport
                  </label>
                </div>
                <div className="si-news-layer-row">
                  <input
                    type="text"
                    className="si-hotspot-layer-window"
                    placeholder="Search country / programme / legal basis"
                    value={armsEmbargoFilters.searchText}
                    onChange={(e) =>
                      setArmsEmbargoFilters({ searchText: e.target.value })
                    }
                  />
                </div>
              </div>
            ) : null}
            {conflictZoneLayerEnabled && conflictFilters ? (
              <div className="si-news-layers-group">
                <div className="si-news-layers-group-label">CONFLICT ZONE FILTERS</div>
                <div className="si-news-layer-row">
                  <label className="si-news-nuclear-viewport">
                    <input
                      type="checkbox"
                      checked={Boolean(conflictFilters.inViewportOnly)}
                      onChange={(e) =>
                        setConflictFilters({ inViewportOnly: e.target.checked })
                      }
                    />
                    Show only within viewport
                  </label>
                </div>
                {conflictZoneSourceStatus && Object.keys(conflictZoneSourceStatus).length > 0 ? (
                  <div className="si-news-layer-row" style={{ fontSize: 10, opacity: 0.8 }}>
                    Data: {Object.entries(conflictZoneSourceStatus).map(([k, v]) => `${k}=${v}`).join(", ")}
                  </div>
                ) : null}
              </div>
            ) : null}
            {ucdpLayerEnabled ? (
              <UcdpSummaryPanel
                briefing={ucdpBriefing}
                stats={ucdpStats}
                meta={ucdpMeta}
                loading={ucdpBriefingLoading}
                degraded={ucdpBriefingDegraded}
              />
            ) : null}
            {ucdpLayerEnabled && ucdpFilters ? (
              <div className="si-news-layers-group">
                <div className="si-news-layers-group-label">UCDP FILTERS</div>
                <div className="si-news-layer-row">
                  <div className="si-news-nuclear-chips">
                    {(
                      [
                        ["state-based", "State-based"],
                        ["non-state", "Non-state"],
                        ["one-sided", "One-sided"],
                      ] as const
                    ).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        className={`si-hotspot-window-btn ${
                          ucdpFilters.violenceTypes.includes(val) ? "is-active" : ""
                        }`}
                        onClick={() => {
                          const current = ucdpFilters.violenceTypes;
                          const active = current.includes(val);
                          const next = active
                            ? current.filter((v) => v !== val)
                            : [...current, val];
                          setUcdpFilters({ violenceTypes: next });
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="si-news-layer-row" style={{ gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 11, opacity: 0.7, whiteSpace: "nowrap" }}>Min fatalities</span>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    className="si-hotspot-layer-window"
                    style={{ width: 60, textAlign: "center" }}
                    value={ucdpFilters.minFatalities}
                    onChange={(e) =>
                      setUcdpFilters({
                        minFatalities: Math.max(1, parseInt(e.target.value, 10) || 1),
                      })
                    }
                  />
                </div>
                <div className="si-news-layer-row" style={{ gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 11, opacity: 0.7, whiteSpace: "nowrap" }}>Year</span>
                  <input
                    type="number"
                    min={1989}
                    max={new Date().getFullYear()}
                    className="si-hotspot-layer-window"
                    style={{ width: 70, textAlign: "center" }}
                    value={ucdpFilters.yearRange[0]}
                    onChange={(e) => {
                      const y = parseInt(e.target.value, 10);
                      if (Number.isFinite(y)) setUcdpFilters({ yearRange: [y, y] });
                    }}
                  />
                </div>
                <div className="si-news-layer-row">
                  <label className="si-news-nuclear-viewport">
                    <input
                      type="checkbox"
                      checked={Boolean(ucdpFilters.inViewportOnly)}
                      onChange={(e) =>
                        setUcdpFilters({ inViewportOnly: e.target.checked })
                      }
                    />
                    Show only within viewport
                  </label>
                </div>
                <div className="si-news-layer-row">
                  <label className="si-news-nuclear-viewport">
                    <input
                      type="checkbox"
                      checked={ucdpHeatmap}
                      onChange={(e) => setUcdpHeatmap(e.target.checked)}
                    />
                    Heatmap mode
                  </label>
                </div>
              </div>
            ) : null}
          </div>
        </aside>

        <div className="si-news-map-canvas-wrap">
          {isMobile ? (
            <div className="si-news-map-mobile-actions">
              <button
                type="button"
                className="si-news-map-mobile-toggle"
                onClick={() => setMobileLayersOpen((prev) => !prev)}
              >
                {mobileLayersOpen ? "HIDE LAYERS" : "LAYERS"}
              </button>
            </div>
          ) : null}
          <div ref={containerRef} className="si-news-map-canvas" />
          {dotDetail ? (
            <MapDotDetailPanel
              detail={dotDetail}
              onClose={() => {
                dotDetailRef.current = null;
                setDotDetail(null);
              }}
            />
          ) : null}
          {nuclearDetail ? (
            <NuclearSiteDetailCard
              detail={nuclearDetail}
              onClose={() => {
                nuclearDetailRef.current = null;
                setNuclearDetail(null);
              }}
            />
          ) : null}
          {economicCenterDetail ? (
            <EconomicCenterDetailCard
              detail={economicCenterDetail}
              onClose={() => {
                economicCenterDetailRef.current = null;
                setEconomicCenterDetail(null);
              }}
            />
          ) : null}
          {aiDataCenterDetail ? (
            <AiDataCenterDetailCard
              detail={aiDataCenterDetail}
              onClose={() => {
                aiDataCenterDetailRef.current = null;
                setAiDataCenterDetail(null);
              }}
            />
          ) : null}
          {hotspotDetail ? (
            <HotspotDetailCard
              detail={hotspotDetail}
              timeWindow={intelTimeWindow}
              onTimeWindowChange={(next) => {
                setIntelTimeWindow(next);
                try {
                  window.localStorage.setItem("wv:intel-hotspots:timeWindow", next);
                } catch {
                  // no-op
                }
                runtimeRef.current?.refresh("intel-hotspots");
              }}
              onClose={() => {
                hotspotDetailRef.current = null;
                setHotspotDetail(null);
              }}
            />
          ) : null}
          {armsEmbargoDetail ? (
            <ArmsEmbargoZoneDetailCard
              detail={armsEmbargoDetail}
              onClose={() => {
                armsEmbargoDetailRef.current = null;
                setArmsEmbargoDetail(null);
              }}
            />
          ) : null}
          {conflictZoneDetail ? (
            <ConflictZoneDetailCard
              detail={conflictZoneDetail}
              mode={conflictMode}
              verifiedOverlay={conflictVerifiedOverlay}
              sourceStatus={conflictZoneSourceStatus ?? undefined}
              onClose={() => {
                conflictZoneDetailRef.current = null;
                setConflictZoneDetail(null);
              }}
            />
          ) : null}
          {ucdpDetail ? (
            <UcdpEventDetailCard
              detail={ucdpDetail}
              onClose={() => {
                ucdpDetailRef.current = null;
                setUcdpDetail(null);
              }}
            />
          ) : null}
          {sanctionsDetail ? (
            <SanctionsEntityDetailCard
              detail={sanctionsDetail}
              onClose={() => {
                sanctionsDetailRef.current = null;
                setSanctionsDetail(null);
              }}
            />
          ) : null}
          {criticalMineralDetail ? (
            <CriticalMineralDetailCard
              detail={criticalMineralDetail}
              onClose={() => {
                criticalMineralDetailRef.current = null;
                setCriticalMineralDetail(null);
              }}
            />
          ) : null}
          {selectedCountry ? (
            <CountryDetailModal
              countryCode={selectedCountry}
              dockSide={dockSide}
              onClose={() => setSelectedCountry(null)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
