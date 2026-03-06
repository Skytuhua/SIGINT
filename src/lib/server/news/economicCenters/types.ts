import type { LayerFeatureCollection } from "../../../newsLayers/types";

// ── Sub-score breakdown ───────────────────────────────────────────────────────

export interface EconomicHubScoreBreakdown {
  finance: number; // 0–100
  trade: number;   // 0–100
  urban: number;   // 0–100
  macro: number;   // 0–100
}

// ── Key assets ────────────────────────────────────────────────────────────────

export interface EconomicHubAsset {
  name: string;
  wikidataQid: string;
}

export interface EconomicHubKeyAssets {
  exchanges: EconomicHubAsset[];
  ports: EconomicHubAsset[];
  airports: EconomicHubAsset[];
}

// ── Source provenance ─────────────────────────────────────────────────────────

export interface EconomicHubSourceTrace {
  wikidataQid: string;
  overpassQuery: string;
  worldBankIndicators: string[];
  lastUpdated: {
    wikidata: number;
    overpass: number;
    worldbank: number;
  };
}

// ── Core hub record (server-side) ─────────────────────────────────────────────

export interface EconomicHubRecord {
  /** Stable ID: "wikidata-Q{QID}" */
  id: string;
  wikidataQid: string;
  name: string;
  country: string;
  /** ISO-3166-1 alpha-2, used for World Bank API lookups */
  countryIso2: string;
  admin1?: string;
  lat: number;
  lon: number;
  population?: number;
  /** 0–100, computed after normalization across the full hub set */
  scoreTotal: number;
  scoreBreakdown: EconomicHubScoreBreakdown;
  /** Raw sub-scores before normalization (used during ranking pass) */
  rawFinance: number;
  rawTrade: number;
  rawUrban: number;
  rawMacro: number;
  /** 1-based global rank after sorting */
  rank: number;
  keyAssets: EconomicHubKeyAssets;
  sourceTrace: EconomicHubSourceTrace;
  lastUpdated: number;
}

// ── Intermediate record built during enrichment ───────────────────────────────

export interface RawEconomicHub {
  id: string;
  wikidataQid: string;
  name: string;
  country: string;
  countryIso2: string;
  admin1?: string;
  lat: number;
  lon: number;
  population?: number;
  hasExchange: boolean;
  hasPort: boolean;
  hasAirport: boolean;
  keyAssets: EconomicHubKeyAssets;
  poiCounts: PoiCount;
  macro: WBCountryMacro | null;
}

// ── POI density counts ────────────────────────────────────────────────────────

export interface PoiCount {
  banks: number;
  financial: number;
  ports: number;
  airports: number;
  industrial: number;
}

// ── World Bank macro ──────────────────────────────────────────────────────────

export interface WBCountryMacro {
  /** NY.GDP.MKTP.CD – GDP current US$ */
  gdpUsd: number | null;
  /** NE.TRD.GNFS.ZS – Trade as % of GDP */
  tradeGdpPct: number | null;
  year: number;
}

// ── Source health ─────────────────────────────────────────────────────────────

export type EconomicCenterSourceKey = "wikidata" | "overpass" | "worldbank";
export type EconomicCenterSourceStatusCode = "live" | "cached" | "degraded" | "unavailable";

export interface EconomicCenterSourceStatus {
  status: EconomicCenterSourceStatusCode;
  lastUpdated: number | null;
  errorCode: string | null;
}

export type EconomicCenterSourceStatusMap = Record<
  EconomicCenterSourceKey,
  EconomicCenterSourceStatus | undefined
>;

// ── Layer result ──────────────────────────────────────────────────────────────

export interface EconomicCenterLayerResult {
  collection: LayerFeatureCollection;
  sourceStatus: EconomicCenterSourceStatusMap;
}

// ── Wikidata SPARQL raw types ─────────────────────────────────────────────────

export type WikidataBinding = Record<string, { type: string; value: string } | undefined>;

export interface WikidataSparqlResponse {
  results?: { bindings?: WikidataBinding[] };
}

// ── OSM Overpass raw types ────────────────────────────────────────────────────

export interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  elements?: OverpassElement[];
}
