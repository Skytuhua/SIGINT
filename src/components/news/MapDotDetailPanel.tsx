"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

export interface DotDetailField {
  label: string;
  value: React.ReactNode;
}

export interface DotDetailData {
  layerId: string;
  layerType: string;
  title: string;
  fields: DotDetailField[];
  uid: string;
  lat?: number;
  lon?: number;
}

interface MapDotDetailPanelProps {
  detail: DotDetailData;
  onClose: () => void;
}

type MilitaryBaseEnrichResponse = {
  result?: {
    place?: {
      displayName?: string;
      country?: string | null;
      countryCode?: string | null;
    } | null;
    osm?: {
      name?: string | null;
      elementType?: "node" | "way" | "relation" | null;
      elementId?: number | null;
      elementUrl?: string | null;
      tags?: Record<string, string> | null;
      distanceKm?: number | null;
    } | null;
    wikidata?: {
      qid?: string | null;
      label?: string | null;
      description?: string | null;
      url?: string | null;
      wikipediaUrl?: string | null;
      website?: string | null;
      distanceKm?: number | null;
    } | null;
    wikipedia?: {
      title?: string | null;
      extract?: string | null;
      url?: string | null;
    } | null;
  } | null;
  degraded?: boolean;
  error?: string;
};

const militaryBaseEnrichCache = new Map<string, { fields: DotDetailField[]; expiresAt: number }>();
const MILITARY_BASE_ENRICH_TTL_MS = 24 * 60 * 60_000;

// ── Trade Route Node enrichment ──────────────────────────────────────────────

type TradeNodeEnrichResponse = {
  result?: {
    wikidata?: {
      qid?: string | null;
      label?: string | null;
      description?: string | null;
      url?: string | null;
      wikipediaUrl?: string | null;
      website?: string | null;
      imageUrl?: string | null;
      locode?: string | null;
    } | null;
    wikipedia?: {
      title?: string | null;
      extract?: string | null;
      url?: string | null;
      thumbnail?: string | null;
    } | null;
  } | null;
  degraded?: boolean;
  error?: string;
};

const tradeNodeEnrichCache = new Map<string, { fields: DotDetailField[]; expiresAt: number }>();
const TRADE_NODE_ENRICH_TTL_MS = 24 * 60 * 60_000;

// ── Trade Route Node static GeoJSON lookup ────────────────────────────────────
// MapLibre truncates long string properties during internal tile conversion,
// so we fetch the original GeoJSON and look up the feature by name to get
// full static data (summary, topExports, topImports, throughput, etc.).

type TradeNodeStaticProps = Record<string, unknown>;
let _tradeNodeGeoJsonCache: { features: { properties: TradeNodeStaticProps }[] } | null = null;
let _tradeNodeGeoJsonFetchPromise: Promise<typeof _tradeNodeGeoJsonCache> | null = null;

async function fetchTradeNodeGeoJson() {
  if (_tradeNodeGeoJsonCache) return _tradeNodeGeoJsonCache;
  if (_tradeNodeGeoJsonFetchPromise) return _tradeNodeGeoJsonFetchPromise;
  _tradeNodeGeoJsonFetchPromise = fetch("/data/news-layers/trade-route-nodes.geojson")
    .then((r) => r.json())
    .then((d) => {
      _tradeNodeGeoJsonCache = d as typeof _tradeNodeGeoJsonCache;
      return _tradeNodeGeoJsonCache;
    })
    .catch(() => null);
  return _tradeNodeGeoJsonFetchPromise;
}

function buildTradeNodeStaticFields(props: TradeNodeStaticProps): DotDetailField[] {
  const fields: DotDetailField[] = [];
  const isChokepoint = String(props.nodeType ?? "") === "chokepoint";

  const summary = String(props.summary ?? "").trim();
  if (summary) fields.push({ label: "ABOUT", value: summary });

  if (isChokepoint) {
    const dailyVessels = Number(props.dailyVessels);
    if (dailyVessels > 0)
      fields.push({ label: "DAILY VESSELS", value: `${dailyVessels.toLocaleString()} ships/day` });
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

  return fields;
}

function buildTradeNodeEnrichFields(payload: TradeNodeEnrichResponse | null): DotDetailField[] {
  if (!payload?.result) return [];
  const { wikidata, wikipedia } = payload.result;
  const fields: DotDetailField[] = [];

  const wdDesc = wikidata?.description?.trim() ?? "";
  if (wdDesc) fields.push({ label: "DESCRIPTION", value: wdDesc });

  const wdUrl = wikidata?.url?.trim() ?? "";
  const wdLabel = wikidata?.label?.trim() ?? wikidata?.qid ?? "Wikidata";
  if (wdUrl) {
    fields.push({
      label: "WIKIDATA",
      value: <a href={wdUrl} target="_blank" rel="noreferrer">{wdLabel}</a>,
    });
  }

  const wikiUrl = wikipedia?.url?.trim() ?? wikidata?.wikipediaUrl?.trim() ?? "";
  const wikiTitle = wikipedia?.title?.trim() ?? "";
  if (wikiUrl) {
    fields.push({
      label: "WIKIPEDIA",
      value: <a href={wikiUrl} target="_blank" rel="noreferrer">{wikiTitle || "Wikipedia"}</a>,
    });
  }

  const extract = wikipedia?.extract?.trim() ?? "";
  if (extract) {
    const short = extract.length > 320 ? `${extract.slice(0, 317).trimEnd()}…` : extract;
    fields.push({ label: "WIKI EXTRACT", value: short });
  }

  const website = wikidata?.website?.trim() ?? "";
  if (website) {
    let displayHost = website;
    try { displayHost = new URL(website).hostname.replace(/^www\./, ""); } catch {}
    fields.push({
      label: "WEBSITE",
      value: <a href={website} target="_blank" rel="noreferrer">{displayHost}</a>,
    });
  }

  const locode = wikidata?.locode?.trim() ?? "";
  if (locode) fields.push({ label: "UN/LOCODE", value: locode });

  if (payload.degraded) {
    fields.push({ label: "NOTE", value: "Some public sources were rate-limited or unavailable." });
  }

  return fields;
}

function parseLatLonFromLoc(value: unknown): { lat: number; lon: number } | null {
  if (typeof value !== "string") return null;
  const match = value.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

function shortSummary(text: string, maxLen = 220): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1).trimEnd()}…`;
}

function buildMilitaryEnrichFields(payload: MilitaryBaseEnrichResponse | null, lat: number, lon: number): DotDetailField[] {
  if (!payload) return [];
  if (payload.error) {
    return [{ label: "PUBLIC", value: `Public sources unavailable (${payload.error}).` }];
  }
  const result = payload.result ?? null;
  if (!result) return [];

  const fields: DotDetailField[] = [];

  const place = result.place?.displayName?.trim();
  if (place) fields.push({ label: "PLACE", value: place });

  const mapUrl = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat.toFixed(6))}&mlon=${encodeURIComponent(
    lon.toFixed(6)
  )}#map=12/${encodeURIComponent(lat.toFixed(6))}/${encodeURIComponent(lon.toFixed(6))}`;
  fields.push({
    label: "MAP",
    value: (
      <a href={mapUrl} target="_blank" rel="noreferrer">
        OpenStreetMap
      </a>
    ),
  });

  const osmUrl = result.osm?.elementUrl?.trim() ?? "";
  if (osmUrl) {
    const osmName = (result.osm?.name ?? "OSM feature").toString().trim();
    fields.push({
      label: "OSM",
      value: (
        <a href={osmUrl} target="_blank" rel="noreferrer">
          {osmName}
        </a>
      ),
    });
    const operator = result.osm?.tags?.operator?.trim() ?? "";
    if (operator) fields.push({ label: "OPERATOR", value: operator });
  }

  const wikidataUrl = result.wikidata?.url?.trim() ?? "";
  if (wikidataUrl) {
    const label = (result.wikidata?.label ?? result.wikidata?.qid ?? "Wikidata").toString().trim();
    fields.push({
      label: "WIKIDATA",
      value: (
        <a href={wikidataUrl} target="_blank" rel="noreferrer">
          {label}
        </a>
      ),
    });
  }

  const wikiUrl = result.wikipedia?.url?.trim() ?? result.wikidata?.wikipediaUrl?.trim() ?? "";
  const wikiTitle = result.wikipedia?.title?.trim() ?? "";
  if (wikiUrl) {
    fields.push({
      label: "WIKI",
      value: (
        <a href={wikiUrl} target="_blank" rel="noreferrer">
          {wikiTitle || "Wikipedia"}
        </a>
      ),
    });
  }

  const extract = result.wikipedia?.extract?.trim() ?? "";
  if (extract) fields.push({ label: "INFO", value: shortSummary(extract) });

  const website = result.wikidata?.website?.trim() ?? result.osm?.tags?.website?.trim() ?? "";
  if (website) {
    fields.push({
      label: "SITE",
      value: (
        <a href={website} target="_blank" rel="noreferrer">
          {website}
        </a>
      ),
    });
  }

  if (payload.degraded) {
    fields.push({ label: "NOTE", value: "Some public sources were rate-limited or unavailable." });
  }

  return fields;
}

export default function MapDotDetailPanel({ detail, onClose }: MapDotDetailPanelProps) {
  const [mounted, setMounted] = useState(false);
  const [militaryEnrich, setMilitaryEnrich] = useState<MilitaryBaseEnrichResponse | null>(null);
  const [militaryEnrichLoading, setMilitaryEnrichLoading] = useState(false);
  const [tradeNodeEnrich, setTradeNodeEnrich] = useState<TradeNodeEnrichResponse | null>(null);
  const [tradeNodeEnrichLoading, setTradeNodeEnrichLoading] = useState(false);
  const [tradeNodeStaticFields, setTradeNodeStaticFields] = useState<DotDetailField[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const latLon = useMemo(() => {
    const lat = typeof detail.lat === "number" ? detail.lat : NaN;
    const lon = typeof detail.lon === "number" ? detail.lon : NaN;
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    const locField = detail.fields.find((f) => f.label.toUpperCase() === "LOC");
    return parseLatLonFromLoc(locField?.value) ?? null;
  }, [detail.lat, detail.lon, detail.fields]);

  // Fetch full static properties from the GeoJSON file (MapLibre strips long strings)
  useEffect(() => {
    if (detail.layerId !== "trade-route-nodes") return;
    const nodeName = detail.title;
    if (!nodeName) return;
    let cancelled = false;
    fetchTradeNodeGeoJson().then((geojson) => {
      if (cancelled || !geojson) return;
      const feature = geojson.features.find(
        (f) => String(f.properties?.name ?? "") === nodeName
      );
      if (feature?.properties) {
        setTradeNodeStaticFields(buildTradeNodeStaticFields(feature.properties));
      }
    });
    return () => { cancelled = true; };
  }, [detail.layerId, detail.title]);

  useEffect(() => {
    if (detail.layerId !== "military-bases") return;
    if (!latLon) return;

    const key = `${latLon.lat.toFixed(4)},${latLon.lon.toFixed(4)}`;
    const cached = militaryBaseEnrichCache.get(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      setMilitaryEnrich({ result: null, degraded: false });
      // Store fields in cache only; rebuild from cache below via memo.
      return;
    }

    let cancelled = false;
    const ctrl = new AbortController();
    setMilitaryEnrichLoading(true);
    setMilitaryEnrich(null);

    const run = async () => {
      try {
        const params = new URLSearchParams({
          lat: latLon.lat.toFixed(6),
          lon: latLon.lon.toFixed(6),
        });
        const res = await fetch(`/api/news/military-bases/enrich?${params.toString()}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`http-${res.status}`);
        const json = (await res.json()) as MilitaryBaseEnrichResponse;
        if (cancelled) return;
        setMilitaryEnrich(json);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "fetch-failed";
        setMilitaryEnrich({ error: message });
      } finally {
        if (!cancelled) setMilitaryEnrichLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [detail.layerId, detail.uid, latLon]);

  // Trade route node enrichment effect
  useEffect(() => {
    if (detail.layerId !== "trade-route-nodes") return;
    const wikidataIdField = detail.fields.find((f) => f.label === "WIKIDATA_ID");
    const wikidataId = typeof wikidataIdField?.value === "string" ? wikidataIdField.value.trim() : "";
    if (!wikidataId) return;

    const key = wikidataId;
    const cached = tradeNodeEnrichCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      setTradeNodeEnrich({ result: null });
      return;
    }

    let cancelled = false;
    const ctrl = new AbortController();
    setTradeNodeEnrichLoading(true);
    setTradeNodeEnrich(null);

    const run = async () => {
      try {
        const res = await fetch(`/api/news/layers/trade-route-nodes/enrich?wikidataId=${encodeURIComponent(wikidataId)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`http-${res.status}`);
        const json = (await res.json()) as TradeNodeEnrichResponse;
        if (cancelled) return;
        setTradeNodeEnrich(json);
      } catch (err) {
        if (cancelled) return;
        setTradeNodeEnrich({ error: err instanceof Error ? err.message : "fetch-failed" });
      } finally {
        if (!cancelled) setTradeNodeEnrichLoading(false);
      }
    };

    void run();
    return () => { cancelled = true; ctrl.abort(); };
  }, [detail.layerId, detail.uid, detail.fields]);

  const tradeNodeExtraFields = useMemo(() => {
    if (detail.layerId !== "trade-route-nodes") return [];
    const wikidataIdField = detail.fields.find((f) => f.label === "WIKIDATA_ID");
    const wikidataId = typeof wikidataIdField?.value === "string" ? wikidataIdField.value.trim() : "";
    if (!wikidataId) return [];

    const cached = tradeNodeEnrichCache.get(wikidataId);
    if (cached && cached.expiresAt > Date.now()) return cached.fields;

    if (tradeNodeEnrichLoading) return [{ label: "PUBLIC DATA", value: "Fetching Wikidata + Wikipedia…" }];
    const fields = buildTradeNodeEnrichFields(tradeNodeEnrich);
    if (fields.length > 0) {
      tradeNodeEnrichCache.set(wikidataId, { fields, expiresAt: Date.now() + TRADE_NODE_ENRICH_TTL_MS });
    }
    return fields;
  }, [detail.layerId, detail.fields, detail.uid, tradeNodeEnrich, tradeNodeEnrichLoading]);

  const militaryExtraFields = useMemo(() => {
    if (detail.layerId !== "military-bases") return [];
    if (!latLon) return [];

    const key = `${latLon.lat.toFixed(4)},${latLon.lon.toFixed(4)}`;
    const cached = militaryBaseEnrichCache.get(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.fields;

    if (militaryEnrichLoading) return [{ label: "PUBLIC", value: "Fetching public sources…" }];
    const fields = buildMilitaryEnrichFields(militaryEnrich, latLon.lat, latLon.lon);
    if (fields.length > 0) {
      militaryBaseEnrichCache.set(key, { fields, expiresAt: Date.now() + MILITARY_BASE_ENRICH_TTL_MS });
    }
    return fields;
  }, [detail.layerId, latLon, militaryEnrich, militaryEnrichLoading]);

  const displayFields = useMemo(() => {
    // Strip internal sentinel fields before display
    const visible = detail.fields.filter((f) => f.label !== "WIKIDATA_ID");
    if (detail.layerId === "military-bases") {
      if (militaryExtraFields.length === 0) return visible;
      return [...visible, ...militaryExtraFields];
    }
    if (detail.layerId === "trade-route-nodes") {
      // Splice static fields (ABOUT, THROUGHPUT, etc.) after LOC/COUNTRY,
      // then append Wikidata enrichment fields at the end.
      const baseFields = visible.filter(
        (f) => !["ABOUT","THROUGHPUT","GLOBAL RANK","TOP EXPORTS","TOP IMPORTS",
                  "DAILY VESSELS","TRADE SHARE","MIN WIDTH","CONTROLLED BY","PRIMARY CARGO"].includes(f.label)
      );
      return [...baseFields, ...tradeNodeStaticFields, ...tradeNodeExtraFields];
    }
    return visible;
  }, [detail.fields, detail.layerId, militaryExtraFields, tradeNodeExtraFields, tradeNodeStaticFields]);

  if (!mounted) return null;

  return createPortal(
    <div className="si-dot-detail" role="dialog" aria-label="Feature details">
      <div className="si-dot-detail-hdr">
        <span className="si-dot-detail-type">{detail.layerType}</span>
        <button type="button" className="si-dot-detail-close" onClick={onClose} aria-label="Close feature details">
          ×
        </button>
      </div>

      <div className="si-dot-detail-title">{detail.title}</div>

      <div className="si-dot-detail-body">
        {displayFields.map((field, i) => (
          <div key={i} className="si-dot-detail-row">
            <span className="si-dot-detail-lbl">{field.label}</span>
            <span className="si-dot-detail-val">{field.value}</span>
          </div>
        ))}
      </div>
    </div>,
    document.body
  );
}
