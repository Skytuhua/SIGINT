"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_LABELS, CATEGORY_PANEL_CONFIGS, LIVE_VIDEO_PANELS, NEWS_VIDEO_CHANNELS, PRESET_QUERIES } from "../../config/newsConfig";
import CategoryFeedPanel from "./CategoryFeedPanel";
import NewsTickerBar, { CATEGORY_COLORS } from "./NewsTickerBar";
import { makeFingerprint } from "../../lib/news/engine/dedupe";
import { InMemoryNewsIndex } from "../../lib/news/index/inMemoryIndex";
import { parseQuery } from "../../lib/news/query/parse";
import { stringifyQueryAst } from "../../lib/news/query/stringify";
import type {
  AlertRuleState,
  GdeltArticle,
  GeoMarker,
  NewsArticle,
  NewsFacetState,
  NormalizedNewsItem,
  SearchRouteResult,
  SuggestionItem,
  VideoPanelCategory,
  YouTubeLive,
} from "../../lib/news/types";
import { formatUtc } from "../../lib/dashboard/format";
import type { DashboardLayouts } from "../../lib/dashboard/types";
import { fetchJsonWithPolicy, isAbortError } from "../../lib/runtime/fetchJson";
import { globalRefreshRuntime } from "../../lib/runtime/globalRefreshRuntime";
import {
  readPersistentFeedCache,
  writePersistentFeedCache,
} from "../../lib/runtime/persistentFeedCache";
import { useSIGINTStore } from "../../store";
import { shallow } from "zustand/shallow";
import { List } from "react-window";
import { perfMark, perfMeasure, startJankSampler, stopJankSampler } from "../../lib/news/perf";
import Panel from "../dashboard/panel/Panel";
import PanelBody from "../dashboard/panel/PanelBody";
import PanelControls from "../dashboard/panel/PanelControls";
import PanelFooter from "../dashboard/panel/PanelFooter";
import PanelHeader from "../dashboard/panel/PanelHeader";
import dynamic from "next/dynamic";
import NewsDraggableGrid from "./NewsDraggableGrid";
import NewsPopupModal from "./NewsPopupModal";
import { useIsMobile } from "../../hooks/useIsMobile";

const NewsDailyBriefingModal = dynamic(() => import("./NewsDailyBriefingModal"), {
  ssr: false,
});

const PanelSkeleton = () => (
  <div className="si-panel-state" style={{ padding: 8 }}>
    <div className="si-skeleton-block" />
    <div className="si-skeleton-row" />
    <div className="si-skeleton-row" />
  </div>
);

const MapLibreNewsMap = dynamic(() => import("./MapLibreNewsMap"), {
  ssr: false,
  loading: PanelSkeleton,
});
const NewsWorldMap = dynamic(() => import("./NewsWorldMap"), {
  ssr: false,
  loading: PanelSkeleton,
});
const TerminalFeedPanel = dynamic(() => import("./TerminalFeedPanel"), {
  ssr: false,
  loading: PanelSkeleton,
});
const LiveVideoPanel = dynamic(() => import("./LiveVideoPanel"), {
  ssr: false,
  loading: PanelSkeleton,
});
const PredictionMarketsPanel = dynamic(() => import("./PredictionMarketsPanel"), {
  ssr: false,
  loading: PanelSkeleton,
});
const CompliancePanel = dynamic(() => import("./CompliancePanel"), {
  ssr: false,
  loading: PanelSkeleton,
});

const NEWS_REFRESH_MS = 6_000;
const VIDEO_REFRESH_MS = 75_000;
const NEWS_TERMINAL_TICK_MS = 1_000;
const NEWS_TAPE_TICK_MS = 2_000;
const NEWS_RETENTION_MS = 24 * 60 * 60_000;
const NEWS_RETENTION_MAX_ITEMS = 1200;
const LIVE_CUTOFF_MS = 15 * 60 * 1000; // items newer than this = "live" (terminal); older = category panels

const QUERY_HINT_ITEMS = [
  { chip: "sym:", hint: "Stock ticker", example: "sym:AAPL" },
  { chip: "cik:", hint: "SEC company ID", example: "cik:0000320193" },
  { chip: "src:", hint: "Source filter", example: "src:gdelt" },
  { chip: "cat:", hint: "Category", example: "cat:markets" },
  { chip: "place:", hint: "City or place", example: "place:London" },
  { chip: "country:", hint: "Country code", example: "country:US" },
  { chip: "near:", hint: "Radius search", example: "near:40.7,-74.0,100" },
  { chip: "time:", hint: "Time range", example: "time:24h" },
  { chip: "from:/to:", hint: "Date range", example: "from:2025-01-01" },
  { chip: "type:", hint: "Content type", example: "type:filing" },
  { chip: "has:", hint: "Must have", example: "has:video" },
];

const CATEGORY_TABS = [
  "world",
  "markets",
  "financial",
  "ipo",
  "tech",
  "ai",
  "cyber",
  "semiconductors",
  "cloud",
  "startups",
  "events",
  "energy",
  "defense",
  "space",
  "biotech",
  "crypto",
  "government",
  "local",
  "filings",
] as const;

const SEARCH_INDEX = new InMemoryNewsIndex(5000);
const NEWS_CACHE_META_KEY = "sigint-news-feed-cache-meta-v1";
const NEWS_CACHE_STORE_KEY = "news:workspace:feed";
const NEWS_CACHE_MAX_ITEMS = 240;
const NEWS_CACHE_MAX_MARKERS = 600;
const NEWS_CACHE_MAX_AGE_MS = 24 * 60 * 60_000;

const BLOCKED_NEWS_SOURCES = new Set(["product hunt", "producthunt.com"]);
const EMPTY_FACETS: NewsFacetState = {
  sources: [],
  categories: [],
  languages: [],
  regions: [],
  coordAvailability: [],
};

interface NewsMapOverlayProps {
  ready: boolean;
}

function NewsMapOverlay({ ready }: NewsMapOverlayProps) {
  const [showLegend, setShowLegend] = useState(false);
  return (
    <>
      <div className="si-news-globe-overlay si-news-globe-overlay-top">
        <span>{ready ? "NEWS MAP READY" : "INITIALIZING NEWS MAP..."}</span>
        <button type="button" onClick={() => setShowLegend((p) => !p)} style={{ marginLeft: 8, fontSize: 9, padding: "1px 6px", background: "var(--si-bg-2)", border: "var(--si-border) solid var(--si-line)", color: showLegend ? "var(--si-accent)" : "var(--si-text-muted)", cursor: "pointer" }}>
          LEGEND
        </button>
      </div>
      {showLegend ? (
        <div className="si-news-legend">
          {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
            <div key={cat} className="si-news-legend-row">
              <span className="si-news-legend-dot" style={{ background: color }} />
              {cat.toUpperCase()}
            </div>
          ))}
        </div>
      ) : null}
      <div className="si-news-globe-overlay si-news-globe-overlay-bottom">
        <span>2D world map with news event markers</span>
      </div>
    </>
  );
}

const VIDEO_CATEGORY_CHANNEL_IDS = new Map<VideoPanelCategory, Set<string>>();
for (const channel of NEWS_VIDEO_CHANNELS) {
  const categories = channel.categories ?? ["general"];
  for (const category of categories) {
    if (!VIDEO_CATEGORY_CHANNEL_IDS.has(category)) VIDEO_CATEGORY_CHANNEL_IDS.set(category, new Set());
    VIDEO_CATEGORY_CHANNEL_IDS.get(category)!.add(channel.channelId);
  }
}

function sortYouTubeStreamsLiveFirst(items: YouTubeLive[]): YouTubeLive[] {
  return [...items].sort((a, b) => {
    if (a.status !== b.status) return a.status === "live" ? -1 : 1;

    // For live streams, prefer higher viewer counts when available.
    if (a.status === "live" && b.status === "live") {
      const aViewers = a.viewerCount ?? -1;
      const bViewers = b.viewerCount ?? -1;
      if (aViewers !== bViewers) return bViewers - aViewers;
    }

    const aTs = Date.parse(a.publishedAt ?? "");
    const bTs = Date.parse(b.publishedAt ?? "");
    if (Number.isFinite(aTs) && Number.isFinite(bTs)) return bTs - aTs;
    return 0;
  });
}

function uniqueStreamsByVideoId(items: YouTubeLive[]): YouTubeLive[] {
  const seen = new Set<string>();
  const out: YouTubeLive[] = [];
  for (const item of items) {
    const key = item.videoId.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

interface PersistedNewsCache {
  savedAt: number;
  query: string;
  items: NewsArticle[];
  markers: GeoMarker[];
  facets: NewsFacetState;
}

interface PersistedNewsCacheMeta {
  savedAt: number;
  query: string;
  itemCount: number;
}

async function readNewsCache(): Promise<PersistedNewsCache | null> {
  const now = Date.now();
  if (typeof window !== "undefined") {
    try {
      const rawMeta = window.localStorage.getItem(NEWS_CACHE_META_KEY);
      if (rawMeta) {
        const meta = JSON.parse(rawMeta) as Partial<PersistedNewsCacheMeta>;
        const metaSavedAt = Number(meta.savedAt);
        if (Number.isFinite(metaSavedAt) && now - metaSavedAt > NEWS_CACHE_MAX_AGE_MS) {
          return null;
        }
      }
    } catch {
      // Ignore metadata parse errors; fallback to persistent payload read.
    }
  }

  const cached = await readPersistentFeedCache<PersistedNewsCache>(NEWS_CACHE_STORE_KEY);
  const entry = cached.entry;
  if (!entry) return null;
  if (now - entry.savedAt > NEWS_CACHE_MAX_AGE_MS) return null;
  const payload = entry.payload;
  if (!payload || !Array.isArray(payload.items) || !Array.isArray(payload.markers)) return null;
  return {
    savedAt: entry.savedAt,
    query: typeof payload.query === "string" ? payload.query : "",
    items: payload.items.slice(0, NEWS_CACHE_MAX_ITEMS),
    markers: payload.markers.slice(0, NEWS_CACHE_MAX_MARKERS),
    facets: payload.facets ?? EMPTY_FACETS,
  };
}

async function writeNewsCache(data: PersistedNewsCache): Promise<void> {
  const payload: PersistedNewsCache = {
    savedAt: data.savedAt,
    query: data.query,
    items: data.items.slice(0, NEWS_CACHE_MAX_ITEMS),
    markers: data.markers.slice(0, NEWS_CACHE_MAX_MARKERS),
    facets: data.facets ?? EMPTY_FACETS,
  };

  await writePersistentFeedCache({
    cacheKey: NEWS_CACHE_STORE_KEY,
    savedAt: payload.savedAt,
    expiresAt: payload.savedAt + 10 * 60_000,
    staleUntil: payload.savedAt + NEWS_CACHE_MAX_AGE_MS,
    payload,
    itemCount: payload.items.length,
  });

  if (typeof window === "undefined") return;
  try {
    const meta: PersistedNewsCacheMeta = {
      savedAt: payload.savedAt,
      query: payload.query,
      itemCount: payload.items.length,
    };
    window.localStorage.setItem(NEWS_CACHE_META_KEY, JSON.stringify(meta));
  } catch {
    // ignore metadata write errors
  }
}

interface FetchJsonOptions {
  key?: string;
  signal?: AbortSignal;
  cache?: RequestCache;
  timeoutMs?: number;
  retries?: number;
  negativeTtlMs?: number;
}

async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  return fetchJsonWithPolicy<T>(url, {
    key: options.key ?? url,
    signal: options.signal,
    cache: options.cache,
    timeoutMs: options.timeoutMs ?? 15_000,
    retries: options.retries ?? 1,
    backoffBaseMs: 400,
    negativeTtlMs: options.negativeTtlMs ?? 1_200,
  });
}

function extractEntity(item: NormalizedNewsItem): string {
  if (item.entity && item.entity !== "none" && item.entity !== "unknown") return item.entity;
  const words = item.headline.split(/\s+/);
  for (const w of words) {
    if (w.length >= 2 && w.length <= 5 && w === w.toUpperCase() && /^[A-Z]+$/.test(w)) return w;
  }
  return "";
}

function extractRegion(item: NormalizedNewsItem): string {
  if (item.region && item.region !== "none" && item.region !== "unknown") return item.region;
  if (item.country && item.country !== "none" && item.country !== "unknown") return item.country;
  if (item.placeName && item.placeName !== "none" && item.placeName !== "unknown") return item.placeName;
  try {
    const host = new URL(item.url).hostname;
    const tld = host.split(".").pop()?.toUpperCase();
    if (tld && tld.length === 2 && tld !== "IO" && tld !== "CO") return tld;
  } catch { /* ignore */ }
  return "";
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return true;
  return target.isContentEditable;
}

function parseVideoId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.replace("/", "").trim();
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (url.hostname.includes("youtube.com")) {
      const id = url.searchParams.get("v")?.trim();
      if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return id;
      const segments = url.pathname.split("/").filter(Boolean);
      const idx = segments.findIndex((seg) => seg === "embed" || seg === "live" || seg === "shorts");
      if (idx >= 0 && segments[idx + 1] && /^[A-Za-z0-9_-]{11}$/.test(segments[idx + 1])) {
        return segments[idx + 1];
      }
    }
  } catch {
    return null;
  }
  return null;
}

function playAlertTone() {
  if (typeof window === "undefined") return;
  const ctx = new window.AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = 890;
  gain.gain.value = 0.001;
  osc.connect(gain);
  gain.connect(ctx.destination);
  const now = ctx.currentTime;
  gain.gain.exponentialRampToValueAtTime(0.07, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
  osc.start(now);
  osc.stop(now + 0.22);
  void ctx.close();
}

function formatShortTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}


function toQueryBbox(bounds: { west: number; south: number; east: number; north: number } | null): string | null {
  if (!bounds) return null;
  return `${bounds.west.toFixed(5)},${bounds.south.toFixed(5)},${bounds.east.toFixed(5)},${bounds.north.toFixed(5)}`;
}

function buildSearchUrl(
  query: string,
  options: { inView: boolean; bbox: string | null; limit?: number; mode?: "pointdata" | "country" | "adm1" }
) {
  const params = new URLSearchParams();
  params.set("q", query);
  params.set("limit", String(options.limit ?? 500));
  params.set("mode", options.mode ?? "pointdata");
  if (options.inView && options.bbox) {
    params.set("inView", "true");
    params.set("bbox", options.bbox);
  }
  return `/api/news/search?${params.toString()}`;
}

function buildThreadList(items: NewsArticle[]) {
  const groups = new Map<string, NewsArticle[]>();
  items.forEach((item) => {
    const key = item.threadId ?? item.id;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  });
  return Array.from(groups.entries()).map(([id, group]) => {
    group.sort((a, b) => b.score - a.score || b.publishedAt - a.publishedAt);
    return {
      id,
      headId: group[0]?.id ?? id,
      headline: group[0]?.headline ?? id,
      itemIds: group.map((entry) => entry.id),
      sourceCount: new Set(group.map((entry) => entry.domain)).size,
      firstSeenAt: Math.min(...group.map((entry) => entry.publishedAt)),
      lastSeenAt: Math.max(...group.map((entry) => entry.publishedAt)),
      topScore: group[0]?.score ?? 0,
    };
  });
}

function compareNewsItems(a: Pick<NewsArticle, "publishedAt" | "score" | "id">, b: Pick<NewsArticle, "publishedAt" | "score" | "id">): number {
  if (a.publishedAt !== b.publishedAt) return b.publishedAt - a.publishedAt;
  if (a.score !== b.score) return b.score - a.score;
  return a.id.localeCompare(b.id);
}

function minLayoutY(layouts: DashboardLayouts): number {
  const breakpoints: Array<keyof DashboardLayouts> = ["lg", "md", "sm", "xs"];
  let min = Number.POSITIVE_INFINITY;
  for (const bp of breakpoints) {
    const items = layouts[bp] ?? [];
    for (const item of items) {
      if (Number.isFinite(item.y)) {
        min = Math.min(min, item.y);
      }
    }
  }
  return Number.isFinite(min) ? min : 0;
}

function normalizeLayoutsTop(layouts: DashboardLayouts): DashboardLayouts {
  const minY = minLayoutY(layouts);
  if (minY <= 0) return layouts;
  const breakpoints: Array<keyof DashboardLayouts> = ["lg", "md", "sm", "xs"];
  const next = { ...layouts } as DashboardLayouts;
  for (const bp of breakpoints) {
    next[bp] = (next[bp] ?? []).map((item) => ({
      ...item,
      y: Math.max(0, item.y - minY),
    }));
  }
  return next;
}

function buildFacetRows(
  items: NewsArticle[],
  key: "source" | "category" | "language" | "country"
): Array<{ key: string; label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value =
      key === "source"
        ? item.source
        : key === "category"
          ? item.category
          : key === "language"
            ? item.language
            : item.country ?? "Global";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([k, count]) => ({
      key: k,
      label: key === "category" ? CATEGORY_LABELS[k as keyof typeof CATEGORY_LABELS] ?? k : k,
      count,
    }));
}

function buildFacetsFromItems(items: NewsArticle[]): NewsFacetState {
  const withCoords = items.filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon)).length;
  return {
    sources: buildFacetRows(items, "source"),
    categories: buildFacetRows(items, "category"),
    languages: buildFacetRows(items, "language"),
    regions: buildFacetRows(items, "country"),
    coordAvailability: [
      { key: "with", label: "Has Coordinates", count: withCoords },
      { key: "without", label: "No Coordinates", count: Math.max(0, items.length - withCoords) },
    ],
  };
}

function removeNearConstraint(query: string): string {
  const ast = parseQuery(query);
  if (!ast.near) return query;
  ast.near = undefined;
  return stringifyQueryAst(ast);
}

function removeCoordsConstraint(query: string): string {
  const ast = parseQuery(query);
  if (!ast.has?.includes("coords")) return query;
  const nextHas = ast.has.filter((token) => token !== "coords");
  ast.has = nextHas.length ? nextHas : undefined;
  return stringifyQueryAst(ast);
}

function widenTimespan(query: string): string {
  const ast = parseQuery(query);
  if (ast.timespan !== "24h") return query;
  ast.timespan = "7d";
  return stringifyQueryAst(ast);
}

interface SearchOverlayRowProps {
  items: NormalizedNewsItem[];
  selectedItemId: string | null;
  markersRef: GeoMarker[];
  onRowClick: (idx: number, item: NormalizedNewsItem, markerId: string | null) => void;
  onRowContextMenu: (item: NormalizedNewsItem, event: React.MouseEvent) => void;
}

function SearchOverlayRow({
  index,
  style,
  items,
  selectedItemId,
  markersRef,
  onRowClick,
  onRowContextMenu,
}: { index: number; style: React.CSSProperties } & SearchOverlayRowProps) {
  const item = items[index];
  if (!item) return null;
  return (
    <div
      style={style}
      className={`si-news-terminal-row ${item.id === selectedItemId ? "is-selected" : ""}`.trim()}
      onClick={() => {
        const marker = markersRef.find((m) => m.articleId === item.id);
        onRowClick(index, item, marker?.id ?? null);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onRowContextMenu(item, event);
      }}
      role="row"
    >
      <span className="si-news-terminal-cell si-col-time">{formatShortTime(item.publishedAt)}</span>
      <span className="si-news-terminal-cell si-col-source">{item.source}</span>
      <span className="si-news-terminal-cell si-col-entity">{extractEntity(item)}</span>
      <span className="si-news-terminal-cell si-col-region">{extractRegion(item)}</span>
      <span className="si-news-terminal-cell si-col-headline">{item.headline}</span>
      <span className="si-news-terminal-cell si-col-score">{Math.round(item.score)}</span>
    </div>
  );
}

export default function NewsWorkspace({ embedded = false }: { embedded?: boolean }) {
  perfMark("news:mount:start");

  const isMobile = useIsMobile();
  const dashboardView = useSIGINTStore((s) => s.dashboard.activeView);
  const news = useSIGINTStore(
    (s) => ({
      query: s.news.query,
      feedItems: s.news.feedItems,
      selectedStoryId: s.news.selectedStoryId,
      highlightedMarkerId: s.news.highlightedMarkerId,
      storyPopupArticle: s.news.storyPopupArticle,
      savedSearches: s.news.savedSearches,
      alerts: s.news.alerts,
      mutedSources: s.news.mutedSources,
      panelLayouts: s.news.panelLayouts,
      panelVisibility: s.news.panelVisibility,
      panelLocks: s.news.panelLocks,
      categoryPanelHasArticles: s.news.categoryPanelHasArticles,
      ui: s.news.ui,
      video: s.news.video,
      searchInView: s.news.searchInView,
      cameraBounds: s.news.cameraBounds,
      headlineTape: s.news.headlineTape,
      backendHealth: s.news.backendHealth,
      lastUpdated: s.news.lastUpdated,
      markers: s.news.markers,
      queryState: s.news.queryState,
    }),
    shallow,
  );

  const setNewsQuery = useSIGINTStore((s) => s.setNewsQuery);
  const setNewsQueryAst = useSIGINTStore((s) => s.setNewsQueryAst);
  const setNewsQueryState = useSIGINTStore((s) => s.setNewsQueryState);
  const setNewsUiState = useSIGINTStore((s) => s.setNewsUiState);
  const setNewsFeedItems = useSIGINTStore((s) => s.setNewsFeedItems);
  const setNewsMarkers = useSIGINTStore((s) => s.setNewsMarkers);
  const setNewsFacets = useSIGINTStore((s) => s.setNewsFacets);
  const setNewsThreads = useSIGINTStore((s) => s.setNewsThreads);
  const setSelectedStory = useSIGINTStore((s) => s.setSelectedStory);
  const setStoryPopupArticle = useSIGINTStore((s) => s.setStoryPopupArticle);
  const setHighlightMarker = useSIGINTStore((s) => s.setHighlightMarker);
  const setSearchInView = useSIGINTStore((s) => s.setSearchInView);
  const setNewsLayoutPreset = useSIGINTStore((s) => s.setNewsLayoutPreset);
  const resetNewsLayout = useSIGINTStore((s) => s.resetNewsLayout);
  const setNewsPanelLayouts = useSIGINTStore((s) => s.setNewsPanelLayouts);
  const setNewsPanelVisibility = useSIGINTStore((s) => s.setNewsPanelVisibility);
  const setNewsPanelLock = useSIGINTStore((s) => s.setNewsPanelLock);
  const saveNewsSearch = useSIGINTStore((s) => s.saveNewsSearch);
  const deleteNewsSearch = useSIGINTStore((s) => s.deleteNewsSearch);
  const upsertNewsAlert = useSIGINTStore((s) => s.upsertNewsAlert);
  const ackNewsAlert = useSIGINTStore((s) => s.ackNewsAlert);
  const setNewsVideoState = useSIGINTStore((s) => s.setNewsVideoState);
  const setNewsVideoPanelState = useSIGINTStore((s) => s.setNewsVideoPanelState);
  const setHeadlineTape = useSIGINTStore((s) => s.setHeadlineTape);
  const advanceHeadlineTape = useSIGINTStore((s) => s.advanceHeadlineTape);
  const setNewsBackendHealth = useSIGINTStore((s) => s.setNewsBackendHealth);
  const setNewsLastUpdated = useSIGINTStore((s) => s.setNewsLastUpdated);

  const [showBriefing, setShowBriefing] = useState(() =>
    typeof window !== "undefined"
      ? localStorage.getItem("si-news-briefing-disabled") !== "true"
      : true
  );
  const [selectedRow, setSelectedRow] = useState(0);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [geoMode, setGeoMode] = useState<"pointdata" | "country" | "adm1">("pointdata");
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [relatedItems, setRelatedItems] = useState<GdeltArticle[]>([]);
  const [timeline, setTimeline] = useState<Array<{ date: string; value: number }>>([]);
  const [liveStreams, setLiveStreams] = useState<YouTubeLive[]>([]);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoKeyMissing, setVideoKeyMissing] = useState(false);
  const [videoDiscoverySource, setVideoDiscoverySource] = useState<"youtube-data-api" | "youtube-rss">("youtube-data-api");
  const [videoFallbackActive, setVideoFallbackActive] = useState(false);
  const [contextItem, setContextItem] = useState<NewsArticle | null>(null);
  const [contextPos, setContextPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [newsMapReady, setNewsMapReady] = useState(false);
  const [searchInputDraft, setSearchInputDraft] = useState(news.query || "time:24h");
  const [panelMenuOpen, setPanelMenuOpen] = useState(false);
  const [searchResultsOpen, setSearchResultsOpen] = useState(false);
  const [topbarExpanded, setTopbarExpanded] = useState(false);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try { return new Set(JSON.parse(localStorage.getItem("si-news-bookmarks") || "[]")); } catch { return new Set(); }
  });
  const [bookmarkPanelOpen, setBookmarkPanelOpen] = useState(false);
  const [timeRange, setTimeRange] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(false);
  const initialLayoutAppliedRef = useRef(false);
  const layoutTopOffsetCheckedRef = useRef(false);
  const cacheHydratedRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchInFlightRef = useRef(false);
  const searchRequestIdRef = useRef(0);
  const searchAbortRef = useRef<AbortController | null>(null);
  const videoAbortRef = useRef<AbortController | null>(null);
  const suggestAbortRef = useRef<AbortController | null>(null);
  const contextAbortRef = useRef<AbortController | null>(null);
  const alertsAbortRef = useRef<AbortController | null>(null);
  const alertsRef = useRef<AlertRuleState[]>(news.alerts);
  const rollingFeedContextRef = useRef("");
  const rollingFeedRef = useRef<NormalizedNewsItem[]>([]);
  const markerByArticleIdRef = useRef<Map<string, GeoMarker>>(new Map());
  const frozenPollBboxRef = useRef<string | null>(null);
  const pendingTerminalQueueRef = useRef<string[]>([]);
  const terminalOrderRef = useRef<string[]>([]);
  const terminalItemsRef = useRef<NormalizedNewsItem[]>([]);
  const terminalBodyRef = useRef<HTMLDivElement | null>(null);
  const [terminalVersion, setTerminalVersion] = useState(0);
  const [liveTick, setLiveTick] = useState(0);
  const [clockTick, setClockTick] = useState(0);
  const searchContextRef = useRef({
    query: news.query,
    searchInView: news.searchInView,
    selectedStoryId: news.selectedStoryId,
    bbox: null as string | null,
    geoMode: "pointdata" as "pointdata" | "country" | "adm1",
  });

  const toggleBookmark = useCallback((id: string) => {
    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem("si-news-bookmarks", JSON.stringify(Array.from(next)));
      return next;
    });
  }, []);

  const feedItems = news.feedItems as NormalizedNewsItem[];
  const newsBackendHealth = news.backendHealth ?? {};
  const prevFeedLengthRef = useRef<number>(feedItems.length);
  useEffect(() => {
    const prev = prevFeedLengthRef.current;
    const next = feedItems.length;
    if (prev !== next) {
      prevFeedLengthRef.current = next;
    }
  }, [feedItems.length]);

  useEffect(() => {
    alertsRef.current = news.alerts;
  }, [news.alerts]);

  const ttiMeasuredRef = useRef(false);
  useEffect(() => {
    if (ttiMeasuredRef.current) return;
    ttiMeasuredRef.current = true;
    perfMark("news:tti");
    perfMeasure("news:tti", "news:mount:start", "news:tti");
    startJankSampler();
    return () => stopJankSampler();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setLiveTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setClockTick((t) => t + 1), 1_000);
    return () => clearInterval(id);
  }, []);

  const enqueueTerminalIds = useCallback((ids: string[]) => {
    if (!ids.length) return;
    const queued = new Set(pendingTerminalQueueRef.current);
    for (const id of ids) {
      if (!queued.has(id)) {
        pendingTerminalQueueRef.current.push(id);
        queued.add(id);
      }
    }
  }, []);

  const syncTerminalOrder = useCallback((items: NewsArticle[]) => {
    const nextIds = items.map((item) => item.id);
    const nextSet = new Set(nextIds);
    const existing = terminalOrderRef.current.filter((id) => nextSet.has(id));
    const existingSet = new Set(existing);
    const appended = nextIds.filter((id) => !existingSet.has(id));
    const merged = [...appended, ...existing];
    const changed =
      merged.length !== terminalOrderRef.current.length ||
      merged.some((id, idx) => id !== terminalOrderRef.current[idx]);
    if (changed) {
      terminalOrderRef.current = merged;
      setTerminalVersion((v) => v + 1);
    }
  }, []);

  const mergeRollingItems = useCallback((incoming: NormalizedNewsItem[], contextKey: string) => {
    const contextChanged = rollingFeedContextRef.current !== contextKey;
    const previous = contextChanged ? [] : rollingFeedRef.current;
    if (contextChanged) {
      rollingFeedContextRef.current = contextKey;
      markerByArticleIdRef.current.clear();
      pendingTerminalQueueRef.current = [];
      terminalOrderRef.current = [];
    }

    const byId = new Map<string, NormalizedNewsItem>();
    for (const item of previous) {
      byId.set(item.id, item);
    }
    for (const item of incoming) {
      const prev = byId.get(item.id);
      if (!prev) {
        byId.set(item.id, item);
        continue;
      }
      if (compareNewsItems(item, prev) < 0) {
        byId.set(item.id, item);
      } else {
        byId.set(item.id, prev);
      }
    }

    const cutoff = Date.now() - NEWS_RETENTION_MS;
    const merged = Array.from(byId.values())
      .filter((item) => item.publishedAt >= cutoff)
      .sort(compareNewsItems)
      .slice(0, NEWS_RETENTION_MAX_ITEMS);
    rollingFeedRef.current = merged;

    const prevIds = new Set(previous.map((item) => item.id));
    const newIds = merged.map((item) => item.id).filter((id) => !prevIds.has(id));
    return { merged, newIds, contextChanged };
  }, []);

  useEffect(() => {
    if (dashboardView !== "news") return;
    if (cacheHydratedRef.current) return;
    cacheHydratedRef.current = true;
    if (news.feedItems.length > 0) return;
    let cancelled = false;
    void (async () => {
      const cached = await readNewsCache();
      if (cancelled) return;
      if (!cached || !cached.items.length) return;
      const cachedItems = [...(cached.items as NormalizedNewsItem[])].sort(compareNewsItems);
      setNewsFeedItems(cachedItems);
      setNewsMarkers(cached.markers);
      setNewsFacets(cached.facets);
      setNewsThreads(buildThreadList(cachedItems));
      rollingFeedContextRef.current = `cache:${cached.query}`;
      rollingFeedRef.current = cachedItems.slice(0, NEWS_RETENTION_MAX_ITEMS);
      markerByArticleIdRef.current = new Map(cached.markers.map((marker) => [marker.articleId, marker]));
      syncTerminalOrder(cachedItems);
      setNewsLastUpdated(cached.savedAt);
      setNewsUiState({
        statusLine: `Loaded ${cachedItems.length} cached stories. Refreshing live feed...`,
      });
      SEARCH_INDEX.upsert(cachedItems);
      const top = cachedItems[0];
      if (top) {
        setSelectedStory(top.id);
        const marker = cached.markers.find((entry) => entry.articleId === top.id);
        setHighlightMarker(marker?.id ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    dashboardView,
    news.feedItems.length,
    setNewsFeedItems,
    setNewsMarkers,
    setNewsFacets,
    setNewsThreads,
    setNewsLastUpdated,
    setNewsUiState,
    setSelectedStory,
    setHighlightMarker,
    syncTerminalOrder,
  ]);

  const filteredItems = useMemo(() => {
    const sourceMuted = new Set(news.mutedSources.map((source) => source.toLowerCase()));
    const bySource = feedItems.filter((item) => {
      const src = item.source.toLowerCase();
      const domain = (item.domain ?? "").toLowerCase();
      if (
        BLOCKED_NEWS_SOURCES.has(src) ||
        Array.from(BLOCKED_NEWS_SOURCES).some((blocked) => domain.includes(blocked))
      ) {
        return false;
      }
      if (sourceMuted.has(src)) return false;
      return true;
    });
    const byCategory = activeCategory === "all" ? bySource : bySource.filter((item) => item.category === activeCategory);
    if (!timeRange) return byCategory;
    const ms: Record<string, number> = { "1h": 3600e3, "6h": 21600e3, "24h": 86400e3, "7d": 604800e3 };
    const cutoff = Date.now() - (ms[timeRange] ?? 86400e3);
    return byCategory.filter((item) => item.publishedAt >= cutoff);
  }, [feedItems, activeCategory, news.mutedSources, timeRange]);

  const liveCutoff = Date.now() - LIVE_CUTOFF_MS;
  const terminalItems = useMemo(() => {
    const live = filteredItems.filter((item) => item.publishedAt >= liveCutoff);
    const order = new Map<string, number>();
    terminalOrderRef.current.forEach((id, index) => {
      order.set(id, index);
    });
    return [...live].sort((a, b) => {
      const ai = order.get(a.id);
      const bi = order.get(b.id);
      if (ai != null && bi != null && ai !== bi) return ai - bi;
      if (ai != null && bi == null) return -1;
      if (ai == null && bi != null) return 1;
      return compareNewsItems(a, b);
    });
  }, [filteredItems, terminalVersion, liveTick]);

  useEffect(() => {
    terminalItemsRef.current = terminalItems;
  }, [terminalItems]);

  useEffect(() => {
    if (terminalVersion === 0) return;
    const el = terminalBodyRef.current;
    if (!el || el.scrollTop > 50) return;
    el.scrollTop = 0;
  }, [terminalVersion]);

  const selectedItem = useMemo(() => {
    if (!terminalItems.length) return null;
    if (news.selectedStoryId) {
      const explicit = terminalItems.find((item) => item.id === news.selectedStoryId);
      if (explicit) return explicit;
    }
    return terminalItems[Math.min(Math.max(selectedRow, 0), terminalItems.length - 1)] ?? null;
  }, [terminalItems, selectedRow, news.selectedStoryId]);

  const activeMarker = useMemo<GeoMarker | null>(() => {
    if (!news.highlightedMarkerId) return null;
    return news.markers.find((marker) => marker.id === news.highlightedMarkerId) ?? null;
  }, [news.markers, news.highlightedMarkerId]);

  useEffect(() => {
    if (activeCategory === "all") return;
    if (!feedItems.length) return;
    if (filteredItems.length > 0) return;
    setActiveCategory("all");
    setNewsUiState({ statusLine: "Active category had no rows. Reverted to ALL." });
  }, [activeCategory, feedItems.length, filteredItems.length, setNewsUiState]);

  const bbox = useMemo(() => toQueryBbox(news.cameraBounds), [news.cameraBounds]);

  useEffect(() => {
    searchContextRef.current = {
      query: news.query,
      searchInView: news.searchInView,
      selectedStoryId: news.selectedStoryId,
      bbox,
      geoMode,
    };
  }, [news.query, news.searchInView, news.selectedStoryId, bbox, geoMode]);

  const newsGlobeFooterMessage = useMemo(() => {
    if (newsBackendHealth.search === "loading") return "Searching...";
    const anyDegraded = Object.values(newsBackendHealth).some((v) => v === "degraded");
    if (anyDegraded) return "Some sources delayed";
    return undefined;
  }, [newsBackendHealth]);

  const newsPollSettings = useMemo(() => {
    const anyDegraded = Object.values(newsBackendHealth).some(
      (v) => v === "degraded" || v === "error"
    );
    return {
      intervalMs: anyDegraded ? 14_000 : NEWS_REFRESH_MS,
      hiddenIntervalMultiplier: anyDegraded ? 4 : 3,
    };
  }, [newsBackendHealth]);

  const hasAnyVideoPanelVisible = useMemo(
    () => LIVE_VIDEO_PANELS.some((p) => news.panelVisibility[p.id] !== false),
    [news.panelVisibility]
  );

  const runSearch = useCallback(
    async (
      reason: "manual" | "poll" | "query" = "manual",
      overrideQuery?: string
    ) => {
      if (dashboardView !== "news") return;
      if (reason === "poll" && searchInFlightRef.current) return;
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;

      const stateNews = useSIGINTStore.getState().news;
      const context = {
        ...searchContextRef.current,
        query: stateNews.query,
        searchInView: stateNews.searchInView,
        selectedStoryId: stateNews.selectedStoryId,
        bbox: toQueryBbox(stateNews.cameraBounds),
      };
      const showLoading = reason !== "poll";
      const requestId = searchRequestIdRef.current + 1;
      searchRequestIdRef.current = requestId;
      searchInFlightRef.current = true;

      if (showLoading) {
        setLoading(true);
        setNewsUiState({ statusLine: "Searching..." });
        setNewsBackendHealth("search", "loading");
      }

      try {
        const applyPayload = (
          payload: SearchRouteResult,
          queryForAst: string,
          attemptContext: { inView: boolean; bbox: string | null; mode: "pointdata" | "country" | "adm1" }
        ) => {
          if (requestId !== searchRequestIdRef.current) return 0;
          const nextItems = [...(payload.items ?? [])].sort(compareNewsItems);
          const contextKey = `${payload.queryEcho?.normalized ?? queryForAst}|${attemptContext.mode}|${
            attemptContext.inView ? attemptContext.bbox ?? "inView" : "all"
          }`;
          const { merged, newIds } = mergeRollingItems(nextItems, contextKey);
          const mergedIdSet = new Set(merged.map((item) => item.id));
          for (const marker of payload.markers ?? []) {
            if (!mergedIdSet.has(marker.articleId)) continue;
            markerByArticleIdRef.current.set(marker.articleId, marker);
          }
          for (const articleId of Array.from(markerByArticleIdRef.current.keys())) {
            if (!mergedIdSet.has(articleId)) {
              markerByArticleIdRef.current.delete(articleId);
            }
          }
          const mergedMarkers = Array.from(markerByArticleIdRef.current.values()).slice(0, NEWS_CACHE_MAX_MARKERS);
          const mergedFacets = buildFacetsFromItems(merged);
          setNewsFeedItems(merged);
          setNewsMarkers(mergedMarkers);
          setNewsFacets(mergedFacets);
          setNewsThreads(buildThreadList(merged));
          setNewsQueryAst(payload.queryEcho?.ast ?? parseQuery(queryForAst));
          setNewsLastUpdated();
          setNewsBackendHealth(
            "search",
            Object.values(payload.degraded ?? {}).some(Boolean) ? "degraded" : "ok"
          );
          Object.entries(payload.backendHealth ?? {}).forEach(([source, state]) => {
            setNewsBackendHealth(source, state === "ok" ? "ok" : "degraded");
          });
          Object.entries(payload.degraded ?? {}).forEach(([source, isDegraded]) => {
            if (!payload.backendHealth?.[source]) {
              setNewsBackendHealth(source, isDegraded ? "degraded" : "ok");
            }
          });
          SEARCH_INDEX.upsert(merged);
          syncTerminalOrder(merged);
          enqueueTerminalIds(newIds);

          if (merged.length) {
            void writeNewsCache({
              savedAt: Date.now(),
              query: queryForAst,
              items: merged,
              markers: mergedMarkers,
              facets: mergedFacets ?? EMPTY_FACETS,
            });
          }

          if (!merged.length) {
            setSelectedStory(null);
            setHighlightMarker(null);
          } else if (reason !== "poll" || !context.selectedStoryId) {
            const top = merged[0];
            setSelectedStory(top.id);
            const marker = mergedMarkers.find((entry) => entry.articleId === top.id) ?? null;
            setHighlightMarker(marker?.id ?? null);
          }
          return merged.length;
        };

        const activeQuery = (overrideQuery?.trim() || context.query || "news time:24h").trim() || "news time:24h";
        const primaryBbox = (() => {
          if (!context.searchInView) {
            frozenPollBboxRef.current = null;
            return null;
          }
          if (reason === "poll") {
            if (!frozenPollBboxRef.current && context.bbox) {
              frozenPollBboxRef.current = context.bbox;
            }
            return frozenPollBboxRef.current ?? context.bbox;
          }
          frozenPollBboxRef.current = context.bbox;
          return context.bbox;
        })();
        const attempts: Array<{
          id: string;
          query: string;
          inView: boolean;
          bbox: string | null;
          mode: "pointdata" | "country" | "adm1";
        }> = [];
        const seenAttempt = new Set<string>();
        const allowFallbackChain = reason !== "poll";

        const pushAttempt = (attempt: {
          id: string;
          query: string;
          inView: boolean;
          bbox: string | null;
          mode: "pointdata" | "country" | "adm1";
        }) => {
          const key = `${attempt.query}|${attempt.inView}|${attempt.mode}`.toLowerCase();
          if (seenAttempt.has(key)) return;
          seenAttempt.add(key);
          attempts.push(attempt);
        };

        pushAttempt({
          id: "primary",
          query: activeQuery,
          inView: context.searchInView,
          bbox: primaryBbox,
          mode: context.geoMode,
        });
        if (allowFallbackChain && context.searchInView) {
          pushAttempt({
            id: "disable-search-in-view",
            query: activeQuery,
            inView: false,
            bbox: null,
            mode: context.geoMode,
          });
        }
        if (allowFallbackChain) {
          const withoutNear = removeNearConstraint(activeQuery);
          if (withoutNear !== activeQuery) {
            pushAttempt({
              id: "drop-near-filter",
              query: withoutNear,
              inView: false,
              bbox: null,
              mode: context.geoMode,
            });
          }
          const withoutCoords = removeCoordsConstraint(withoutNear);
          if (withoutCoords !== withoutNear) {
            pushAttempt({
              id: "drop-has-coords",
              query: withoutCoords,
              inView: false,
              bbox: null,
              mode: context.geoMode,
            });
          }
          const widerTimespan = widenTimespan(withoutCoords);
          if (widerTimespan !== withoutCoords) {
            pushAttempt({
              id: "widen-24h-to-7d",
              query: widerTimespan,
              inView: false,
              bbox: null,
              mode: context.geoMode,
            });
          }
          const parsedActive = parseQuery(activeQuery);
          const hasSpecificTerms = parsedActive.freeText.some(
            (t) => t.toLowerCase().trim().length >= 2 && t.toLowerCase() !== "news"
          ) || Boolean(parsedActive.sym);
          if (!hasSpecificTerms) {
            pushAttempt({
              id: "fallback-news-time-24h",
              query: "news time:24h",
              inView: false,
              bbox: null,
              mode: "pointdata",
            });
          }
        }

        let lastPayload: SearchRouteResult | null = null;
        let lastCount = 0;
        let finalQuery = activeQuery;
        const fallbackApplied: string[] = [];
        let appliedFromAttempt = false;
        let preservedExisting = false;
        let lastAttemptContext: { inView: boolean; bbox: string | null; mode: "pointdata" | "country" | "adm1" } = {
          inView: context.searchInView,
          bbox: primaryBbox,
          mode: context.geoMode,
        };
        let primaryPayload: SearchRouteResult | null = null;
        let primaryEmptyReason: string | null = null;
        let primaryAttemptContext: { inView: boolean; bbox: string | null; mode: "pointdata" | "country" | "adm1" } | null = null;
        let usePrimaryEmptyReason = false;

        const parallelAttempts = attempts.filter(
          (a) =>
            a.id === "primary" ||
            (allowFallbackChain && a.id === "disable-search-in-view") ||
            (allowFallbackChain && a.id === "fallback-news-time-24h")
        );
        const sequentialAttempts = attempts.filter((a) => !parallelAttempts.includes(a));

        const runAttempt = async (attempt: (typeof attempts)[0]) => {
          const payload = await fetchJson<SearchRouteResult>(
            buildSearchUrl(attempt.query, {
              inView: attempt.inView,
              bbox: attempt.bbox,
              mode: attempt.mode,
            }),
            {
              key: `news:search:${attempt.id}:${attempt.mode}:${attempt.inView ? "inview" : "all"}:${attempt.query}`,
              signal: controller.signal,
              cache: reason === "poll" ? "default" : "no-store",
              timeoutMs: 18_000,
              retries: 1,
              negativeTtlMs: 1_000,
            }
          );
          return { attempt, payload };
        };

        if (parallelAttempts.length > 1) {
          const results = await Promise.allSettled(
            parallelAttempts.map((a) => runAttempt(a))
          );
          const byId = new Map<string, { attempt: (typeof attempts)[0]; payload: SearchRouteResult }>();
          for (const result of results) {
            if (result.status === "fulfilled" && requestId === searchRequestIdRef.current) {
              const { attempt, payload } = result.value;
              byId.set(attempt.id, { attempt, payload });
              if (attempt.id === "primary" && (payload.items?.length ?? 0) === 0) {
                primaryPayload = payload;
                primaryEmptyReason = payload.emptyReason ?? null;
                primaryAttemptContext = { inView: attempt.inView, bbox: attempt.bbox, mode: attempt.mode };
              }
            }
          }
          const preferenceOrder = ["primary", "disable-search-in-view", "fallback-news-time-24h"];
          for (const id of preferenceOrder) {
            const entry = byId.get(id);
            if (!entry) continue;
            const count = entry.payload.items?.length ?? 0;
            if (count > 0) {
              if (
                id === "fallback-news-time-24h" &&
                primaryPayload != null &&
                activeQuery.toLowerCase().trim() !== "news time:24h"
              ) {
                lastCount = applyPayload(primaryPayload!, activeQuery, primaryAttemptContext!);
                usePrimaryEmptyReason = true;
              } else {
                lastCount = applyPayload(
                  entry.payload,
                  entry.attempt.query,
                  { inView: entry.attempt.inView, bbox: entry.attempt.bbox, mode: entry.attempt.mode }
                );
                finalQuery = entry.attempt.query;
                if (id !== "primary") fallbackApplied.push(id);
              }
              appliedFromAttempt = true;
              lastPayload = entry.payload;
              lastAttemptContext = { inView: entry.attempt.inView, bbox: entry.attempt.bbox, mode: entry.attempt.mode };
              break;
            }
          }
          if (!appliedFromAttempt) {
            lastPayload = primaryPayload ?? Array.from(byId.values())[0]?.payload ?? null;
            if (lastPayload) {
              lastAttemptContext = primaryAttemptContext ?? lastAttemptContext;
              for (const id of preferenceOrder) {
                if (id !== "primary" && byId.has(id)) fallbackApplied.push(id);
              }
            }
          }
        }

        if (!appliedFromAttempt && sequentialAttempts.length > 0) {
          for (const attempt of sequentialAttempts) {
            if (requestId !== searchRequestIdRef.current) return;
            const { attempt: a, payload } = await runAttempt(attempt).then((r) => ({ attempt: r.attempt, payload: r.payload }));
            lastPayload = payload;
            lastAttemptContext = { inView: a.inView, bbox: a.bbox, mode: a.mode };
            finalQuery = a.query;
            const count = payload.items?.length ?? 0;
            if (a.id === "primary" && count === 0) {
              primaryPayload = payload;
              primaryEmptyReason = payload.emptyReason ?? null;
              primaryAttemptContext = lastAttemptContext;
            }
            if (a.id !== "primary") fallbackApplied.push(a.id);
            if (count > 0) {
              if (
                a.id === "fallback-news-time-24h" &&
                primaryPayload != null &&
                activeQuery.toLowerCase().trim() !== "news time:24h"
              ) {
                lastCount = applyPayload(primaryPayload!, activeQuery, primaryAttemptContext!);
                usePrimaryEmptyReason = true;
              } else {
                lastCount = applyPayload(payload, a.query, lastAttemptContext);
              }
              appliedFromAttempt = true;
              break;
            }
          }
        }

        if (!appliedFromAttempt && parallelAttempts.length === 1) {
          const { attempt, payload } = await runAttempt(parallelAttempts[0]);
          if (requestId !== searchRequestIdRef.current) return;
          lastPayload = payload;
          lastAttemptContext = { inView: attempt.inView, bbox: attempt.bbox, mode: attempt.mode };
          finalQuery = attempt.query;
          const count = payload.items?.length ?? 0;
          if (attempt.id === "primary" && count === 0) {
            primaryPayload = payload;
            primaryEmptyReason = payload.emptyReason ?? null;
            primaryAttemptContext = lastAttemptContext;
          }
          if (count > 0) {
            lastCount = applyPayload(payload, attempt.query, lastAttemptContext);
            appliedFromAttempt = true;
          }
        }

        if (lastPayload && !appliedFromAttempt) {
          const existingItems = useSIGINTStore.getState().news.feedItems;
          const upstreamDegraded =
            Object.values(lastPayload.degraded ?? {}).some(Boolean) ||
            Object.values(lastPayload.backendHealth ?? {}).some((state) => state !== "ok");

          if (existingItems.length > 0 && (reason === "poll" || upstreamDegraded)) {
            preservedExisting = true;
            lastCount = existingItems.length;
            syncTerminalOrder(existingItems as NormalizedNewsItem[]);
            setNewsQueryAst(lastPayload.queryEcho?.ast ?? parseQuery(finalQuery));
            setNewsBackendHealth("search", upstreamDegraded ? "degraded" : "ok");
            Object.entries(lastPayload.backendHealth ?? {}).forEach(([source, state]) => {
              setNewsBackendHealth(source, state === "ok" ? "ok" : "degraded");
            });
            Object.entries(lastPayload.degraded ?? {}).forEach(([source, isDegraded]) => {
              if (!lastPayload?.backendHealth?.[source]) {
                setNewsBackendHealth(source, isDegraded ? "degraded" : "ok");
              }
            });
          } else {
            lastCount = applyPayload(lastPayload, finalQuery, lastAttemptContext);
          }
        }

        if (lastPayload) {
          setNewsQueryState({
            lastFallbackApplied: fallbackApplied,
            lastEmptyReason: usePrimaryEmptyReason ? primaryEmptyReason : (lastPayload.emptyReason ?? null),
          });
          if (reason !== "poll") {
            if (preservedExisting) {
              setNewsUiState({
                statusLine: `Live update returned no rows. Keeping ${lastCount} cached stories.`,
              });
            } else if (fallbackApplied.length) {
              setNewsUiState({
                statusLine:
                  lastCount > 0
                    ? `Recovered: ${lastCount} stories (${fallbackApplied.join(" -> ")}).`
                    : `No results after fallback chain (${fallbackApplied.join(" -> ")}).`,
              });
            } else {
              setNewsUiState({
                statusLine:
                  lastCount > 0 ? `Loaded ${lastCount} stories.` : lastPayload.emptyReason ?? "No stories found.",
              });
            }
          }
          if (appliedFromAttempt && finalQuery !== activeQuery && finalQuery.trim() && reason !== "poll") {
            setNewsQuery(finalQuery);
            setSearchInputDraft(finalQuery);
          } else if (overrideQuery !== undefined) {
            setNewsQuery(activeQuery);
          }
        }
      } catch (error) {
        if (isAbortError(error) || controller.signal.aborted) return;
        if (requestId !== searchRequestIdRef.current) return;
        console.error("[news/search] failed", error);
        setNewsBackendHealth("search", "error");
        setNewsUiState({ statusLine: "Search failed. Upstream sources may be throttled." });
      } finally {
        if (searchAbortRef.current === controller) {
          searchAbortRef.current = null;
        }
        if (requestId === searchRequestIdRef.current) {
          searchInFlightRef.current = false;
          if (showLoading) {
            setLoading(false);
          }
        }
      }
    },
    [
        dashboardView,
        mergeRollingItems,
        enqueueTerminalIds,
        syncTerminalOrder,
        setNewsBackendHealth,
        setNewsFeedItems,
        setNewsMarkers,
      setNewsFacets,
      setNewsThreads,
      setNewsQueryAst,
      setNewsQueryState,
      setNewsUiState,
      setNewsLastUpdated,
      setNewsQuery,
      setSelectedStory,
      setHighlightMarker,
    ]
  );

  const refreshVideo = useCallback(async () => {
    if (dashboardView !== "news" || !hasAnyVideoPanelVisible) return;
    videoAbortRef.current?.abort();
    const controller = new AbortController();
    videoAbortRef.current = controller;
    setVideoLoading(true);
    setNewsBackendHealth("youtube", "loading");
    try {
      const payload = await fetchJson<{
        items: YouTubeLive[];
        keyMissing: boolean;
        discoverySource?: "youtube-data-api" | "youtube-rss";
        fallbackActive?: boolean;
        degraded?: string[];
        liveCount?: number;
        channelsChecked?: number;
        zeroResults?: boolean;
        upstreamError?: boolean;
        message?: string;
      }>("/api/news/youtube", {
        key: "news:youtube",
        signal: controller.signal,
        timeoutMs: 18_000,
        retries: 1,
        negativeTtlMs: 1_200,
      });
      const nextItems = payload.items ?? [];
      setLiveStreams(nextItems);
      setVideoKeyMissing(Boolean(payload.keyMissing));
      setVideoDiscoverySource(payload.discoverySource ?? "youtube-data-api");
      setVideoFallbackActive(Boolean(payload.fallbackActive));
      setNewsBackendHealth("youtube", payload.degraded?.length ? "degraded" : "ok");
      const baseSummary = `Video: ${payload.liveCount ?? 0} live across ${payload.channelsChecked ?? 0} channels.`;
      const statusMessage =
        payload.message ||
        (payload.keyMissing
          ? "YOUTUBE_API_KEY missing. Showing recent uploads from RSS fallback."
          : payload.fallbackActive
            ? "YouTube Data API unavailable; showing recent uploads from RSS."
            : payload.upstreamError
            ? "YouTube API request failed; auto-discovery may be limited."
            : payload.zeroResults || !nextItems.length
              ? "No YouTube streams discovered for configured channels right now."
              : baseSummary);
      setNewsUiState({
        statusLine: statusMessage,
      });
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) return;
      console.error("[news/youtube] failed", error);
      setNewsBackendHealth("youtube", "error");
      setNewsUiState({
        statusLine: "YouTube auto-discovery failed; check API key and network.",
      });
    } finally {
      if (videoAbortRef.current === controller) {
        videoAbortRef.current = null;
      }
      setVideoLoading(false);
    }
  }, [
    dashboardView,
    hasAnyVideoPanelVisible,
    setNewsBackendHealth,
    setNewsUiState,
  ]);

  useEffect(() => {
    if (dashboardView !== "news") return;
    if (!news.query.trim()) {
      setNewsQuery("news time:24h");
      return;
    }
    const timer = setTimeout(() => void runSearch("query"), 0);
    return () => clearTimeout(timer);
  }, [dashboardView, news.query, runSearch, setNewsQuery]);

  useEffect(() => {
    if (dashboardView !== "news") return;
    const disposePoll = globalRefreshRuntime.register({
      pool: "news",
      task: {
      key: "news:search-poll",
      intervalMs: newsPollSettings.intervalMs,
      runOnStart: true,
      jitterPct: 0.14,
      hiddenIntervalMultiplier: newsPollSettings.hiddenIntervalMultiplier,
      timeoutMs: 20_000,
      run: async () => {
        await runSearch("poll");
      },
      },
    });
    return () => {
      disposePoll();
    };
  }, [dashboardView, runSearch, newsPollSettings.hiddenIntervalMultiplier, newsPollSettings.intervalMs]);

  useEffect(() => {
    if (dashboardView !== "news" || !hasAnyVideoPanelVisible) {
      videoAbortRef.current?.abort();
      return;
    }
    const disposeVideoPoll = globalRefreshRuntime.register({
      pool: "news",
      task: {
      key: "news:video-poll",
      intervalMs: VIDEO_REFRESH_MS,
      runOnStart: true,
      jitterPct: 0.12,
      hiddenIntervalMultiplier: 3,
      timeoutMs: 25_000,
      run: async () => {
        await refreshVideo();
      },
      },
    });
    return () => {
      disposeVideoPoll();
      videoAbortRef.current?.abort();
    };
  }, [dashboardView, hasAnyVideoPanelVisible, refreshVideo]);

  // Ref for byPanel so the auto-pick effect doesn't re-trigger on every panel state change.
  const byPanelRef = useRef(news.video.byPanel);
  byPanelRef.current = news.video.byPanel;

  useEffect(() => {
    if (dashboardView !== "news" || !hasAnyVideoPanelVisible) return;
    if (!liveStreams.length) return;

    const byPanel = byPanelRef.current ?? {};
    const visibleVideoPanels = LIVE_VIDEO_PANELS.filter(
      (cfg) => news.panelVisibility[cfg.id] !== false
    );

    // Resolve each panel's candidate list and current selection validity.
    const panels = visibleVideoPanels.map((cfg) => {
      const ps = byPanel[cfg.id] ?? { selectedVideoId: null, selectedChannelFilter: null, manualUrl: "" };
      const channelIds = VIDEO_CATEGORY_CHANNEL_IDS.get(cfg.category) ?? new Set<string>();
      const baseCandidates = liveStreams.filter((s) => channelIds.has(s.channelId));
      const filterValid =
        !!ps.selectedChannelFilter && baseCandidates.some((s) => s.channelId === ps.selectedChannelFilter);
      const candidates = filterValid
        ? baseCandidates.filter((s) => s.channelId === ps.selectedChannelFilter)
        : baseCandidates;
      const ordered = uniqueStreamsByVideoId(sortYouTubeStreamsLiveFirst(candidates));
      const currentValid = Boolean(ps.selectedVideoId && ordered.some((s) => s.videoId === ps.selectedVideoId));
      return { cfg, panelState: ps, orderedCandidates: ordered, currentValid };
    });

    // Cross-panel deduplication: collect videoIds held by panels that have a
    // valid *live* selection. Panels showing "recent" videos are re-evaluated
    // so live streams always take priority.
    const claimed = new Set<string>();
    for (const p of panels) {
      if (!p.currentValid || !p.panelState.selectedVideoId) continue;
      const currentStream = p.orderedCandidates.find(
        (s) => s.videoId === p.panelState.selectedVideoId,
      );
      if (currentStream?.status === "live") {
        claimed.add(p.panelState.selectedVideoId);
      }
    }

    for (const p of panels) {
      // Keep panels that already show a live stream
      const currentStream = p.currentValid
        ? p.orderedCandidates.find((s) => s.videoId === p.panelState.selectedVideoId)
        : undefined;
      if (p.currentValid && currentStream?.status === "live") continue;

      // Auto-pick: prefer unclaimed live streams, then any unclaimed stream
      const liveId =
        p.orderedCandidates.find((s) => s.status === "live" && !claimed.has(s.videoId))?.videoId ?? null;
      const anyId =
        p.orderedCandidates.find((s) => !claimed.has(s.videoId))?.videoId ?? null;
      const nextVideoId = liveId ?? anyId;

      if (nextVideoId) claimed.add(nextVideoId);

      if ((p.panelState.selectedVideoId ?? null) !== nextVideoId) {
        setNewsVideoPanelState(p.cfg.id, { selectedVideoId: nextVideoId });
      }
    }
  }, [
    dashboardView,
    hasAnyVideoPanelVisible,
    liveStreams,
    news.panelVisibility,
    setNewsVideoPanelState,
  ]);

  useEffect(() => {
    if (dashboardView !== "news") return;
    if (!news.headlineTape.enabled || news.headlineTape.paused) return;
    if (!terminalItems.length) return;
    const id = setInterval(() => {
      advanceHeadlineTape(1);
    }, NEWS_TAPE_TICK_MS);
    return () => clearInterval(id);
  }, [
    dashboardView,
    news.headlineTape.enabled,
    news.headlineTape.paused,
    terminalItems.length,
    advanceHeadlineTape,
  ]);

  useEffect(() => {
    syncTerminalOrder(terminalItems);
  }, [terminalItems, syncTerminalOrder]);

  const prevTerminalVersionRef = useRef(terminalVersion);
  useEffect(() => {
    if (prevTerminalVersionRef.current === terminalVersion) return;
    prevTerminalVersionRef.current = terminalVersion;
  }, [terminalVersion]);

  useEffect(() => {
    if (dashboardView !== "news") return;
    const id = setInterval(() => {
      if (!pendingTerminalQueueRef.current.length) return;

      let changed = false;
      while (pendingTerminalQueueRef.current.length > 0) {
        const nextId = pendingTerminalQueueRef.current.shift();
        if (!nextId) continue;
        if (!terminalOrderRef.current.includes(nextId)) continue;
        terminalOrderRef.current = [
          nextId,
          ...terminalOrderRef.current.filter((id) => id !== nextId),
        ];
        changed = true;
        break;
      }

      if (changed) {
        setTerminalVersion((v) => v + 1);
      }
    }, NEWS_TERMINAL_TICK_MS);
    return () => clearInterval(id);
  }, [dashboardView]);

  const backendIssueSummary = useMemo(() => {
    const problematic = Object.entries(newsBackendHealth).filter(
      ([source, state]) => source !== "search" && state && state !== "ok" && state !== "idle"
    );
    if (!problematic.length) return "";
    const labels = problematic.map(([source]) => source).join(", ");
    return `Sources delayed: ${labels}`;
  }, [newsBackendHealth]);

  useEffect(() => {
    if (!panelMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!(event.target instanceof HTMLElement)) return;
      if (event.target.closest(".si-news-toolbar-panels")) return;
      setPanelMenuOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPanelMenuOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [panelMenuOpen]);

  useEffect(() => {
    if (!bookmarkPanelOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!(event.target instanceof HTMLElement)) return;
      if (event.target.closest(".si-news-bookmarks-popover") || event.target.closest("button")?.textContent?.startsWith("SAVED")) return;
      setBookmarkPanelOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setBookmarkPanelOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => { window.removeEventListener("mousedown", onPointerDown); window.removeEventListener("keydown", onEscape); };
  }, [bookmarkPanelOpen]);

  useEffect(() => {
    if (!contextItem) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target instanceof HTMLElement) || !e.target.closest(".si-news-context-menu")) setContextItem(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setContextItem(null); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [contextItem]);

  useEffect(() => {
    if (dashboardView !== "news" || layoutTopOffsetCheckedRef.current) return;
    const minY = minLayoutY(news.panelLayouts);
    if (minY > 0) {
      setNewsPanelLayouts(normalizeLayoutsTop(news.panelLayouts));
    }
    layoutTopOffsetCheckedRef.current = true;
  }, [dashboardView, news.panelLayouts, setNewsPanelLayouts]);

  useEffect(() => {
    if (dashboardView !== "news" || initialLayoutAppliedRef.current) return;
    const globePanel = news.panelLayouts.lg.find((item) => item.i === "news-globe");
    if (!globePanel || globePanel.x !== 0) {
      setNewsLayoutPreset("news-centric");
    }
    initialLayoutAppliedRef.current = true;
  }, [dashboardView, news.panelLayouts, setNewsLayoutPreset]);

  useEffect(() => {
    if (dashboardView !== "news") return;
    const q = searchInputDraft.trim();
    suggestAbortRef.current?.abort();
    const controller = new AbortController();
    suggestAbortRef.current = controller;
    const fromIndex = SEARCH_INDEX.suggest(q, 6);
    const fromSaved = news.savedSearches
      .filter((item) => item.name.toLowerCase().includes(q.toLowerCase()) || item.query.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 4)
      .map<SuggestionItem>((item) => ({
        label: item.name,
        value: item.query,
        type: "saved",
        confidence: 0.72,
      }));
    const timer = setTimeout(async () => {
      try {
        const payload = await fetchJson<{ suggestions: SuggestionItem[] }>(
          `/api/news/suggest?q=${encodeURIComponent(q)}&limit=8`,
          {
            key: `news:suggest:${q}`,
            signal: controller.signal,
            timeoutMs: 8_000,
            retries: 1,
            negativeTtlMs: 600,
          }
        );
        const combined = [...payload.suggestions, ...fromSaved, ...fromIndex];
        const seen = new Set<string>();
        const deduped = combined.filter((entry) => {
          const key = `${entry.type}:${entry.value}`.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setSuggestions(deduped.slice(0, 12));
      } catch {
        if (controller.signal.aborted) return;
        setSuggestions([...fromSaved, ...fromIndex].slice(0, 8));
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
      if (suggestAbortRef.current === controller) {
        suggestAbortRef.current = null;
      }
    };
  }, [dashboardView, searchInputDraft, news.savedSearches]);

  useEffect(() => {
    setSearchInputDraft(news.query);
  }, [news.query]);

  useEffect(() => {
    if (dashboardView !== "news") return;
    const disposeAlerts = globalRefreshRuntime.register({
      pool: "news",
      task: {
      key: "news:alerts-poll",
      intervalMs: NEWS_REFRESH_MS,
      runOnStart: false,
      jitterPct: 0.2,
      hiddenIntervalMultiplier: 3.5,
      timeoutMs: 25_000,
      run: async ({ signal }) => {
        const alerts = alertsRef.current.filter((item) => item.enabled).slice(0, 8);
        if (!alerts.length) return;

        alertsAbortRef.current?.abort();
        const controller = new AbortController();
        alertsAbortRef.current = controller;
        signal.addEventListener("abort", () => controller.abort(), { once: true });

        for (const alert of alerts) {
          if (controller.signal.aborted) return;
          try {
            const payload = await fetchJson<SearchRouteResult>(
              `/api/news/search?q=${encodeURIComponent(alert.query)}&limit=60`,
              {
                key: `news:alert:${alert.id}:${alert.query}`,
                signal: controller.signal,
                timeoutMs: 15_000,
                retries: 1,
                negativeTtlMs: 900,
              }
            );
            const fingerprints = payload.items.map((item) => makeFingerprint(item));
            const seen = new Set(alert.seenFingerprints);
            const newHits = fingerprints.filter((fp) => !seen.has(fp));
            const nextSeen = Array.from(new Set([...alert.seenFingerprints, ...newHits])).slice(-500);
            if (newHits.length >= alert.threshold) {
              if (alert.soundEnabled) playAlertTone();
              upsertNewsAlert({
                ...alert,
                lastChecked: Date.now(),
                hitCount: alert.hitCount + newHits.length,
                unreadCount: alert.unreadCount + newHits.length,
                seenFingerprints: nextSeen,
              });
            } else {
              upsertNewsAlert({ ...alert, lastChecked: Date.now(), seenFingerprints: nextSeen });
            }
          } catch (error) {
            if (isAbortError(error) || controller.signal.aborted) return;
          }
        }

        if (alertsAbortRef.current === controller) {
          alertsAbortRef.current = null;
        }
      },
      },
    });
    return () => {
      disposeAlerts();
      alertsAbortRef.current?.abort();
      alertsAbortRef.current = null;
    };
  }, [dashboardView, upsertNewsAlert]);

  useEffect(() => {
    if (dashboardView !== "news") return;
    if (!selectedItem) {
      contextAbortRef.current?.abort();
      contextAbortRef.current = null;
      setRelatedItems([]);
      setTimeline([]);
      return;
    }
    contextAbortRef.current?.abort();
    const controller = new AbortController();
    contextAbortRef.current = controller;
    const query = [selectedItem.entity, selectedItem.placeName, selectedItem.headline.split(/\s+/g).slice(0, 4).join(" ")]
      .filter(Boolean)
      .join(" ");
    void Promise.all([
      fetchJson<{ articles?: GdeltArticle[] }>(
        `/api/news/gdelt-context?q=${encodeURIComponent(query)}`,
        {
          key: `news:ctx:${query}`,
          signal: controller.signal,
          timeoutMs: 12_000,
          retries: 1,
          negativeTtlMs: 900,
        }
      ),
      fetchJson<{ timeline?: Array<{ date: string; value: number }> }>(
        `/api/news/gdelt-timeline?q=${encodeURIComponent(query)}&timespan=7d`,
        {
          key: `news:timeline:${query}`,
          signal: controller.signal,
          timeoutMs: 12_000,
          retries: 1,
          negativeTtlMs: 900,
        }
      ),
    ])
      .then(([ctx, tl]) => {
        if (controller.signal.aborted) return;
        setRelatedItems((ctx.articles ?? []).slice(0, 8));
        setTimeline(tl.timeline ?? []);
      })
      .catch((error) => {
        if (isAbortError(error) || controller.signal.aborted) return;
        setRelatedItems([]);
        setTimeline([]);
      });
    return () => {
      controller.abort();
      if (contextAbortRef.current === controller) {
        contextAbortRef.current = null;
      }
    };
  }, [dashboardView, selectedItem?.id]);

  useEffect(() => {
    if (dashboardView !== "news") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && searchResultsOpen) {
        event.preventDefault();
        setSearchResultsOpen(false);
        return;
      }
      if (isTypingTarget(event.target)) return;
      if (event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }
      if (event.key.toLowerCase() === "j") {
        event.preventDefault();
        setSelectedRow((prev) => Math.min(prev + 1, Math.max(0, terminalItems.length - 1)));
        return;
      }
      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSelectedRow((prev) => Math.max(0, prev - 1));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const item = terminalItems[selectedRow];
        if (!item) return;
        setSelectedStory(item.id);
        setStoryPopupArticle(item);
        const marker = news.markers.find((entry) => entry.articleId === item.id);
        setHighlightMarker(marker?.id ?? null);
        return;
      }
      if (event.key.toLowerCase() === "g") {
        event.preventDefault();
        useSIGINTStore.getState().setNewsPanelFocus("news-globe");
        return;
      }
      if (event.key.toLowerCase() === "v") {
        event.preventDefault();
        setNewsPanelVisibility("news-video-1", true);
        useSIGINTStore.getState().setNewsPanelFocus("news-video-1");
        return;
      }
      if (event.key.toLowerCase() === "a") {
        event.preventDefault();
        const next: AlertRuleState = {
          id: `alert-${Date.now().toString(36)}`,
          name: news.query.slice(0, 48) || "Alert",
          query: news.query,
          threshold: 1,
          soundEnabled: false,
          enabled: true,
          lastChecked: 0,
          hitCount: 0,
          unreadCount: 0,
          seenFingerprints: [],
        };
        upsertNewsAlert(next);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    dashboardView,
    terminalItems,
    selectedRow,
    news.query,
    news.markers,
    searchResultsOpen,
    setSelectedStory,
    setHighlightMarker,
    setNewsPanelVisibility,
    upsertNewsAlert,
  ]);

  useEffect(() => {
    const next = terminalItems[selectedRow];
    if (!next) return;
    if (news.selectedStoryId === next.id) return;
    setSelectedStory(next.id);
    const marker = news.markers.find((entry) => entry.articleId === next.id);
    setHighlightMarker(marker?.id ?? null);
  }, [selectedRow, terminalItems.length, news.markers, news.selectedStoryId, setSelectedStory, setHighlightMarker]);

  useEffect(() => {
    return () => {
      searchAbortRef.current?.abort();
      searchAbortRef.current = null;
      videoAbortRef.current?.abort();
      videoAbortRef.current = null;
      suggestAbortRef.current?.abort();
      suggestAbortRef.current = null;
      contextAbortRef.current?.abort();
      contextAbortRef.current = null;
      alertsAbortRef.current?.abort();
      alertsAbortRef.current = null;
    };
  }, []);

  const tapeItem = terminalItems.length
    ? terminalItems[((news.headlineTape.cursor % terminalItems.length) + terminalItems.length) % terminalItems.length]
    : null;

  const newsMapEngineEnv = (process.env.NEXT_PUBLIC_NEWS_MAP_ENGINE ?? "").trim().toLowerCase();
  // Default to Leaflet; set NEXT_PUBLIC_NEWS_MAP_ENGINE=maplibre to use the MapLibre GL engine.
  const newsMapEngine: "maplibre" | "leaflet" =
    newsMapEngineEnv === "maplibre" ? "maplibre" : "leaflet";

  const lockHeaderProps = (panelId: string) => ({
    locked: news.panelLocks[panelId] === true,
    onToggleLock: () => setNewsPanelLock(panelId, !(news.panelLocks[panelId] === true)),
  });

  const panelNodes = [
    {
      id: "news-terminal",
      node: (
        <TerminalFeedPanel lockHeaderProps={lockHeaderProps("news-terminal")} />
      ),
    },
    {
      id: "news-predictions",
      node: (
        <PredictionMarketsPanel
          key="news-predictions"
          panelId="news-predictions"
          lockHeaderProps={lockHeaderProps("news-predictions")}
        />
      ),
    },
    {
      id: "news-compliance",
      node: (
        <CompliancePanel lockHeaderProps={lockHeaderProps("news-compliance")} />
      ),
    },
    {
      id: "news-globe",
      node: (
        <Panel panelId="news-globe" workspace="news">
          <PanelHeader
            title="NEWS MAP"
            subtitle="2D world map with news event markers"
            {...lockHeaderProps("news-globe")}
            controls={<PanelControls onRefresh={() => void runSearch("manual")} />}
          />
          <PanelBody noPadding className="si-news-globe-body">
            <div className="si-news-globe-cube">
              <div style={{ position: "relative", width: "100%", height: "100%" }}>
                {newsMapEngine === "maplibre" ? (
                  <MapLibreNewsMap
                    onReady={() => setNewsMapReady(true)}
                    onFatalError={(reason) => {
                      setNewsUiState({ statusLine: reason });
                    }}
                  />
                ) : (
                  <NewsWorldMap onReady={() => setNewsMapReady(true)} />
                )}
              </div>
              <NewsMapOverlay ready={newsMapReady} />
            </div>
          </PanelBody>
          <PanelFooter
            source="NEWS MAP"
            updatedAt={Date.now()}
            health={
              newsBackendHealth.search === "loading"
                ? "loading"
                : Object.values(newsBackendHealth).some((v) => v === "degraded")
                  ? "stale"
                  : "ok"
            }
            message={newsGlobeFooterMessage}
          />
        </Panel>
      ),
    },
    ...LIVE_VIDEO_PANELS.map((cfg) => {
      const panelState = (news.video.byPanel ?? {})[cfg.id] ?? {
        selectedVideoId: null,
        selectedChannelFilter: null,
        manualUrl: "",
      };
      return {
        id: cfg.id,
        node: (
          <LiveVideoPanel
            key={cfg.id}
            panelId={cfg.id}
            title={cfg.title}
            subtitle={cfg.subtitle}
            category={cfg.category}
            liveStreams={liveStreams}
            panelState={panelState}
            setPanelState={(partial) => setNewsVideoPanelState(cfg.id, partial)}
            lockHeaderProps={lockHeaderProps(cfg.id)}
            onRefresh={() => void refreshVideo()}
            loading={videoLoading}
            videoKeyMissing={videoKeyMissing}
            discoverySource={videoDiscoverySource}
            fallbackActive={videoFallbackActive}
            backendHealth={newsBackendHealth.youtube ?? "ok"}
            liveCount={liveStreams.filter((s) => s.status === "live").length}
            totalCount={liveStreams.length}
          />
        ),
      };
    }),
    ...CATEGORY_PANEL_CONFIGS.map((cfg) => ({
      id: cfg.id,
      node: (
        <Panel key={cfg.id} panelId={cfg.id} workspace="news">
          <PanelHeader title={cfg.title} {...lockHeaderProps(cfg.id)} />
          <PanelBody noPadding className="si-catfeed-panel-body">
            <CategoryFeedPanel config={cfg} liveCutoffMs={LIVE_CUTOFF_MS} />
          </PanelBody>
        </Panel>
      ),
      minW: 60,
      minH: 50,
    })),
  ];

  const executeSearch = useCallback(
    (query: string) => {
      setNewsQuery(query);
      void runSearch("manual", query);
      setSearchResultsOpen(true);
    },
    [setNewsQuery, runSearch]
  );

  return (
    <div className={`si-news-workspace ${embedded ? "is-embedded" : ""}`.trim()}>
      {showBriefing && <NewsDailyBriefingModal onClose={() => setShowBriefing(false)} />}
      <NewsTickerBar />
      {isMobile ? (
        <div className="si-news-phone-search-card">
          <div className="si-news-phone-search-status">
            {loading ? "SEARCHING..." : `${filteredItems.length} STORIES`}
            {news.ui.statusLine ? ` | ${news.ui.statusLine}` : ""}
          </div>
          <div className="si-news-phone-search-row">
            <input
              type="text"
              className="si-news-search-input"
              ref={searchInputRef}
              value={searchInputDraft}
              onChange={(event) => {
                setSearchInputDraft(event.target.value);
                setSuggestOpen(true);
              }}
              onFocus={() => setSuggestOpen(true)}
              onBlur={() => setTimeout(() => setSuggestOpen(false), 100)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  executeSearch(searchInputDraft.trim());
                  setSuggestOpen(false);
                }
              }}
              placeholder="Search news, topic, company, place"
            />
            <button
              type="button"
              className="si-news-phone-search-submit"
              onClick={() => {
                executeSearch(searchInputDraft.trim());
                setSuggestOpen(false);
              }}
            >
              SEARCH
            </button>
          </div>
          {suggestOpen && suggestions.length ? (
            <div className="si-news-suggest-list">
              {suggestions.map((entry) => (
                <button
                  key={`${entry.type}-${entry.value}`}
                  type="button"
                  onMouseDown={() => {
                    setSearchInputDraft(entry.value);
                    executeSearch(entry.value);
                    setSuggestOpen(false);
                  }}
                >
                  <span>{entry.label}</span>
                  <span>{entry.type}</span>
                </button>
              ))}
            </div>
          ) : null}
          <div className="si-news-phone-action-row">
            <button type="button" onClick={() => setTopbarExpanded((prev) => !prev)}>
              {topbarExpanded ? "LESS FILTERS" : "MORE FILTERS"}
            </button>
            <button type="button" onClick={() => setShowBriefing(true)}>DAILY BRIEFING</button>
            <button type="button" onClick={() => setBookmarkPanelOpen((p) => !p)}>
              SAVED {bookmarkedIds.size > 0 ? `(${bookmarkedIds.size})` : ""}
            </button>
          </div>
          {bookmarkPanelOpen ? (
            <div className="si-news-phone-saved-list">
              {bookmarkedIds.size === 0 ? (
                <div className="si-news-empty">No saved articles</div>
              ) : (
                Array.from(bookmarkedIds).map((id) => {
                  const item = feedItems.find((f) => f.id === id);
                  return (
                    <div key={id} className="si-news-bookmark-row">
                      <span
                        className="si-news-bookmark-title"
                        onClick={() => {
                          if (item) {
                            setStoryPopupArticle(item);
                            setBookmarkPanelOpen(false);
                          }
                        }}
                      >
                        {item?.headline ?? id.slice(0, 30)}
                      </span>
                      <button type="button" onClick={() => toggleBookmark(id)} title="Remove">x</button>
                    </div>
                  );
                })
              )}
            </div>
          ) : null}
          {topbarExpanded ? (
            <div className="si-news-phone-filter-drawer">
              <div className="si-news-time-filters">
                {(["1h", "6h", "24h", "7d"] as const).map((range) => (
                  <button key={range} type="button" className={timeRange === range ? "is-active" : ""} onClick={() => setTimeRange(timeRange === range ? null : range)}>
                    {range.toUpperCase()}
                  </button>
                ))}
                <button type="button" onClick={() => setShowStats((p) => !p)}>
                  {showStats ? "HIDE STATS" : "SHOW STATS"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    saveNewsSearch({
                      id: `search-${Date.now().toString(36)}`,
                      name: searchInputDraft.slice(0, 36) || "Saved Query",
                      query: searchInputDraft.trim(),
                      createdAt: Date.now(),
                      alertEnabled: false,
                    })
                  }
                >
                  SAVE SEARCH
                </button>
              </div>
              {showStats ? (
                <div className="si-news-stats-bar">
                  {Object.entries(
                    filteredItems.reduce<Record<string, number>>((acc, item) => { acc[item.category] = (acc[item.category] ?? 0) + 1; return acc; }, {})
                  ).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([cat, count]) => (
                    <span key={cat} className="si-news-stat-badge" style={{ borderColor: CATEGORY_COLORS[cat] ?? "#89e5ff" }}>
                      <span style={{ color: CATEGORY_COLORS[cat] ?? "#89e5ff" }}>{cat.toUpperCase()}</span> {count}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="si-news-presets">
                {PRESET_QUERIES.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setSearchInputDraft(preset.query);
                      executeSearch(preset.query);
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="si-news-query-hints">
                {QUERY_HINT_ITEMS.map((item) => (
                  <button
                    key={item.chip}
                    type="button"
                    className="si-hint-chip"
                    title={`${item.hint}. Click to add filter. Example: ${item.example}`}
                    onClick={() => {
                      setSearchInputDraft((prev) => {
                        const trimmed = prev.trimEnd();
                        if (trimmed.endsWith(item.chip)) return prev;
                        return `${trimmed} ${item.chip}`.trimStart();
                      });
                      searchInputRef.current?.focus();
                    }}
                  >
                    <span className="si-hint-chip-label">{item.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {!isMobile ? (
        <>
      <div className="si-news-toolbar">
        <div className="si-toolbar-status">
          {loading ? "SEARCHING..." : `${filteredItems.length} STORIES`}
          {news.lastUpdated ? ` | UPDATED ${formatUtc(news.lastUpdated)}` : ""}
          {news.ui.statusLine ? ` | ${news.ui.statusLine}` : ""}
        </div>
        <div className="si-toolbar-actions">
          <button type="button" onClick={() => setShowBriefing(true)}>DAILY BRIEFING</button>
          <div className="si-news-toolbar-panels">
            <button type="button" onClick={() => setBookmarkPanelOpen((p) => !p)}>
              SAVED {bookmarkedIds.size > 0 ? `(${bookmarkedIds.size})` : ""}
            </button>
            {bookmarkPanelOpen ? (
              <div className="si-news-panel-popover si-news-bookmarks-popover">
                {bookmarkedIds.size === 0 ? (
                  <div style={{ padding: 6, color: "var(--si-text-muted)", fontSize: 10 }}>No saved articles</div>
                ) : (
                  Array.from(bookmarkedIds).map((id) => {
                    const item = feedItems.find((f) => f.id === id);
                    return (
                      <div key={id} className="si-news-bookmark-row">
                        <span className="si-news-bookmark-title" onClick={() => { if (item) { setStoryPopupArticle(item); setBookmarkPanelOpen(false); } }}>
                          {item?.headline ?? id.slice(0, 30)}
                        </span>
                        <button type="button" onClick={() => toggleBookmark(id)} title="Remove">x</button>
                      </div>
                    );
                  })
                )}
              </div>
            ) : null}
          </div>
          {!isMobile && (
            <button type="button" onClick={() => {
              const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
              const rows = filteredItems.map((i) => [i.publishedAt, q(i.headline ?? ""), q(i.source ?? ""), q(i.category ?? ""), q(i.url ?? ""), i.score ?? ""].join(","));
              const csv = ["publishedAt,headline,source,category,url,score", ...rows].join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `news-export-${Date.now()}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
            }}>EXPORT</button>
          )}
          <button type="button" onClick={() => setShowStats((p) => !p)}>{showStats ? "HIDE STATS" : "STATS"}</button>
          {!isMobile && (
            <button type="button" onClick={() => resetNewsLayout()}>RESET LAYOUT</button>
          )}
          {!isMobile && (
            <button type="button" onClick={() => setNewsUiState({ showHelpHints: !news.ui.showHelpHints })}>
              {news.ui.showHelpHints ? "HIDE HINTS" : "SHOW HINTS"}
            </button>
          )}
          {!isMobile && (
            <div className="si-news-toolbar-panels">
              <button type="button" onClick={() => setPanelMenuOpen((prev) => !prev)}>PANELS</button>
              {panelMenuOpen ? (
                <div className="si-news-panel-popover">
                  {Object.keys(news.panelVisibility).map((panelId) => (
                    <label key={panelId}>
                      <input
                        type="checkbox"
                        checked={news.panelVisibility[panelId] !== false}
                        onChange={(event) => setNewsPanelVisibility(panelId, event.target.checked)}
                      />
                      {panelId.replace("news-", "")}
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          )}
          {!isMobile && news.ui.showHelpHints ? (
            <span className="si-news-hotkeys" title="Keyboard shortcuts (when not typing)">
              <kbd>/</kbd> focus search | <kbd>j</kbd>/<kbd>k</kbd> move | <kbd>Enter</kbd> open story | <kbd>g</kbd> globe | <kbd>v</kbd> video | <kbd>a</kbd> new alert
            </span>
          ) : null}
        </div>
      </div>

      <div className="si-news-filter-bar">
        <div className="si-news-time-filters">
          {(["1h", "6h", "24h", "7d"] as const).map((range) => (
            <button key={range} type="button" className={timeRange === range ? "is-active" : ""} onClick={() => setTimeRange(timeRange === range ? null : range)}>
              {range.toUpperCase()}
            </button>
          ))}
        </div>
        {showStats ? (
          <div className="si-news-stats-bar">
            {Object.entries(
              filteredItems.reduce<Record<string, number>>((acc, item) => { acc[item.category] = (acc[item.category] ?? 0) + 1; return acc; }, {})
            ).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([cat, count]) => (
              <span key={cat} className="si-news-stat-badge" style={{ borderColor: CATEGORY_COLORS[cat] ?? "#89e5ff" }}>
                <span style={{ color: CATEGORY_COLORS[cat] ?? "#89e5ff" }}>{cat.toUpperCase()}</span> {count}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="si-news-topbar">
        <div className="si-news-topbar-main">
          <div className="si-news-query-row">
            <input
              type="text"
              className="si-news-search-input"
              ref={searchInputRef}
              value={searchInputDraft}
              onChange={(event) => {
                setSearchInputDraft(event.target.value);
                setSuggestOpen(true);
              }}
              onFocus={() => setSuggestOpen(true)}
              onBlur={() => setTimeout(() => setSuggestOpen(false), 100)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  const nextQuery = searchInputDraft.trim();
                  executeSearch(nextQuery);
                  setSuggestOpen(false);
                }
              }}
              placeholder="Search news... e.g. Apple, Tesla, Ukraine"
            />

            <button
              type="button"
              onClick={() =>
                saveNewsSearch({
                  id: `search-${Date.now().toString(36)}`,
                  name: searchInputDraft.slice(0, 36) || "Saved Query",
                  query: searchInputDraft.trim(),
                  createdAt: Date.now(),
                  alertEnabled: false,
                })
              }
            >
              SAVE
            </button>
            <button
              type="button"
              className="si-topbar-toggle"
              onClick={() => setTopbarExpanded((prev) => !prev)}
              title={topbarExpanded ? "Hide presets & saved searches" : "Show presets & saved searches"}
            >
              {topbarExpanded ? "LESS" : "MORE"}
            </button>
          </div>
          {suggestOpen && suggestions.length ? (
            <div className="si-news-suggest-list">
              {suggestions.map((entry) => (
                <button
                  key={`${entry.type}-${entry.value}`}
                  type="button"
                  onMouseDown={() => {
                    setSearchInputDraft(entry.value);
                    executeSearch(entry.value);
                    setSuggestOpen(false);
                  }}
                >
                  <span>{entry.label}</span>
                  <span>{entry.type}</span>
                </button>
              ))}
            </div>
          ) : null}
          <div className="si-news-query-hints">
            {QUERY_HINT_ITEMS.map((item) => (
              <button
                key={item.chip}
                type="button"
                className="si-hint-chip"
                title={`${item.hint}. Click to add filter. Example: ${item.example}`}
                onClick={() => {
                  setSearchInputDraft((prev) => {
                    const trimmed = prev.trimEnd();
                    if (trimmed.endsWith(item.chip)) return prev;
                    return `${trimmed} ${item.chip}`.trimStart();
                  });
                  searchInputRef.current?.focus();
                }}
              >
                <span className="si-hint-chip-label">{item.hint}</span>
              </button>
            ))}
          </div>
        </div>
        {topbarExpanded ? (
          <div className="si-news-topbar-expanded">
            <div className="si-news-presets">
              {PRESET_QUERIES.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setSearchInputDraft(preset.query);
                    executeSearch(preset.query);
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            {news.savedSearches.length ? (
              <div className="si-news-facet-grid">
                {news.savedSearches.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => {
                      setSearchInputDraft(entry.query);
                      executeSearch(entry.query);
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      deleteNewsSearch(entry.id);
                    }}
                    title="Right-click to delete"
                  >
                    {entry.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {searchResultsOpen ? (
          <div className="si-news-search-overlay">
            <div className="si-news-search-overlay-header">
              <span className="si-news-search-overlay-title">
                SEARCH RESULTS  | {news.query || "all"}  | {terminalItems.length} stories
              </span>
              <button type="button" onClick={() => setSearchResultsOpen(false)}>CLOSE</button>
            </div>
            <div className="si-news-category-tabs">
              <button type="button" className={activeCategory === "all" ? "is-active" : ""} onClick={() => setActiveCategory("all")}>
                All
              </button>
              {CATEGORY_TABS.map((cat) => (
                <button key={cat} type="button" className={activeCategory === cat ? "is-active" : ""} onClick={() => setActiveCategory(cat)}>
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
            <div className="si-news-search-overlay-body">
              {isMobile ? (
                terminalItems.length > 0 ? (
                  <div className="si-news-mobile-results-list">
                    {terminalItems.map((item, idx) => {
                      const marker = news.markers.find((m) => m.articleId === item.id);
                      return (
                        <div
                          key={item.id}
                          className={`si-news-mobile-result-card${item.id === selectedItem?.id ? " is-selected" : ""}`}
                          onClick={() => {
                            setSelectedRow(idx);
                            setSelectedStory(item.id);
                            setStoryPopupArticle(item);
                            setHighlightMarker(marker?.id ?? null);
                            setSearchResultsOpen(false);
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="si-news-mobile-result-top">
                            <span style={{ color: CATEGORY_COLORS[item.category] ?? "#89e5ff" }}>
                              {CATEGORY_LABELS[item.category as keyof typeof CATEGORY_LABELS] ?? item.category}
                            </span>
                            <span>{formatShortTime(item.publishedAt)}</span>
                            <span>{item.source}</span>
                          </div>
                          <div className="si-news-mobile-result-headline">{item.headline}</div>
                          <div className="si-news-mobile-result-meta">
                            <span>{extractEntity(item)}</span>
                            <span>{extractRegion(item)}</span>
                            <span>SCORE {Math.round(item.score)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="si-news-empty">
                    {news.queryState.lastEmptyReason ?? "No results for current filters."}
                    {backendIssueSummary ? ` (${backendIssueSummary})` : ""}
                  </div>
                )
              ) : (
                <div className="si-news-terminal-table-scroll">
                  <div className="si-news-terminal-table">
                    <div className="si-news-terminal-row si-news-terminal-head" role="row">
                      <span className="si-news-terminal-cell si-col-time">TIME</span>
                      <span className="si-news-terminal-cell si-col-source">SOURCE</span>
                      <span className="si-news-terminal-cell si-col-entity">ENTITY</span>
                      <span className="si-news-terminal-cell si-col-region">REGION</span>
                      <span className="si-news-terminal-cell si-col-headline">HEADLINE</span>
                      <span className="si-news-terminal-cell si-col-score">SCORE</span>
                    </div>
                    {terminalItems.length > 0 ? (
                      <List
                        rowCount={terminalItems.length}
                        rowHeight={28}
                        overscanCount={15}
                        rowComponent={SearchOverlayRow as any}
                        rowProps={{
                          items: terminalItems,
                          selectedItemId: selectedItem?.id ?? null,
                          markersRef: news.markers,
                          onRowClick: (idx: number, item: NormalizedNewsItem, markerId: string | null) => {
                            setSelectedRow(idx);
                            setSelectedStory(item.id);
                            setStoryPopupArticle(item);
                            setHighlightMarker(markerId);
                            setSearchResultsOpen(false);
                          },
                          onRowContextMenu: (item: NormalizedNewsItem, event: React.MouseEvent) => {
                            const x = Math.min(event.clientX, window.innerWidth - 220);
                            const y = Math.min(event.clientY, window.innerHeight - 140);
                            setContextPos({ x, y });
                            setContextItem(item);
                          },
                        }}
                        style={{ height: "calc(100% - 28px)", overflow: "auto" }}
                      />
                    ) : (
                      <div className="si-news-empty">
                        {news.queryState.lastEmptyReason ?? "No results for current filters."}
                        {backendIssueSummary ? ` (${backendIssueSummary})` : ""}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
        </>
      ) : null}

      <div className="si-news-grid-area">
        <NewsDraggableGrid
          panels={panelNodes.filter((panel) => news.panelVisibility[panel.id] !== false)}
          emptyCategoryPanelIds={CATEGORY_PANEL_CONFIGS.filter((c) => news.categoryPanelHasArticles[c.id] === false).map((c) => c.id)}
        />
      </div>

      {news.storyPopupArticle ? (
        <NewsPopupModal
          article={news.storyPopupArticle}
          relatedItems={news.storyPopupArticle.id === selectedItem?.id ? relatedItems : undefined}
          timeline={news.storyPopupArticle.id === selectedItem?.id ? timeline : undefined}
          onClose={() => setStoryPopupArticle(null)}
          isBookmarked={bookmarkedIds.has(news.storyPopupArticle.id)}
          onToggleBookmark={toggleBookmark}
        />
      ) : null}

      {contextItem ? (
        <div className="si-news-context-menu" role="menu" aria-label="row actions" style={{ left: contextPos.x, top: contextPos.y }}>
          <button type="button" onClick={() => { window.open(contextItem.url, "_blank", "noopener,noreferrer"); setContextItem(null); }}>
            Open Link
          </button>
          <button type="button" onClick={() => { void navigator.clipboard.writeText(contextItem.url); setContextItem(null); }}>
            Copy Link
          </button>
          <button type="button" onClick={() => { useSIGINTStore.getState().muteNewsSource(contextItem.source, true); setContextItem(null); }}>
            Mute Source
          </button>
          <button type="button" onClick={() => { toggleBookmark(contextItem.id); setContextItem(null); }}>
            {bookmarkedIds.has(contextItem.id) ? "Remove Bookmark" : "Bookmark"}
          </button>
          <button type="button" onClick={() => setContextItem(null)}>Close</button>
        </div>
      ) : null}
    </div>
  );
}




