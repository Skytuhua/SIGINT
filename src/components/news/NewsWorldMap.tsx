"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { perfMark } from "../../lib/news/perf";
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
import { useSIGINTStore } from "../../store";
import CountryDetailModal from "./CountryDetailModal";
import MapDotDetailPanel, { type DotDetailData } from "./MapDotDetailPanel";
import HotspotDetailCard, {
  hotspotDetailFromProps,
  type HotspotDetailData,
  type HotspotTimeWindow,
} from "./HotspotDetailCard";
import NuclearSiteDetailCard, { type NuclearSiteDetailData } from "./NuclearSiteDetailCard";
import ArmedConflictDetailCard, {
  type ArmedConflictDetailData,
} from "./ArmedConflictDetailCard";
import ArmsEmbargoZoneDetailCard, {
  type ArmsEmbargoZoneDetailData,
} from "./ArmsEmbargoZoneDetailCard";
import ConflictZoneDetailCard, {
  type ConflictZoneDetailData,
} from "./ConflictZoneDetailCard";
import UcdpEventDetailCard, {
  type UcdpEventDetailData,
} from "./UcdpEventDetailCard";
import EconomicCenterDetailCard, {
  type EconomicCenterDetailData,
} from "./EconomicCenterDetailCard";
import AiDataCenterDetailCard, {
  type AiDataCenterDetailData,
} from "./AiDataCenterDetailCard";
import SanctionsEntityDetailCard, {
  type SanctionsEntityDetailData,
} from "./SanctionsEntityDetailCard";
import CriticalMineralDetailCard, {
  type CriticalMineralDetailData,
} from "./CriticalMineralDetailCard";
import Toggle from "../dashboard/controls/Toggle";
import { NEWS_LAYER_REGISTRY } from "../../lib/newsLayers/registry";
import { NewsLayerRuntime } from "../../lib/newsLayers/runtime";
import { leafletRenderer, registerLeafletForMap } from "../../lib/newsLayers/renderers/leafletRenderer";
import type { LayerFeature, LayerFeatureCollection, LayerHealthState } from "../../lib/newsLayers/types";
import { applyConflictZoneFilters } from "../../lib/newsLayers/conflictZoneFilters";
import { setLayerClickHandler } from "../../lib/newsLayers/store";
import { useIsMobile } from "../../hooks/useIsMobile";
import { propsToConflictZoneDetail } from "../../lib/server/news/conflictZones/types";

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
const CARTO_DARK_NOLABELS_TEMPLATE =
  "https://{s}.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}.png";

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
// Baseline tuning for world view; final thresholds are zoom-adjusted.
const MAX_COUNTRY_LABELS = 220;
const COUNTRY_PRIMARY_ALWAYS_INCLUDE_MAX_RANK = 4;
const COUNTRY_SECONDARY_SOFT_MAX_RANK = 8;
const COUNTRY_LABEL_MIN_DISTANCE_PX = 24;
const COUNTRY_LABEL_MUST_SHOW_KEYS = new Set<string>([
  "US",
  "CA",
  "MX",
  "BR",
  "AR",
  "GB",
  "FR",
  "DE",
  "IT",
  "ES",
  "RU",
  "TR",
  "CN",
  "IN",
  "JP",
  "KR",
  "AU",
  "ZA",
  "EG",
  "SA",
]);
const COUNTRY_LABEL_OVERRIDES: Record<string, string> = {
  US: "United States",
  CN: "China",
  RU: "Russia",
};

type ScreenRect = { left: number; right: number; top: number; bottom: number };

function rectsOverlap(a: ScreenRect, b: ScreenRect): boolean {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

function approxLabelRectForText(x: number, y: number, text: string, marginPx: number): ScreenRect {
  // Uppercase 10px bold looks ~6px per character in most fonts.
  const charWidth = 6.1;
  const width = Math.min(240, Math.max(26, text.length * charWidth + 10));
  const height = 14;
  const halfW = width / 2 + marginPx;
  const halfH = height / 2 + marginPx;
  return { left: x - halfW, right: x + halfW, top: y - halfH, bottom: y + halfH };
}

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

function toLayerHealthUi(status: LayerHealthState["status"] | "disabled"): "ok" | "loading" | "stale" | "error" | "off" {
  if (status === "disabled") return "off";
  if (status === "live") return "ok";
  if (status === "cached") return "loading";
  if (status === "degraded") return "stale";
  return "error";
}

function oppositeDockSideForLng(lng: number): "left" | "right" {
  // If selection is on the eastern hemisphere, open dock on the left, and vice versa.
  return lng >= 0 ? "left" : "right";
}

export default function NewsWorldMap({ onReady }: NewsWorldMapProps) {
  const isMobile = useIsMobile();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapCanvasRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<ManagedLeafletMap | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const countryLayerRef = useRef<LeafletGeoJSON | null>(null);
  const countryLabelLayerRef = useRef<LayerGroup | null>(null);
  const countryLabelMarkersRef = useRef<Map<string, Marker>>(new Map());
  const countryLabelCandidatesRef = useRef<
    Array<{ key: string; name: string; rank: number; lat: number; lon: number; pop?: number }>
  >([]);
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
  const runtimeRef = useRef<NewsLayerRuntime | null>(null);
  const mountedLayersRef = useRef<Set<string>>(new Set());
  const layerDataRef = useRef<Map<string, LayerFeatureCollection>>(new Map());

  const markers = useSIGINTStore((s) => s.news.markers);
  const feedItems = useSIGINTStore((s) => s.news.feedItems);
  const selectedCountry = useSIGINTStore((s) => s.news.selectedCountry);
  const layerToggles = useSIGINTStore((s) => s.news.layerToggles);
  const layerHealth = useSIGINTStore((s) => s.news.layerHealth);
  const setSelectedCountry = useSIGINTStore((s) => s.setSelectedCountry);
  const setNewsLayerToggle = useSIGINTStore((s) => s.setNewsLayerToggle);
  const setNewsLayerHealth = useSIGINTStore((s) => s.setNewsLayerHealth);
  const setNewsCameraBounds = useSIGINTStore((s) => s.setNewsCameraBounds);
  const conflictFilters = useSIGINTStore((s) => s.news.conflictFilters);
  const setConflictFilters = useSIGINTStore((s) => s.setConflictFilters);
  const cameraBounds = useSIGINTStore((s) => s.news.cameraBounds);
  const setSelectedCountryRef = useRef(setSelectedCountry);
  const selectedCountryRef = useRef<string | null>(selectedCountry);

  const mapTilerKey = (process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "").trim();
  const hasMapTilerKey = mapTilerKey.length > 0;

  const [tileLoadError, setTileLoadError] = useState(false);
  const [mobileLayersOpen, setMobileLayersOpen] = useState(false);
  const [dockSide, setDockSide] = useState<"left" | "right">("left");
  const [countryGeometryVersion, setCountryGeometryVersion] = useState(0);
  const layerTogglesRef = useRef<Record<string, boolean>>({});
  const conflictFiltersRef = useRef<typeof conflictFilters | null>(null);
  const cameraBoundsRef = useRef<typeof cameraBounds | null>(null);
  const dotDetailRef = useRef<DotDetailData | null>(null);
  const [dotDetail, setDotDetail] = useState<DotDetailData | null>(null);
  const hotspotDetailRef = useRef<HotspotDetailData | null>(null);
  const [hotspotDetail, setHotspotDetail] = useState<HotspotDetailData | null>(null);
  const nuclearDetailRef = useRef<NuclearSiteDetailData | null>(null);
  const [nuclearDetail, setNuclearDetail] = useState<NuclearSiteDetailData | null>(null);
  const armedDetailRef = useRef<ArmedConflictDetailData | null>(null);
  const [armedDetail, setArmedDetail] = useState<ArmedConflictDetailData | null>(null);
  const armsEmbargoDetailRef = useRef<ArmsEmbargoZoneDetailData | null>(null);
  const [armsEmbargoDetail, setArmsEmbargoDetail] = useState<ArmsEmbargoZoneDetailData | null>(null);
  const conflictZoneDetailRef = useRef<ConflictZoneDetailData | null>(null);
  const [conflictZoneDetail, setConflictZoneDetail] = useState<ConflictZoneDetailData | null>(null);
  const ucdpDetailRef = useRef<UcdpEventDetailData | null>(null);
  const [ucdpDetail, setUcdpDetail] = useState<UcdpEventDetailData | null>(null);
  const economicCenterDetailRef = useRef<EconomicCenterDetailData | null>(null);
  const [economicCenterDetail, setEconomicCenterDetail] = useState<EconomicCenterDetailData | null>(null);
  const aiDataCenterDetailRef = useRef<AiDataCenterDetailData | null>(null);
  const [aiDataCenterDetail, setAiDataCenterDetail] = useState<AiDataCenterDetailData | null>(null);
  const sanctionsDetailRef = useRef<SanctionsEntityDetailData | null>(null);
  const [sanctionsDetail, setSanctionsDetail] = useState<SanctionsEntityDetailData | null>(null);
  const criticalMineralDetailRef = useRef<CriticalMineralDetailData | null>(null);
  const [criticalMineralDetail, setCriticalMineralDetail] = useState<CriticalMineralDetailData | null>(null);
  const [intelTimeWindow, setIntelTimeWindow] = useState<HotspotTimeWindow>("24h");
  const [armedTimeWindow, setArmedTimeWindow] = useState<HotspotTimeWindow>("24h");
  const [armedIncludeBroader, setArmedIncludeBroader] = useState(false);
  const [conflictTimeWindow, setConflictTimeWindow] = useState<"6h" | "24h" | "7d" | "30d" | "90d">("7d");
  const [conflictMode, setConflictMode] = useState<"strict" | "broad">("strict");
  const [conflictVerifiedOverlay, setConflictVerifiedOverlay] = useState(false);

  const sortedLayers = useMemo(
    () => [...NEWS_LAYER_REGISTRY].sort((a, b) => a.stackOrder - b.stackOrder),
    []
  );

  const groupedLayers = useMemo(() => {
    const byCat = new Map<string, typeof sortedLayers>();
    for (const layer of sortedLayers) {
      const rows = byCat.get(layer.category) ?? [];
      rows.push(layer);
      byCat.set(layer.category, rows);
    }
    return Array.from(byCat.entries());
  }, [sortedLayers]);

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
    layerTogglesRef.current = layerToggles;
  }, [layerToggles]);

  useEffect(() => {
    conflictFiltersRef.current = conflictFilters ?? null;
  }, [conflictFilters]);

  useEffect(() => {
    cameraBoundsRef.current = cameraBounds ?? null;
  }, [cameraBounds]);

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
    if (!armedDetail) return;
    const enabled = layerToggles["armed-conflict"] ?? true;
    if (!enabled) {
      armedDetailRef.current = null;
      setArmedDetail(null);
    }
  }, [layerToggles, armedDetail]);

  useEffect(() => {
    if (!ucdpDetail) return;
    const enabled = layerToggles["ucdp-events"] ?? false;
    if (!enabled) {
      ucdpDetailRef.current = null;
      setUcdpDetail(null);
    }
  }, [layerToggles, ucdpDetail]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedIntel = window.localStorage.getItem("wv:intel-hotspots:timeWindow");
    const intelValue: HotspotTimeWindow =
      storedIntel === "6h" || storedIntel === "7d" ? storedIntel : "24h";
    setIntelTimeWindow(intelValue);

    const storedArmed = window.localStorage.getItem("wv:armed-conflict:timeWindow");
    const armedValue: HotspotTimeWindow =
      storedArmed === "6h" || storedArmed === "7d" ? storedArmed : "24h";
    setArmedTimeWindow(armedValue);

    const storedBroad = window.localStorage.getItem("wv:armed-conflict:broader");
    setArmedIncludeBroader(storedBroad === "1" || storedBroad === "true");

    const storedConflictTw = window.localStorage.getItem("wv:conflict-zones:timeWindow");
    if (storedConflictTw === "6h" || storedConflictTw === "24h" || storedConflictTw === "7d" || storedConflictTw === "30d" || storedConflictTw === "90d") {
      setConflictTimeWindow(storedConflictTw);
    }
    const storedConflictMode = window.localStorage.getItem("wv:conflict-zones:mode");
    if (storedConflictMode === "broad") setConflictMode("broad");
    const storedConflictVerified = window.localStorage.getItem("wv:conflict-zones:verifiedOverlay");
    setConflictVerifiedOverlay(storedConflictVerified === "1" || storedConflictVerified === "true");
  }, []);

  useLayoutEffect(() => {
    const handler = (feature: LayerFeature) => {
      if (feature.geometry.type !== "Point") return;
      const coords = feature.geometry.coordinates as [number, number];
      const [lon, lat] = coords;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      const props = feature.properties ?? {};
      const nameValue = props.name;
      const baseName =
        typeof nameValue === "string" && nameValue.trim() ? nameValue.trim() : "Military Base";

      const akaRaw = props.aka;
      const sponsorRaw = props.sponsor;
      const originRaw = props.origin;
      const summaryRaw = props.summary;

      const fields: DotDetailData["fields"] = [];
      if (typeof akaRaw === "string" && akaRaw.trim()) fields.push({ label: "ALSO KNOWN AS", value: akaRaw.trim() });
      if (typeof sponsorRaw === "string" && sponsorRaw.trim()) fields.push({ label: "SPONSOR", value: sponsorRaw.trim() });
      if (typeof originRaw === "string" && originRaw.trim()) fields.push({ label: "ORIGIN", value: originRaw.trim() });
      if (typeof summaryRaw === "string" && summaryRaw.trim()) fields.push({ label: "PROFILE", value: summaryRaw.trim() });

      const detail: DotDetailData = {
        layerId: "military-bases",
        layerType: "MILITARY BASE",
        title: baseName,
        fields: [
          ...fields,
          { label: "LOC", value: `${lat.toFixed(3)}, ${lon.toFixed(3)}` },
          { label: "SOURCE", value: "SIGINT Military Bases snapshot" },
        ],
        lat,
        lon,
        uid: `${lat}_${lon}_${Date.now()}`,
      };
      dotDetailRef.current = detail;
      setDotDetail(detail);
    };

    setLayerClickHandler("military-bases", handler);
    return () => {
      setLayerClickHandler("military-bases", null);
      dotDetailRef.current = null;
      setDotDetail(null);
    };
  }, []);

  useLayoutEffect(() => {
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

    const handler = (feature: LayerFeature) => {
      if (feature.geometry.type !== "Point") return;
      const coords = feature.geometry.coordinates as [number, number];
      const [lon, lat] = coords;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      const props = feature.properties ?? {};
      const callsign = typeof props.callsign === "string" ? props.callsign.trim() : "";
      const icao = typeof props.icao === "string" ? props.icao.trim() : "";

      const tsRaw = props.ts ?? props.time ?? props.timestamp ?? props.updatedAt;
      const tsMs =
        typeof tsRaw === "number"
          ? tsRaw
          : Number.isFinite(Number(tsRaw))
          ? Number(tsRaw)
          : Date.now();
      const when = new Date(tsMs);
      const timeLabel = Number.isFinite(when.getTime()) ? when.toUTCString() : "Unknown";

      const onGround = props.onGround === true;

      const fields: DotDetailData["fields"] = [];
      fields.push({ label: "STATUS", value: onGround ? "On ground" : "Airborne" });
      if (callsign) fields.push({ label: "CALLSIGN", value: callsign });
      if (icao) fields.push({ label: "ICAO", value: icao });

      const country = typeof props.country === "string" ? props.country.trim() : "";
      if (country) fields.push({ label: "COUNTRY", value: country });

      const reg = typeof props.registration === "string" ? props.registration.trim() : "";
      if (reg) fields.push({ label: "REG", value: reg });

      const typeCode = typeof props.aircraftType === "string" ? props.aircraftType.trim() : "";
      const typeDesc =
        typeof props.aircraftTypeDescription === "string" ? props.aircraftTypeDescription.trim() : "";
      if (typeCode || typeDesc) {
        fields.push({ label: "TYPE", value: typeDesc ? `${typeCode} — ${typeDesc}`.trim() : typeCode });
      }

      const speed = fmtSpeed(props.speedMs);
      if (speed) fields.push({ label: "SPEED", value: speed });

      const alt = fmtAlt(props.altM);
      if (alt) fields.push({ label: "ALT", value: alt });

      const heading = fmtNum(props.heading, 0);
      if (heading) fields.push({ label: "HDG", value: `${heading}°` });

      const vRate = fmtVRate(props.vRate);
      if (vRate) fields.push({ label: "V/S", value: vRate });

      const squawk = props.squawk != null ? String(props.squawk).trim() : "";
      if (squawk) fields.push({ label: "SQUAWK", value: squawk });

      const route = typeof props.route === "string" ? props.route.trim() : "";
      if (route) fields.push({ label: "ROUTE", value: route });

      const src = typeof props.source === "string" ? props.source.trim() : "";
      if (src) fields.push({ label: "FEED", value: src });

      const msgRate = fmtNum(props.messageRate, 0);
      if (msgRate) fields.push({ label: "MSGS", value: `${msgRate}` });

      const lastSeen = fmtNum(props.lastSeenSec, 0);
      if (lastSeen) fields.push({ label: "SEEN", value: `${lastSeen}s` });

      const lastPos = fmtNum(props.lastPosSec, 0);
      if (lastPos) fields.push({ label: "POS", value: `${lastPos}s` });

      const windSpd = fmtNum(props.windSpeedKt, 0);
      const windDir = fmtNum(props.windDirectionFromDeg, 0);
      if (windSpd || windDir) {
        const wind = `${windSpd ? `${windSpd} kt` : ""}${windSpd && windDir ? " @ " : ""}${
          windDir ? `${windDir}°` : ""
        }`.trim();
        if (wind) fields.push({ label: "WIND", value: wind });
      }

      const mach = fmtNum(props.mach, 2);
      if (mach) fields.push({ label: "MACH", value: mach });

      fields.push({ label: "TIME", value: timeLabel });
      fields.push({ label: "LOC", value: `${lat.toFixed(3)}, ${lon.toFixed(3)}` });
      fields.push({
        label: "SOURCE",
        value: props.isMock ? "adsb.lol military feed (fallback)" : "adsb.lol military feed",
      });

      const titleBase = callsign || icao || "Unknown";
      const detail: DotDetailData = {
        layerId: "military-activity",
        layerType: "MILITARY ACTIVITY",
        title: `MIL / ${titleBase}`,
        fields,
        uid: `${lat}_${lon}_${Date.now()}`,
      };

      dotDetailRef.current = detail;
      setDotDetail(detail);

      suppressMapClickRef.current = true;
      window.setTimeout(() => {
        suppressMapClickRef.current = false;
      }, 0);
    };

    setLayerClickHandler("military-activity", handler);
    return () => {
      setLayerClickHandler("military-activity", null);
      dotDetailRef.current = null;
      setDotDetail(null);
    };
  }, []);

  useLayoutEffect(() => {
    const handler = (feature: LayerFeature) => {
      if (feature.geometry.type !== "Point") return;
      const coords = feature.geometry.coordinates as [number, number];
      const [lon, lat] = coords;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      const props = feature.properties ?? {};
      const nameRaw = props.name ?? "Nuclear Site";
      const typeRaw = (props.type ?? props.facilityType ?? "Nuclear facility") as string;
      const operatorRaw = props.operator as string | undefined;
      const countryRaw = props.country as string | undefined;
      const admin1Raw = props.admin1 as string | undefined;
      const capacityMw = (props.capacityMw as number | undefined) ?? undefined;
      const reactorCount = props.reactorCount as number | undefined;
      const status = (props.status as any) ?? "Unknown";
      const sourceIds = (props.sourceIds ?? {}) as Record<string, unknown>;

      const tsRaw = props.ts ?? props.time ?? props.timestamp ?? props.lastUpdated;
      const tsMs =
        typeof tsRaw === "number"
          ? tsRaw
          : Number.isFinite(Number(tsRaw))
          ? Number(tsRaw)
          : NaN;

      const baseSummary =
        String(typeRaw).toLowerCase().includes("power plant") || typeRaw === "Nuclear Power Plant"
          ? "Open-source listed nuclear power facility."
          : "Open-source listed nuclear facility.";
      const extras: string[] = [];
      if (operatorRaw && operatorRaw.trim()) extras.push("operator metadata");
      if (typeof capacityMw === "number" && Number.isFinite(capacityMw)) {
        extras.push("capacity metadata");
      }
      if (typeof reactorCount === "number" && Number.isFinite(reactorCount)) {
        extras.push("reactor count metadata");
      }
      const summary =
        extras.length > 0 ? `${baseSummary} With ${extras.join(" and ")}.` : baseSummary;

      const sourceNames: string[] = [];
      if (sourceIds.wikidataQid) sourceNames.push("Wikidata");
      if (sourceIds.nrcId) sourceNames.push("NRC (US)");
      if (sourceIds.osmId) sourceNames.push("OSM (verification)");

      const wikidataUrl =
        typeof sourceIds.wikidataQid === "string" && sourceIds.wikidataQid
          ? `https://www.wikidata.org/wiki/${sourceIds.wikidataQid}`
          : undefined;
      const osmId =
        typeof sourceIds.osmId === "string" && sourceIds.osmId ? (sourceIds.osmId as string) : "";
      const osmUrl = osmId ? `https://www.openstreetmap.org/${osmId}` : undefined;

      const detail: NuclearSiteDetailData = {
        id: String(feature.id ?? nameRaw ?? ""),
        name: String(nameRaw),
        type: typeRaw,
        status,
        country: countryRaw,
        admin1: admin1Raw,
        operator: operatorRaw,
        capacityMw,
        reactorCount,
        lat,
        lon,
        summary,
        sourceNames: sourceNames.length ? sourceNames : ["Open-source datasets"],
        wikidataUrl,
        osmUrl,
        nrcUrl: undefined,
        lastUpdated: Number.isFinite(tsMs) ? tsMs : null,
        sourceStatus: undefined,
      };

      nuclearDetailRef.current = detail;
      setNuclearDetail(detail);
    };

    setLayerClickHandler("nuclear-sites", handler);
    return () => {
      setLayerClickHandler("nuclear-sites", null);
      nuclearDetailRef.current = null;
      setNuclearDetail(null);
    };
  }, []);

  useLayoutEffect(() => {
    const handler = (feature: LayerFeature) => {
      if (feature.geometry.type !== "Point") return;
      const coords = feature.geometry.coordinates as [number, number];
      const [lon, lat] = coords;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      const props = { ...feature.properties, id: feature.id } as Record<string, unknown>;

      const locationName =
        typeof props.locationName === "string" ? (props.locationName as string) : "";
      const country =
        typeof props.country === "string" ? (props.country as string).toUpperCase() : "";
      const locationLine = [locationName, country].filter(Boolean).join(", ");

      const sev =
        typeof props.severity === "number" && Number.isFinite(props.severity)
          ? (props.severity as number)
          : 0;
      const rawLabel = typeof props.severityLabel === "string" ? props.severityLabel : "";
      const sevLabel: ArmedConflictDetailData["severityLabel"] =
        rawLabel === "Low" ||
        rawLabel === "Elevated" ||
        rawLabel === "High" ||
        rawLabel === "Severe"
          ? rawLabel
          : "Low";

      const confidence =
        typeof props.confidence === "number" && Number.isFinite(props.confidence)
          ? (props.confidence as number)
          : 0;

      const startTime =
        typeof props.startTime === "number" && Number.isFinite(props.startTime)
          ? (props.startTime as number)
          : feature.ts;
      const endTime =
        typeof props.endTime === "number" && Number.isFinite(props.endTime)
          ? (props.endTime as number)
          : undefined;

      const headline =
        typeof props.headline === "string" && props.headline.trim()
          ? (props.headline as string)
          : String(feature.id ?? (locationLine || "Armed conflict signal"));
      const summary = typeof props.summary === "string" ? (props.summary as string) : headline;

      const timeWindowRaw = props.timeWindow;
      const timeWindow =
        timeWindowRaw === "6h" || timeWindowRaw === "24h" || timeWindowRaw === "7d"
          ? (timeWindowRaw as string)
          : "24h";

      const numSources =
        typeof props.numSources === "number" && Number.isFinite(props.numSources)
          ? (props.numSources as number)
          : null;
      const numArticles =
        typeof props.numArticles === "number" && Number.isFinite(props.numArticles)
          ? (props.numArticles as number)
          : null;
      const numMentions =
        typeof props.numMentions === "number" && Number.isFinite(props.numMentions)
          ? (props.numMentions as number)
          : null;
      const goldsteinScale =
        typeof props.goldsteinScale === "number" && Number.isFinite(props.goldsteinScale)
          ? (props.goldsteinScale as number)
          : null;
      const avgTone =
        typeof props.avgTone === "number" && Number.isFinite(props.avgTone)
          ? (props.avgTone as number)
          : null;
      const mergedEventsCount =
        typeof props.mergedEventsCount === "number" && Number.isFinite(props.mergedEventsCount)
          ? (props.mergedEventsCount as number)
          : undefined;

      const actor1Name =
        typeof props.actor1Name === "string" ? (props.actor1Name as string) : null;
      const actor2Name =
        typeof props.actor2Name === "string" ? (props.actor2Name as string) : null;
      const actor1Country =
        typeof props.actor1Country === "string" ? (props.actor1Country as string) : null;
      const actor2Country =
        typeof props.actor2Country === "string" ? (props.actor2Country as string) : null;
      const actor1Type =
        typeof props.actor1Type === "string" ? (props.actor1Type as string) : null;
      const actor2Type =
        typeof props.actor2Type === "string" ? (props.actor2Type as string) : null;

      const sourceUrl =
        typeof props.sourceUrl === "string" ? (props.sourceUrl as string) : undefined;

      const detail: ArmedConflictDetailData = {
        id: String(feature.id ?? props.id ?? headline),
        headline,
        locationLine,
        severityLabel: sevLabel,
        severityScore: sev,
        confidence,
        startTime,
        endTime,
        timeWindow,
        lat,
        lon,
        summary,
        numSources,
        numArticles,
        numMentions,
        goldsteinScale,
        avgTone,
        mergedEventsCount,
        actor1Name,
        actor2Name,
        actor1Country,
        actor2Country,
        actor1Type,
        actor2Type,
        sourceUrl,
      };

      armedDetailRef.current = detail;
      setArmedDetail(detail);

      suppressMapClickRef.current = true;
      window.setTimeout(() => {
        suppressMapClickRef.current = false;
      }, 0);
    };

    setLayerClickHandler("armed-conflict", handler);
    return () => {
      setLayerClickHandler("armed-conflict", null);
      armedDetailRef.current = null;
      setArmedDetail(null);
    };
  }, []);

  useLayoutEffect(() => {
    const handler = (feature: LayerFeature) => {
      if (feature.geometry.type !== "Point") return;
      const coords = feature.geometry.coordinates as [number, number];
      const [lon, lat] = coords;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      const props = { ...feature.properties, id: feature.id } as Record<string, unknown>;

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
        lat,
        lon,
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

      suppressMapClickRef.current = true;
      window.setTimeout(() => {
        suppressMapClickRef.current = false;
      }, 0);
    };

    setLayerClickHandler("ucdp-events", handler);
    return () => {
      setLayerClickHandler("ucdp-events", null);
      ucdpDetailRef.current = null;
      setUcdpDetail(null);
    };
  }, []);

  useLayoutEffect(() => {
    const handler = (feature: LayerFeature) => {
      if (feature.geometry.type !== "Point") return;
      const coords = feature.geometry.coordinates as [number, number];
      const [lon, lat] = coords;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      const props = { ...feature.properties, id: feature.id } as Record<string, unknown>;
      const intelDetail = hotspotDetailFromProps(props);
      if (intelDetail) {
        hotspotDetailRef.current = intelDetail;
        setHotspotDetail(intelDetail);
      }

      suppressMapClickRef.current = true;
      window.setTimeout(() => {
        suppressMapClickRef.current = false;
      }, 0);
    };

    setLayerClickHandler("intel-hotspots", handler);
    return () => {
      setLayerClickHandler("intel-hotspots", null);
      dotDetailRef.current = null;
      setDotDetail(null);
    };
  }, []);

  useLayoutEffect(() => {
    const handler = (feature: LayerFeature) => {
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      let programmes: any[] = [];
      try {
        programmes = typeof props.programmes === "string"
          ? JSON.parse(props.programmes)
          : Array.isArray(props.programmes) ? props.programmes : [];
      } catch { programmes = []; }

      const centLon = Number(props.centroidLon ?? 0);
      const centLat = Number(props.centroidLat ?? 0);
      void centLon; void centLat;

      const detail: ArmsEmbargoZoneDetailData = {
        countryCode: String(props.countryCode ?? ""),
        countryLabel: String(props.countryLabel ?? "Unknown"),
        programmes,
        programmeCount: Number(props.programmeCount ?? programmes.length),
        activeProgrammeCount: Number(props.activeProgrammeCount ?? 0),
        lastUpdated: props.lastUpdated ? String(props.lastUpdated) : null,
      };

      armsEmbargoDetailRef.current = detail;
      setArmsEmbargoDetail(detail);

      suppressMapClickRef.current = true;
      window.setTimeout(() => {
        suppressMapClickRef.current = false;
      }, 0);
    };

    setLayerClickHandler("arms-embargo-zones", handler);
    return () => {
      setLayerClickHandler("arms-embargo-zones", null);
      armsEmbargoDetailRef.current = null;
      setArmsEmbargoDetail(null);
    };
  }, []);

  useLayoutEffect(() => {
    const handler = (feature: LayerFeature) => {
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      const detailProps = propsToConflictZoneDetail(props);
      if (!detailProps) return;

      conflictZoneDetailRef.current = detailProps;
      setConflictZoneDetail(detailProps);

      suppressMapClickRef.current = true;
      window.setTimeout(() => {
        suppressMapClickRef.current = false;
      }, 0);
    };

    setLayerClickHandler("conflict-zones", handler);
    return () => {
      setLayerClickHandler("conflict-zones", null);
      conflictZoneDetailRef.current = null;
      setConflictZoneDetail(null);
    };
  }, []);

  useLayoutEffect(() => {
    const handler = (feature: LayerFeature) => {
      if (feature.geometry.type !== "Point") return;
      const coords = feature.geometry.coordinates as [number, number];
      const [lon, lat] = coords;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      const props = feature.properties ?? {};
      const name = String(props.name ?? "Trade Route Node");
      const nodeType = String(props.nodeType ?? "hub");
      const country = String(props.country ?? "");
      const isChokepoint = nodeType === "chokepoint";
      const tsRaw = props.ts ?? props.timestamp;
      const tsMs = typeof tsRaw === "number" ? tsRaw : NaN;
      const when = Number.isFinite(tsMs) ? new Date(tsMs) : null;
      const timeLabel = when ? when.toUTCString() : null;
      const fields: DotDetailData["fields"] = [];
      fields.push({ label: "TYPE", value: isChokepoint ? "Strategic Chokepoint" : "Major Trade Hub" });
      if (country) fields.push({ label: "COUNTRY", value: country });
      fields.push({ label: "LOC", value: `${lat.toFixed(2)}, ${lon.toFixed(2)}` });
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
    };
    setLayerClickHandler("trade-route-nodes", handler);
    return () => {
      setLayerClickHandler("trade-route-nodes", null);
      dotDetailRef.current = null;
      setDotDetail(null);
    };
  }, []);

  useLayoutEffect(() => {
    const handler = (feature: LayerFeature) => {
      const props = feature.properties ?? {};
      const name = String(props.name ?? "Trade Route");
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
      const fields: DotDetailData["fields"] = [];
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
    };
    setLayerClickHandler("trade-routes", handler);
    return () => {
      setLayerClickHandler("trade-routes", null);
      dotDetailRef.current = null;
      setDotDetail(null);
    };
  }, []);

  // ── Economic Centers click handler ──
  useLayoutEffect(() => {
    const handler = (feature: LayerFeature) => {
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      const coords = feature.geometry?.type === "Point"
        ? (feature.geometry.coordinates as [number, number])
        : null;
      const lon = coords ? Number(coords[0]) : NaN;
      const lat = coords ? Number(coords[1]) : NaN;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;

      let keyAssets: EconomicCenterDetailData["keyAssets"] = { exchanges: [], ports: [], airports: [] };
      let sourceTrace: EconomicCenterDetailData["sourceTrace"] = null;
      let scoreBreakdown: EconomicCenterDetailData["scoreBreakdown"] = { finance: 0, trade: 0, urban: 0, macro: 0 };
      try {
        if (typeof props.keyAssets === "string") keyAssets = JSON.parse(props.keyAssets);
        if (typeof props.sourceTrace === "string") sourceTrace = JSON.parse(props.sourceTrace);
        if (typeof props.scoreBreakdown === "string") scoreBreakdown = JSON.parse(props.scoreBreakdown);
      } catch { /* ignore parse errors */ }

      const detail: EconomicCenterDetailData = {
        id:            String(props.id ?? feature.id ?? ""),
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

      suppressMapClickRef.current = true;
      window.setTimeout(() => { suppressMapClickRef.current = false; }, 0);
    };

    setLayerClickHandler("economic-centers", handler);
    return () => {
      setLayerClickHandler("economic-centers", null);
      economicCenterDetailRef.current = null;
      setEconomicCenterDetail(null);
    };
  }, []);

  // Auto-close economic center detail when layer is toggled off
  useEffect(() => {
    if (!economicCenterDetail) return;
    const enabled = layerToggles["economic-centers"] ?? false;
    if (!enabled) {
      economicCenterDetailRef.current = null;
      setEconomicCenterDetail(null);
    }
  }, [layerToggles, economicCenterDetail]);

  // ── AI Data Centers click handler ──
  useLayoutEffect(() => {
    const handler = (feature: LayerFeature) => {
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      const coords = feature.geometry?.type === "Point"
        ? (feature.geometry.coordinates as [number, number])
        : null;
      const lon = coords ? Number(coords[0]) : NaN;
      const lat = coords ? Number(coords[1]) : NaN;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;

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

      const detail: AiDataCenterDetailData = {
        id:                  String(props.id ?? feature.id ?? ""),
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

      aiDataCenterDetailRef.current = detail;
      setAiDataCenterDetail(detail);

      suppressMapClickRef.current = true;
      window.setTimeout(() => { suppressMapClickRef.current = false; }, 0);
    };

    setLayerClickHandler("ai-data-centers", handler);
    return () => {
      setLayerClickHandler("ai-data-centers", null);
      aiDataCenterDetailRef.current = null;
      setAiDataCenterDetail(null);
    };
  }, []);

  // Auto-close AI data center detail when layer is toggled off
  useEffect(() => {
    if (!aiDataCenterDetail) return;
    const enabled = layerToggles["ai-data-centers"] ?? false;
    if (!enabled) {
      aiDataCenterDetailRef.current = null;
      setAiDataCenterDetail(null);
    }
  }, [layerToggles, aiDataCenterDetail]);

  // ── Sanctions Entities click handler ──
  useLayoutEffect(() => {
    const handler = (feature: LayerFeature) => {
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      const detail: SanctionsEntityDetailData = {
        id: String(props.id ?? feature.id ?? ""),
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
      sanctionsDetailRef.current = detail;
      setSanctionsDetail(detail);
      suppressMapClickRef.current = true;
      window.setTimeout(() => { suppressMapClickRef.current = false; }, 0);
    };

    setLayerClickHandler("sanctions-entities", handler);
    return () => {
      setLayerClickHandler("sanctions-entities", null);
      sanctionsDetailRef.current = null;
      setSanctionsDetail(null);
    };
  }, []);

  // Auto-close sanctions detail when layer is toggled off
  useEffect(() => {
    if (!sanctionsDetail) return;
    const enabled = layerToggles["sanctions-entities"] ?? false;
    if (!enabled) {
      sanctionsDetailRef.current = null;
      setSanctionsDetail(null);
    }
  }, [layerToggles, sanctionsDetail]);

  // ── Critical Minerals click handler ──
  useLayoutEffect(() => {
    const handler = (feature: LayerFeature) => {
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      let commodities: string[] = [];
      if (typeof props.commodities === "string") {
        try { commodities = JSON.parse(props.commodities); } catch { commodities = [props.commodities]; }
      } else if (Array.isArray(props.commodities)) {
        commodities = props.commodities as string[];
      }
      const coords = (feature.geometry as { coordinates?: [number, number] })?.coordinates ?? [0, 0];
      const detail: CriticalMineralDetailData = {
        id: String(props.id ?? feature.id ?? ""),
        name: String(props.name ?? ""),
        mineralType: String(props.mineralType ?? ""),
        commodities,
        depositType: String(props.depositType ?? ""),
        country: String(props.country ?? ""),
        countryName: String(props.countryName ?? ""),
        region: props.region ? String(props.region) : undefined,
        operator: props.operator ? String(props.operator) : undefined,
        status: String(props.status ?? ""),
        annualOutputTonnes: props.annualOutputTonnes != null ? Number(props.annualOutputTonnes) : undefined,
        reservesTonnes: props.reservesTonnes != null ? Number(props.reservesTonnes) : undefined,
        strategicTier: String(props.strategicTier ?? ""),
        supplyRisk: String(props.supplyRisk ?? ""),
        geopoliticalNotes: props.geopoliticalNotes ? String(props.geopoliticalNotes) : undefined,
        lat: coords[1],
        lon: coords[0],
        lastUpdated: props.ts != null ? Number(props.ts) : null,
      };
      criticalMineralDetailRef.current = detail;
      setCriticalMineralDetail(detail);
      suppressMapClickRef.current = true;
      window.setTimeout(() => { suppressMapClickRef.current = false; }, 0);
    };

    setLayerClickHandler("critical-minerals", handler);
    return () => {
      setLayerClickHandler("critical-minerals", null);
      criticalMineralDetailRef.current = null;
      setCriticalMineralDetail(null);
    };
  }, []);

  // Auto-close critical minerals detail when layer is toggled off
  useEffect(() => {
    if (!criticalMineralDetail) return;
    const enabled = layerToggles["critical-minerals"] ?? false;
    if (!enabled) {
      criticalMineralDetailRef.current = null;
      setCriticalMineralDetail(null);
    }
  }, [layerToggles, criticalMineralDetail]);

  useEffect(() => {
    if (!armsEmbargoDetail) return;
    const enabled = layerToggles["arms-embargo-zones"] ?? false;
    if (!enabled) {
      armsEmbargoDetailRef.current = null;
      setArmsEmbargoDetail(null);
    }
  }, [layerToggles, armsEmbargoDetail]);

  useEffect(() => {
    if (!conflictZoneDetail) return;
    const enabled = layerToggles["conflict-zones"] ?? false;
    if (!enabled) {
      conflictZoneDetailRef.current = null;
      setConflictZoneDetail(null);
    }
  }, [layerToggles, conflictZoneDetail]);

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
        perfMark(`country:${countryCode}:click`);
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

  const syncLayerMountedState = useCallback(
    async (layerId: string, enabled: boolean) => {
      const layer = sortedLayers.find((entry) => entry.id === layerId);
      const map = mapRef.current;
      const runtime = runtimeRef.current;
      if (!layer || !map || !runtime) return;

      if (enabled) {
        if (!mountedLayersRef.current.has(layerId)) {
          leafletRenderer.mount(layer, map);
          mountedLayersRef.current.add(layerId);
          await runtime.primeFromCache(layerId);
          runtime.enable(layerId);
        }
        const cachedData = layerDataRef.current.get(layerId);
        if (cachedData) leafletRenderer.updateData(layer, map, cachedData);
        leafletRenderer.setVisibility(layer, map, true);
        leafletRenderer.setOrder(layer, map, layer.stackOrder);
        return;
      }

      runtime.disable(layerId);
      if (layerId === "intel-hotspots" && hotspotDetailRef.current) {
        hotspotDetailRef.current = null;
        setHotspotDetail(null);
      }
      if (mountedLayersRef.current.has(layerId)) {
        leafletRenderer.unmount(layer, map);
        mountedLayersRef.current.delete(layerId);
      }
    },
    [sortedLayers]
  );

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
      registerLeafletForMap(map, L);
      map.attributionControl.setPrefix("");
      if (!map.getPane("si-country-fill")) {
        const pane = map.createPane("si-country-fill");
        pane.style.zIndex = "420";
      }
      if (!map.getPane("si-country-labels")) {
        const pane = map.createPane("si-country-labels");
        pane.style.zIndex = "1000";
      }
      if (!map.getPane("si-news-layers")) {
        const pane = map.createPane("si-news-layers");
        // Keep news overlays above country labels so they are never obscured.
        pane.style.zIndex = "1100";
      }
      if (!map.getPane("si-popup-pane")) {
        const pane = map.createPane("si-popup-pane");
        pane.style.zIndex = "2000";
      }
      if (!map.getPane("si-tooltip-pane")) {
        const pane = map.createPane("si-tooltip-pane");
        pane.style.zIndex = "2000";
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

      let renderCountryLabels: (() => void) | null = null;

      try {
        const countriesRes = await fetch(COUNTRY_GEOJSON_URL, { cache: "force-cache" });
        if (!countriesRes.ok || cancelled) {
          throw new Error(`countries-status:${countriesRes.status}`);
        }
        const countriesGeoJson = (await countriesRes.json()) as unknown;
        if (cancelled) return;

        const byIso = new Map<string, Path[]>();
        const labelByIso = new Map<
          string,
          { key: string; name: string; rank: number; lat: number; lon: number; pop?: number }
        >();
        const labelIconCache = new Map<string, DivIcon>();

        const countryLayer = L.geoJSON(countriesGeoJson as never, {
          style: () => COUNTRY_BASE_STYLE,
          interactive: true,
          bubblingMouseEvents: false,
          pane: "si-country-fill",
          onEachFeature: (feature, layer) => {
            const props = (feature as { properties?: CountryFeatureProps } | undefined)?.properties;
            if (!props) return;

            const typeRaw =
              (props.TYPE as string | undefined) ?? (props.type as string | undefined) ?? undefined;
            const typeLower = typeof typeRaw === "string" ? typeRaw.toLowerCase() : "";
            // Natural Earth marks many sovereign countries with ADM0_DIF=1 (e.g., CN, US).
            // So we only skip explicit dependencies/territories here.
            if (typeLower.includes("dependency")) return;

            const iso = countryCodeFromProps(props);
            if (!iso) return;
            const isoKey = iso.toUpperCase();

            const labelFromData = countryLabelFromProps(props) ?? countryLabelFromCode(isoKey);
            const label = COUNTRY_LABEL_OVERRIDES[isoKey] ?? labelFromData;
            const path = layer as unknown as Path;
            const existingLayers = byIso.get(isoKey);
            if (existingLayers) existingLayers.push(path);
            else byIso.set(isoKey, [path]);

            const rank = countryLabelRankFromProps(props);
            const rawLabelX =
              (props?.LABEL_X as number | string | undefined) ?? (props?.label_x as number | string | undefined);
            const rawLabelY =
              (props?.LABEL_Y as number | string | undefined) ?? (props?.label_y as number | string | undefined);
            let labelLat = Number(rawLabelY);
            let labelLon = Number(rawLabelX);

            if (!Number.isFinite(labelLat) || !Number.isFinite(labelLon)) {
              const withBounds = layer as unknown as {
                getBounds?: () => { getCenter: () => { lat: number; lng: number } };
              };
              const bounds = withBounds.getBounds?.();
              if (bounds) {
                const center = bounds.getCenter();
                labelLat = center.lat;
                labelLon = center.lng;
              }
            }

            const rawPop =
              (props?.POP_EST as number | string | undefined) ??
              (props?.pop_est as number | string | undefined) ??
              (props?.POP as number | string | undefined) ??
              (props?.pop as number | string | undefined);
            const pop = Number(rawPop);
            const popEst = Number.isFinite(pop) ? pop : undefined;

            if (Number.isFinite(labelLat) && Number.isFinite(labelLon)) {
              const existing = labelByIso.get(isoKey);
              const candidate = {
                key: isoKey,
                name: label,
                rank,
                lat: labelLat,
                lon: labelLon,
                pop: popEst,
              };
              if (
                !existing ||
                candidate.rank < existing.rank ||
                (candidate.rank === existing.rank && (candidate.pop ?? 0) > (existing.pop ?? 0))
              ) {
                labelByIso.set(isoKey, candidate);
              }
            }

            layer.on("mouseover", () => {
              applyCountryHoverStyle(isoKey);
            });

            layer.on("mouseout", () => {
              if (hoveredCountryIsoRef.current === isoKey) {
                applyCountryHoverStyle(null);
              }
            });

            layer.on("click", (event: LeafletMouseEvent) => {
              suppressMapClickRef.current = true;
              L.DomEvent.stopPropagation(event);
              perfMark(`country:${isoKey}:click`);
              const resolvedDockSide = resolveDockSideForCountry(isoKey, event.latlng.lng);
              setDockSide(resolvedDockSide);
              setSelectedCountryRef.current(isoKey);
              window.setTimeout(() => {
                suppressMapClickRef.current = false;
              }, 0);
            });
          },
        });

        countryLayer.addTo(map);
        countryLayerRef.current = countryLayer;
        // Ensure we always have a strong candidate for the United States with a clean short name.
        const usExisting = labelByIso.get("US") ?? labelByIso.get("USA");
        if (usExisting) {
          labelByIso.delete("USA");
          labelByIso.set("US", {
            key: "US",
            name: "United States",
            rank: Math.min(3, usExisting.rank),
            lat: usExisting.lat,
            lon: usExisting.lon,
            pop: usExisting.pop ?? 331_000_000,
          });
        } else {
          // Fallback anchor roughly at the continental U.S. center.
          labelByIso.set("US", {
            key: "US",
            name: "United States",
            rank: 3,
            lat: 39,
            lon: -98,
            pop: 331_000_000,
          });
        }

        countryLayersByIsoRef.current = byIso;
        countryLabelCandidatesRef.current = Array.from(labelByIso.values());
        setCountryGeometryVersion((v) => v + 1);

        renderCountryLabels = () => {
          const labelLayer = countryLabelLayerRef.current;
          if (!labelLayer) return;
          const zoom = map.getZoom();

          // Zoom-aware thresholds: sparser at world view, richer as you zoom in.
          let maxRankAllowed = COUNTRY_SECONDARY_SOFT_MAX_RANK;
          let maxLabels = MAX_COUNTRY_LABELS;
          let labelMinDistancePx = COUNTRY_LABEL_MIN_DISTANCE_PX;

          if (zoom <= 2.3) {
            // World view: try to show many countries, but keep readable via strong collision rejection.
            maxRankAllowed = 9;
            maxLabels = 260;
            labelMinDistancePx = 28;
          } else if (zoom <= 3.5) {
            // Continental view: allow more mid-rank countries.
            maxRankAllowed = 11;
            maxLabels = 320;
            labelMinDistancePx = 22;
          } else {
            // Regional zoom: dense labels are acceptable.
            maxRankAllowed = 12;
            maxLabels = 420;
            labelMinDistancePx = 16;
          }

          // Only consider reasonably important labels for this zoom, plus must-show countries.
          const candidatePool = countryLabelCandidatesRef.current.filter(
            (entry) => entry.rank <= maxRankAllowed || COUNTRY_LABEL_MUST_SHOW_KEYS.has(entry.key)
          );

          // Prefer lower rank first, then higher population, then name.
          const sortedCandidates = [...candidatePool].sort((a, b) => {
            const rankDiff = a.rank - b.rank;
            if (rankDiff !== 0) return rankDiff;
            const popA = a.pop ?? 0;
            const popB = b.pop ?? 0;
            if (popA !== popB) return popB - popA;
            return a.name.localeCompare(b.name);
          });

          // Single collision-aware pass: even important countries respect spacing,
          // but large/populous and must-show ones win when labels compete.
          const nextVisible: typeof sortedCandidates = [];
          const placedRects: ScreenRect[] = [];
          for (const entry of sortedCandidates) {
            if (nextVisible.length >= maxLabels) break;
            if (!Number.isFinite(entry.lat) || !Number.isFinite(entry.lon)) continue;

            const p = map.latLngToContainerPoint([entry.lat, entry.lon]);

            const normalizedKey = entry.key.toUpperCase();
            const isMustShow = COUNTRY_LABEL_MUST_SHOW_KEYS.has(normalizedKey);
            const rect = approxLabelRectForText(p.x, p.y, entry.name, Math.round(labelMinDistancePx / 2));

            let overlaps = false;
            for (const prevRect of placedRects) {
              if (rectsOverlap(rect, prevRect)) {
                overlaps = true;
                break;
              }
            }
            // Always allow must-show labels even if they collide a bit;
            // for all other countries, skip when overlap would be severe.
            if (!isMustShow && overlaps) continue;

            placedRects.push(rect);
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
                className: "",
                html: `<div class="si-news-map-country-label"><span>${entry.name}</span></div>`,
                iconSize: undefined,
                iconAnchor: [0, 0],
              });
              labelIconCache.set(entry.name, icon);
            }
            const marker = L.marker([entry.lat, entry.lon], {
              pane: "si-country-labels",
              icon,
              interactive: false,
              keyboard: false,
            });
            marker.addTo(labelLayer);
            countryLabelMarkersRef.current.set(entry.key, marker);
          }
        };

        renderCountryLabels?.();
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
        const bounds = map.getBounds();
        if (bounds) {
          setNewsCameraBounds({
            west: bounds.getWest(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            north: bounds.getNorth(),
          });
        }
        // Recompute which labels are shown for the new viewport/zoom.
        renderCountryLabels?.();
        if (!selectedCountryRef.current) return;
        const resolvedDockSide = resolveDockSideForCountry(selectedCountryRef.current);
        setDockSide(resolvedDockSide);
      });
      map.on("zoomend", () => {
        // Recompute which labels are shown for the new viewport/zoom.
        renderCountryLabels?.();
        if (!selectedCountryRef.current) return;
        const resolvedDockSide = resolveDockSideForCountry(selectedCountryRef.current);
        setDockSide(resolvedDockSide);
      });
      map.on("mouseout", () => {
        applyCountryHoverStyle(null);
      });

      runtimeRef.current = new NewsLayerRuntime(sortedLayers, {
        onData: (layerId, data, health) => {
          layerDataRef.current.set(layerId, data);
          setNewsLayerHealth(layerId, health);
          const liveMap = mapRef.current;
          const layer = sortedLayers.find((entry) => entry.id === layerId);
          if (!liveMap || !layer || !mountedLayersRef.current.has(layerId)) return;
          let toRender = data;
          if (layerId === "conflict-zones") {
            const cf = conflictFiltersRef.current ?? undefined;
            const bounds = cameraBoundsRef.current ?? null;
            toRender = applyConflictZoneFilters(data, cf, bounds);
          }
          leafletRenderer.updateData(layer, liveMap, toRender);
        },
        onHealth: (layerId, health) => {
          setNewsLayerHealth(layerId, health);
        },
      });

      for (const layer of sortedLayers) {
        const enabled = layerTogglesRef.current[layer.id] ?? layer.defaultEnabled;
        if (enabled) {
          await syncLayerMountedState(layer.id, true);
        }
      }

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
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
      mountedLayersRef.current.clear();
      layerDataRef.current.clear();
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
  }, [applyCountryHoverStyle, countryLabelFromCode, handleMapCountryClick, notifyReady, resolveDockSideForCountry, setNewsCameraBounds]);

  useEffect(() => {
    const map = mapRef.current;
    const runtime = runtimeRef.current;
    if (!map || !runtime) return;
    for (const layer of sortedLayers) {
      const enabled = layerToggles[layer.id] ?? layer.defaultEnabled;
      void syncLayerMountedState(layer.id, enabled);
    }
  }, [layerToggles, sortedLayers, syncLayerMountedState]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mountedLayersRef.current.has("conflict-zones")) return;
    const layer = sortedLayers.find((e) => e.id === "conflict-zones");
    const raw = layerDataRef.current.get("conflict-zones");
    if (!layer || !raw) return;
    const cf = conflictFiltersRef.current ?? undefined;
    const bounds = cameraBoundsRef.current ?? null;
    const filtered = applyConflictZoneFilters(raw, cf, bounds);
    leafletRenderer.updateData(layer, map, filtered);
  }, [conflictFilters, cameraBounds, sortedLayers]);

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
          perfMark(`country:${countryCode}:click`);
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
    <div ref={mapContainerRef} className="si-news-map-container">
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
          <div className="si-news-layers-scroll">
            {groupedLayers.map(([category, layers]) => (
              <div key={category} className="si-news-layers-group">
                <div className="si-news-layers-group-label">{category.toUpperCase()}</div>
                {layers.map((layer) => {
                  const enabled = layerToggles[layer.id] ?? layer.defaultEnabled;
                  const health = layerHealth[layer.id];
                  const status = enabled ? (health?.status ?? "unavailable") : "disabled";
                  const isIntel = layer.id === "intel-hotspots";
                  const isArmed = layer.id === "armed-conflict";
                  const isConflict = layer.id === "conflict-zones";
                  const showTimeWindow = (isIntel || isArmed || isConflict) && enabled;
                  const showArmedSignalsToggle = isArmed && enabled;
                  const showConflictControls = isConflict && enabled;
                  return (
                    <div key={layer.id} className="si-news-layer-row" data-cat={layer.category}>
                      <Toggle
                        checked={enabled}
                        onChange={(checked) => setNewsLayerToggle(layer.id, checked)}
                        label={`${layer.icon} ${layer.label}`}
                      />
                      {showTimeWindow ? (
                        isIntel ? (
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
                        ) : isArmed ? (
                          <select
                            className="si-hotspot-layer-window"
                            value={armedTimeWindow}
                            onChange={(event) => {
                              const next = event.target.value as HotspotTimeWindow;
                              if (next !== "6h" && next !== "24h" && next !== "7d") return;
                              setArmedTimeWindow(next);
                              try {
                                window.localStorage.setItem("wv:armed-conflict:timeWindow", next);
                              } catch {
                                // no-op
                              }
                              runtimeRef.current?.refresh("armed-conflict");
                            }}
                            aria-label="Armed conflict time window"
                          >
                            <option value="6h">6h</option>
                            <option value="24h">24h</option>
                            <option value="7d">7d</option>
                          </select>
                        ) : isConflict ? (
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
                        ) : null
                      ) : null}
                      {showArmedSignalsToggle ? (
                        <button
                          type="button"
                          className="si-hotspot-layer-window"
                          onClick={() => {
                            const next = !armedIncludeBroader;
                            setArmedIncludeBroader(next);
                            try {
                              window.localStorage.setItem(
                                "wv:armed-conflict:broader",
                                next ? "1" : "0"
                              );
                            } catch {
                              // no-op
                            }
                            runtimeRef.current?.refresh("armed-conflict");
                          }}
                          aria-label="Include broader conflict signals"
                        >
                          {armedIncludeBroader ? "Signals +" : "Strict"}
                        </button>
                      ) : null}
                      <span className={`si-panel-health is-${toLayerHealthUi(status)}`} title={status} />
                    </div>
                  );
                })}
              </div>
            ))}
            {layerToggles["conflict-zones"] && conflictFilters ? (
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
          <div ref={mapCanvasRef} className="si-news-map-canvas" />

          {showMapError ? (
            <div className="si-news-map-overlay-error" role="status" aria-live="polite">
              <strong className="si-news-map-overlay-error-title">{mapErrorTitle}</strong>
              <span className="si-news-map-overlay-error-text">{mapErrorBody}</span>
            </div>
          ) : null}

          <div className="si-news-map-zoom">
            <button type="button" onClick={handleZoomIn} aria-label="Zoom in">
              +
            </button>
            <button type="button" onClick={handleZoomOut} aria-label="Zoom out">
              -
            </button>
          </div>

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

          {armedDetail ? (
            <ArmedConflictDetailCard
              detail={armedDetail}
              onClose={() => {
                armedDetailRef.current = null;
                setArmedDetail(null);
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

          {selectedCountry && (
            <CountryDetailModal
              countryCode={selectedCountry}
              dockSide={dockSide}
              onClose={() => setSelectedCountry(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
