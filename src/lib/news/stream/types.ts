import type { NewsCategory, BackendSource, CoordSource } from "../types";

// ---------------------------------------------------------------------------
// Unified streaming item — the canonical shape for every item in the tape.
// Every source adapter normalizes into this before it enters the StreamStore.
// ---------------------------------------------------------------------------

export interface StreamEntity {
  name: string;
  type: "company" | "person" | "location" | "org" | "topic" | "ticker";
  ticker?: string;
}

export interface StreamGeo {
  lat: number;
  lon: number;
  placeName?: string;
  countryCode?: string;
}

export interface StreamItem {
  id: string;
  timestamp: number; // Unix ms
  sourceName: string;
  sourceUrl: string;
  sourceDomain: string;
  category: NewsCategory;
  tags: string[];
  headline: string;
  summary?: string;
  entities: StreamEntity[];
  tickers: string[];
  geo?: StreamGeo;
  confidence: number; // 0–100
  importance: number; // 0–100, computed by TOP scorer
  topSignals?: string[]; // "why it's top" hints
  duplicateCount: number;
  sources: string[]; // contributing source labels
  duplicateGroupId?: string;
  threadId?: string;
  backendSource: BackendSource | "hn" | "wikimedia";
  coordSource?: CoordSource;
  language?: string;
  imageUrl?: string;
  favorited?: boolean;
}

// ---------------------------------------------------------------------------
// Terminal tab identifiers
// ---------------------------------------------------------------------------

export type TerminalTab =
  | "TOP"
  | "WORLD"
  | "MARKETS"
  | "ENERGY"
  | "DEFENSE"
  | "CYBER"
  | "TECH"
  | "FILINGS"
  | "LOCAL";

export const TERMINAL_TABS: TerminalTab[] = [
  "TOP", "WORLD", "MARKETS", "ENERGY", "DEFENSE", "CYBER", "TECH", "FILINGS", "LOCAL",
];

export const TAB_CATEGORY_MAP: Record<TerminalTab, NewsCategory[]> = {
  TOP: [], // special — scored across all
  WORLD: ["world", "government"],
  MARKETS: ["markets", "financial", "crypto", "ipo"],
  ENERGY: ["energy"],
  DEFENSE: ["defense", "space"],
  CYBER: ["cyber"],
  TECH: ["tech", "ai", "startups", "cloud", "semiconductors"],
  FILINGS: ["filings"],
  LOCAL: ["local"],
};

// ---------------------------------------------------------------------------
// Density modes
// ---------------------------------------------------------------------------

export type DensityMode = "light" | "medium" | "heavy";

// ---------------------------------------------------------------------------
// Source adapter health
// ---------------------------------------------------------------------------

export interface SourceHealthEntry {
  sourceId: string;
  status: "live" | "cached" | "degraded" | "unavailable";
  lastSuccessAt: number | null;
  lastPollAt: number | null;
  errorCode: string | null;
  nextRetryAt: number | null;
  consecutiveFailures: number;
  itemsLastPoll: number;
}

// ---------------------------------------------------------------------------
// Stream filter params (client sends to SSE endpoint)
// ---------------------------------------------------------------------------

export interface StreamFilterParams {
  tab?: TerminalTab;
  timeWindow?: "5m" | "30m" | "2h" | "24h";
  categories?: NewsCategory[];
  minImportance?: number;
  sourceAllowlist?: string[];
  sourceBlocklist?: string[];
  entityWatchlist?: string[];
  viewportOnly?: boolean;
  bbox?: { west: number; south: number; east: number; north: number };
  searchQuery?: string;
  watchlistId?: string;
}

// ---------------------------------------------------------------------------
// Watchlist (saved filter bundle)
// ---------------------------------------------------------------------------

export interface TerminalWatchlist {
  id: string;
  name: string;
  filters: StreamFilterParams;
  createdAt: number;
  expectedFlowPerMin?: number;
  lastUpdated?: number;
}
