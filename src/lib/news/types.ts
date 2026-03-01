// Shared news system types used by server routes, store, and UI.

export type NewsCategory =
  | "world"
  | "markets"
  | "financial"
  | "ipo"
  | "tech"
  | "ai"
  | "cyber"
  | "semiconductors"
  | "cloud"
  | "startups"
  | "events"
  | "energy"
  | "defense"
  | "space"
  | "biotech"
  | "crypto"
  | "local"
  | "filings"
  | "watchlist";

export type CoordSource = "gdelt" | "gdelt-geo" | "wikidata" | "nominatim" | "none";

export type BackendSource = "gdelt" | "rss" | "sec" | "wikidata" | "youtube" | "derived";

export interface NewsProvenance {
  headlineSource: BackendSource;
  coordsSource: CoordSource;
  entitySource: BackendSource | "none";
  confidence: number; // 0..1
  degraded?: boolean;
}

export interface NewsArticle {
  id: string;
  headline: string;
  url: string;
  canonicalUrl: string;
  domain: string;
  source: string;
  publishedAt: number; // Unix ms
  snippet: string;
  imageUrl?: string;
  language: string;
  country?: string;
  region?: string;
  // entity info
  entity?: string;
  entityType?: "ticker" | "company" | "person" | "location" | "topic";
  aliases?: string[];
  // geo
  lat?: number;
  lon?: number;
  coordSource?: CoordSource;
  placeName?: string;
  coordConfidence?: number; // 0..1
  // classification
  category: NewsCategory;
  score: number; // 0..100
  marketMoving?: boolean;
  // dedupe / threading
  dedupeKey?: string;
  threadId?: string;
  isThreadHead?: boolean;
  threadCount?: number;
  // provenance
  backendSource: BackendSource;
  provenance: NewsProvenance;
}

export interface NormalizedNewsItem extends NewsArticle {
  recencyMinutes: number;
  watchlistHits: number;
  keywordScore: number;
  filingBoost: number;
}

export interface NewsThread {
  id: string;
  headId: string;
  headline: string;
  itemIds: string[];
  sourceCount: number;
  firstSeenAt: number;
  lastSeenAt: number;
  topScore: number;
}

export interface GeoMarker {
  id: string;
  articleId: string;
  lat: number;
  lon: number;
  headline: string;
  source: string;
  publishedAt: number;
  category: NewsCategory;
  coordSource: CoordSource;
  confidence: number;
  count?: number; // aggregated marker count
}

export interface NewsFacetOption {
  key: string;
  label: string;
  count: number;
}

export interface NewsFacetState {
  sources: NewsFacetOption[];
  categories: NewsFacetOption[];
  languages: NewsFacetOption[];
  regions: NewsFacetOption[];
  coordAvailability: NewsFacetOption[];
}

export interface NewsCameraBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface SearchRouteResult {
  items: NormalizedNewsItem[];
  markers: GeoMarker[];
  facets: NewsFacetState;
  total: number;
  degraded: Record<string, boolean>;
  backendLatency: Record<string, number>;
  backendHealth: Record<string, "ok" | "degraded" | "open_circuit">;
  timeline: GdeltTimelinePoint[];
  emptyReason: string | null;
  fallbackApplied: string[];
  activeConstraints: {
    inView: boolean;
    near: boolean;
    hasCoords: boolean;
    cat?: string;
    src?: string[];
  };
  queryEcho: {
    raw: string;
    normalized: string;
    ast: QueryAST;
  };
}

export interface SuggestionItem {
  label: string;
  value: string;
  type: "operator" | "saved" | "watchlist" | "entity" | "source" | "topic" | "place";
  confidence: number; // 0..1
}

export interface AlertRuleState {
  id: string;
  name: string;
  query: string;
  threshold: number;
  soundEnabled: boolean;
  enabled: boolean;
  lastChecked: number;
  hitCount: number;
  unreadCount: number;
  seenFingerprints: string[];
}

// ---- Query language ----

export interface NearFilter {
  lat: number;
  lon: number;
  km: number;
}

export interface QueryAST {
  freeText: string[];
  sym?: string;
  cik?: string;
  src?: string[];
  cat?: NewsCategory;
  place?: string;
  country?: string;
  near?: NearFilter;
  timespan?: "24h" | "7d" | "30d";
  fromDate?: string; // YYYY-MM-DD
  toDate?: string; // YYYY-MM-DD
  type?: "filing" | "news";
  filingForm?: string;
  has?: Array<"video" | "coords">;
  raw: string;
}

export interface QueryRoutingPlan {
  useGdeltDoc: boolean;
  useGdeltGeo: boolean;
  useRss: boolean;
  useSec: boolean;
  useWikidata: boolean;
  useYoutube: boolean;
  reasons: string[];
}

// ---- Saved searches & alerts ----

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  createdAt: number;
  alertEnabled: boolean;
}

export interface NewsAlert {
  id: string;
  searchId: string;
  name: string;
  query: string;
  threshold: number; // min new articles to trigger
  soundEnabled: boolean;
  lastChecked: number;
  hitCount: number;
  seenUrls: string[];
}

// ---- YouTube ----

export interface YouTubeLive {
  id: string;
  videoId: string;
  channelId: string;
  channelName: string;
  title: string;
  viewerCount?: number;
  thumbnailUrl?: string;
  status: "live" | "recent";
  startedAt?: string;
  publishedAt?: string;
  sourceUrl: string;
}

export interface YouTubeChannel {
  channelId: string;
  label: string;
  priority: number;
  region: string;
}

// ---- SEC EDGAR ----

export interface SecFiling {
  id: string;
  cik: string;
  companyName: string;
  formType: string;
  filedAt: string; // ISO date string
  reportDate?: string;
  accessionNumber: string;
  url: string;
  headline: string;
  snippet: string;
  publishedAt: number;
  score: number;
  category: "filings";
  backendSource: "sec";
  source: string;
  domain: string;
  language: string;
  entity?: string;
  lat?: number;
  lon?: number;
}

// ---- Wikidata ----

export interface WikidataEntity {
  qid: string;
  label: string;
  ticker?: string;
  exchange?: string;
  lat?: number;
  lon?: number;
  industry?: string;
  description?: string;
  aliases: string[];
}

// ---- GDELT raw shapes ----

export interface GdeltArticle {
  url: string;
  url_mobile?: string;
  title: string;
  seendate: string; // "YYYYMMDDTHHmmssZ"
  socialimage?: string;
  domain: string;
  language: string;
  sourcecountry: string;
}

export interface GdeltGeoPoint {
  name: string;
  fullname: string;
  countrycode: string;
  lat: number;
  lon: number;
  count: number;
  topart?: GdeltArticle;
}

export interface GdeltAggregatePoint {
  key: string;
  label: string;
  count: number;
  lat: number;
  lon: number;
}

export interface GdeltTimelinePoint {
  date: string;
  value: number;
}

// ---- Country profile (computed for modal) ----

export interface CountryProfile {
  code: string;
  name: string;
  instabilityIndex: number; // 0..100
  trend: "rising" | "stable" | "falling";
  breakdown: {
    unrest: number;
    conflict: number;
    security: number;
    information: number;
  };
  articles: NewsArticle[];
  timeline: {
    date: string; // YYYY-MM-DD
    protest: number;
    conflict: number;
    natural: number;
    military: number;
  }[];
}

// ---- Panel layout presets ----

export type NewsLayoutPreset = "news-centric" | "globe-centric" | "split";

// ---- Watchlist ----

export interface NewsWatchlist {
  tickers: string[];
  topics: string[];
  regions: string[];
  sources: string[];
}

// ---- Video panel ----

export interface NewsVideoState {
  selectedVideoId: string | null;
  selectedChannelId: string | null;
  selectedChannelFilter: string | null;
  manualUrl: string;
  mode: "live_first";
  autoRotateEnabled: boolean;
  autoRotateMinutes: number;
  autoRotatePaused: boolean;
  lastRotateAt: number;
}
