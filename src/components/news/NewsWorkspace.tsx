"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_LABELS, PRESET_QUERIES, ROTATE_INTERVAL_OPTIONS } from "../../config/newsConfig";
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
  YouTubeLive,
} from "../../lib/news/types";
import { formatUtc } from "../../lib/dashboard/format";
import { useWorldViewStore } from "../../store";
import Panel from "../dashboard/panel/Panel";
import PanelBody from "../dashboard/panel/PanelBody";
import PanelControls from "../dashboard/panel/PanelControls";
import PanelFooter from "../dashboard/panel/PanelFooter";
import PanelHeader from "../dashboard/panel/PanelHeader";
import Toggle from "../dashboard/controls/Toggle";
import NewsDraggableGrid from "./NewsDraggableGrid";
import NewsWorldMap from "./NewsWorldMap";

const NEWS_REFRESH_MS = 12_000;
const NEWS_TERMINAL_TICK_MS = 1_000;
const NEWS_TAPE_TICK_MS = 2_000;
const VIDEO_REFRESH_MS = 120_000;
const NEWS_RETENTION_MS = 24 * 60 * 60_000;
const NEWS_RETENTION_MAX_ITEMS = 1200;

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
  "local",
  "filings",
  "watchlist",
] as const;

const SEARCH_INDEX = new InMemoryNewsIndex(5000);
const NEWS_CACHE_KEY = "worldview-news-feed-cache-v1";
const NEWS_CACHE_MAX_ITEMS = 240;
const NEWS_CACHE_MAX_MARKERS = 600;
const NEWS_CACHE_MAX_AGE_MS = 24 * 60 * 60_000;

const EMPTY_FACETS: NewsFacetState = {
  sources: [],
  categories: [],
  languages: [],
  regions: [],
  coordAvailability: [],
};

interface PersistedNewsCache {
  savedAt: number;
  query: string;
  items: NewsArticle[];
  markers: GeoMarker[];
  facets: NewsFacetState;
}

function readNewsCache(): PersistedNewsCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(NEWS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedNewsCache> | null;
    if (!parsed || !Array.isArray(parsed.items) || !Array.isArray(parsed.markers)) return null;
    const savedAt = Number(parsed.savedAt);
    if (!Number.isFinite(savedAt)) return null;
    if (Date.now() - savedAt > NEWS_CACHE_MAX_AGE_MS) return null;
    return {
      savedAt,
      query: typeof parsed.query === "string" ? parsed.query : "",
      items: parsed.items.slice(0, NEWS_CACHE_MAX_ITEMS),
      markers: parsed.markers.slice(0, NEWS_CACHE_MAX_MARKERS),
      facets: parsed.facets ?? EMPTY_FACETS,
    };
  } catch {
    return null;
  }
}

function writeNewsCache(data: PersistedNewsCache): void {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedNewsCache = {
      savedAt: data.savedAt,
      query: data.query,
      items: data.items.slice(0, NEWS_CACHE_MAX_ITEMS),
      markers: data.markers.slice(0, NEWS_CACHE_MAX_MARKERS),
      facets: data.facets ?? EMPTY_FACETS,
    };
    window.localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore cache write errors
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return (await response.json()) as T;
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
  return new Date(ts).toISOString().slice(11, 19);
}

function splitCsv(raw: string): string[] {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
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
  params.set("limit", String(options.limit ?? 180));
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
            : item.country ?? "unknown";
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

function WatchlistChipSection({
  label,
  items,
  placeholder,
  onAdd,
  onRemove,
  transform,
}: {
  label: string;
  items: string[];
  placeholder: string;
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  transform?: (v: string) => string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleAdd = () => {
    const raw = inputRef.current?.value.trim();
    if (!raw || !inputRef.current) return;
    const values = splitCsv(raw);
    for (const v of values) {
      onAdd(transform ? transform(v) : v);
    }
    inputRef.current.value = "";
    inputRef.current.focus();
  };

  return (
    <div className="wv-wl-section">
      <div className="wv-wl-section-label">{label}</div>
      <div className="wv-wl-chips">
        {items.map((item) => (
          <span key={item} className="wv-wl-chip">
            <span>{item}</span>
            <button type="button" aria-label={`Remove ${item}`} onClick={() => onRemove(item)}>
              &times;
            </button>
          </span>
        ))}
        {!items.length && <span className="wv-wl-empty">{placeholder}</span>}
      </div>
      <div className="wv-wl-add-row">
        <input
          ref={inputRef}
          placeholder={`Add ${label.toLowerCase()}…`}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <button type="button" onClick={handleAdd}>+</button>
      </div>
    </div>
  );
}

export default function NewsWorkspace({ embedded = false }: { embedded?: boolean }) {
  const dashboardView = useWorldViewStore((s) => s.dashboard.activeView);
  const news = useWorldViewStore((s) => s.news);

  const setNewsQuery = useWorldViewStore((s) => s.setNewsQuery);
  const setNewsQueryAst = useWorldViewStore((s) => s.setNewsQueryAst);
  const setNewsQueryState = useWorldViewStore((s) => s.setNewsQueryState);
  const setNewsUiState = useWorldViewStore((s) => s.setNewsUiState);
  const setNewsFeedItems = useWorldViewStore((s) => s.setNewsFeedItems);
  const setNewsMarkers = useWorldViewStore((s) => s.setNewsMarkers);
  const setNewsFacets = useWorldViewStore((s) => s.setNewsFacets);
  const setNewsThreads = useWorldViewStore((s) => s.setNewsThreads);
  const setSelectedStory = useWorldViewStore((s) => s.setSelectedStory);
  const setHighlightMarker = useWorldViewStore((s) => s.setHighlightMarker);
  const setSearchInView = useWorldViewStore((s) => s.setSearchInView);
  const setNewsLayoutPreset = useWorldViewStore((s) => s.setNewsLayoutPreset);
  const resetNewsLayout = useWorldViewStore((s) => s.resetNewsLayout);
  const setNewsPanelVisibility = useWorldViewStore((s) => s.setNewsPanelVisibility);
  const setNewsPanelLock = useWorldViewStore((s) => s.setNewsPanelLock);
  const setNewsWatchlist = useWorldViewStore((s) => s.setNewsWatchlist);
  const saveNewsSearch = useWorldViewStore((s) => s.saveNewsSearch);
  const deleteNewsSearch = useWorldViewStore((s) => s.deleteNewsSearch);
  const upsertNewsAlert = useWorldViewStore((s) => s.upsertNewsAlert);
  const ackNewsAlert = useWorldViewStore((s) => s.ackNewsAlert);
  const setNewsVideoState = useWorldViewStore((s) => s.setNewsVideoState);
  const setHeadlineTape = useWorldViewStore((s) => s.setHeadlineTape);
  const advanceHeadlineTape = useWorldViewStore((s) => s.advanceHeadlineTape);
  const setNewsBackendHealth = useWorldViewStore((s) => s.setNewsBackendHealth);
  const setNewsLastUpdated = useWorldViewStore((s) => s.setNewsLastUpdated);

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
  const [contextItem, setContextItem] = useState<NewsArticle | null>(null);
  const [searchInputDraft, setSearchInputDraft] = useState(news.query || "news time:24h");
  const [panelMenuOpen, setPanelMenuOpen] = useState(false);
  const [searchResultsOpen, setSearchResultsOpen] = useState(false);
  const [topbarExpanded, setTopbarExpanded] = useState(false);
  const initialLayoutAppliedRef = useRef(false);
  const cacheHydratedRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchInFlightRef = useRef(false);
  const searchRequestIdRef = useRef(0);
  const rollingFeedContextRef = useRef("");
  const rollingFeedRef = useRef<NormalizedNewsItem[]>([]);
  const markerByArticleIdRef = useRef<Map<string, GeoMarker>>(new Map());
  const frozenPollBboxRef = useRef<string | null>(null);
  const pendingTerminalQueueRef = useRef<string[]>([]);
  const terminalOrderRef = useRef<string[]>([]);
  const terminalItemsRef = useRef<NormalizedNewsItem[]>([]);
  const [terminalVersion, setTerminalVersion] = useState(0);
  const searchContextRef = useRef({
    query: news.query,
    searchInView: news.searchInView,
    selectedStoryId: news.selectedStoryId,
    bbox: null as string | null,
    geoMode: "pointdata" as "pointdata" | "country" | "adm1",
  });

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
    const merged = [...existing, ...appended];
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
    const cached = readNewsCache();
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
    const bySource = feedItems.filter((item) => !sourceMuted.has(item.source.toLowerCase()));
    if (activeCategory === "all") return bySource;
    if (activeCategory === "watchlist") {
      return bySource.filter((item) => {
        const text = `${item.headline} ${item.snippet} ${item.entity ?? ""}`.toLowerCase();
        const tickerHit = news.watchlist.tickers.some((token) => text.includes(token.toLowerCase()));
        const topicHit = news.watchlist.topics.some((token) => text.includes(token.toLowerCase()));
        const regionText = `${item.region ?? item.country ?? item.placeName ?? ""}`.toLowerCase();
        const regionHit = news.watchlist.regions.some((token) => regionText.includes(token.toLowerCase()));
        return tickerHit || topicHit || regionHit;
      });
    }
    return bySource.filter((item) => item.category === activeCategory);
  }, [feedItems, activeCategory, news.mutedSources, news.watchlist]);

  const terminalItems = useMemo(() => {
    const order = new Map<string, number>();
    terminalOrderRef.current.forEach((id, index) => {
      order.set(id, index);
    });
    return [...filteredItems].sort((a, b) => {
      const ai = order.get(a.id);
      const bi = order.get(b.id);
      if (ai != null && bi != null && ai !== bi) return ai - bi;
      if (ai != null && bi == null) return -1;
      if (ai == null && bi != null) return 1;
      return compareNewsItems(a, b);
    });
  }, [filteredItems, terminalVersion]);

  useEffect(() => {
    terminalItemsRef.current = terminalItems;
  }, [terminalItems]);

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
    if (newsBackendHealth.search === "loading") return "Searching…";
    const anyDegraded = Object.values(newsBackendHealth).some((v) => v === "degraded");
    if (anyDegraded) return "Some sources delayed";
    return undefined;
  }, [newsBackendHealth]);

  const videoChannels = useMemo(() => {
    const byChannel = new Map<string, { channelId: string; channelName: string; liveCount: number; recentCount: number }>();
    for (const item of liveStreams) {
      const prev = byChannel.get(item.channelId) ?? {
        channelId: item.channelId,
        channelName: item.channelName,
        liveCount: 0,
        recentCount: 0,
      };
      if (item.status === "live") prev.liveCount += 1;
      else prev.recentCount += 1;
      byChannel.set(item.channelId, prev);
    }
    return Array.from(byChannel.values()).sort((a, b) => {
      const aWeight = a.liveCount * 100 + a.recentCount;
      const bWeight = b.liveCount * 100 + b.recentCount;
      return bWeight - aWeight || a.channelName.localeCompare(b.channelName);
    });
  }, [liveStreams]);

  const filteredLiveStreams = useMemo(() => {
    if (!news.video.selectedChannelFilter) return liveStreams;
    return liveStreams.filter((item) => item.channelId === news.video.selectedChannelFilter);
  }, [liveStreams, news.video.selectedChannelFilter]);

  const videoTabItems = useMemo(() => {
    const ordered = [...filteredLiveStreams].sort((a, b) => {
      if (a.status !== b.status) return a.status === "live" ? -1 : 1;
      const aTs = Date.parse(a.publishedAt ?? "");
      const bTs = Date.parse(b.publishedAt ?? "");
      if (Number.isFinite(aTs) && Number.isFinite(bTs)) return bTs - aTs;
      return 0;
    });
    const byChannel = new Map<string, YouTubeLive>();
    for (const stream of ordered) {
      if (!byChannel.has(stream.channelId)) {
        byChannel.set(stream.channelId, stream);
      }
    }
    return Array.from(byChannel.values()).slice(0, 14);
  }, [filteredLiveStreams]);

  useEffect(() => {
    if (dashboardView !== "news") return;
    if (!videoTabItems.length) return;
    const hasActive = videoTabItems.some((item) => item.videoId === news.video.selectedVideoId);
    if (hasActive) return;
    const next = videoTabItems[0];
    setNewsVideoState({ selectedVideoId: next.videoId, selectedChannelId: next.channelId });
  }, [dashboardView, videoTabItems, news.video.selectedVideoId, setNewsVideoState]);

  const runSearch = useCallback(
    async (
      reason: "manual" | "poll" | "query" = "manual",
      overrideQuery?: string
    ) => {
      if (dashboardView !== "news") return;
      if (reason === "poll" && searchInFlightRef.current) return;

      const stateNews = useWorldViewStore.getState().news;
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
            writeNewsCache({
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
          pushAttempt({
            id: "fallback-news-time-24h",
            query: "news time:24h",
            inView: false,
            bbox: null,
            mode: "pointdata",
          });
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

        for (const attempt of attempts) {
          if (requestId !== searchRequestIdRef.current) return;
          const payload = await fetchJson<SearchRouteResult>(
            buildSearchUrl(attempt.query, {
              inView: attempt.inView,
              bbox: attempt.bbox,
              mode: attempt.mode,
            })
          );
          lastPayload = payload;
          lastAttemptContext = { inView: attempt.inView, bbox: attempt.bbox, mode: attempt.mode };
          finalQuery = attempt.query;
          const count = payload.items?.length ?? 0;
          if (attempt.id !== "primary") {
            fallbackApplied.push(attempt.id);
          }
          if (count > 0) {
            lastCount = applyPayload(payload, attempt.query, lastAttemptContext);
            appliedFromAttempt = true;
            break;
          }
        }

        if (lastPayload && !appliedFromAttempt) {
          const existingItems = useWorldViewStore.getState().news.feedItems;
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
            lastEmptyReason: lastPayload.emptyReason ?? null,
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
        if (requestId !== searchRequestIdRef.current) return;
        console.error("[news/search] failed", error);
        setNewsBackendHealth("search", "error");
        setNewsUiState({ statusLine: "Search failed. Upstream sources may be throttled." });
      } finally {
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
    if (dashboardView !== "news" || !news.panelVisibility["news-video"]) return;
    setVideoLoading(true);
    setNewsBackendHealth("youtube", "loading");
    try {
      const payload = await fetchJson<{
        items: YouTubeLive[];
        keyMissing: boolean;
        degraded?: string[];
        liveCount?: number;
        channelsChecked?: number;
      }>("/api/news/youtube");
      const nextItems = payload.items ?? [];
      setLiveStreams(nextItems);
      setVideoKeyMissing(Boolean(payload.keyMissing));
      setNewsBackendHealth("youtube", payload.degraded?.length ? "degraded" : "ok");
      if (!news.video.selectedVideoId && nextItems.length) {
        const firstLive = nextItems.find((item) => item.status === "live") ?? nextItems[0];
        setNewsVideoState({ selectedVideoId: firstLive.videoId, selectedChannelId: firstLive.channelId });
      }
      if (nextItems.length) {
        setNewsUiState({
          statusLine: `Video list updated: ${payload.liveCount ?? 0} live across ${payload.channelsChecked ?? 0} channels.`,
        });
      }
    } catch (error) {
      console.error("[news/youtube] failed", error);
      setNewsBackendHealth("youtube", "error");
    } finally {
      setVideoLoading(false);
    }
  }, [
    dashboardView,
    news.panelVisibility,
    news.video.selectedVideoId,
    setNewsBackendHealth,
    setNewsVideoState,
    setNewsUiState,
  ]);

  useEffect(() => {
    if (dashboardView !== "news") return;
    if (!news.query.trim()) {
      setNewsQuery("news time:24h");
      return;
    }
    const timer = setTimeout(() => void runSearch("query"), 120);
    return () => clearTimeout(timer);
  }, [dashboardView, news.query, runSearch, setNewsQuery]);

  useEffect(() => {
    if (dashboardView !== "news") return;
    const id = setInterval(() => void runSearch("poll"), NEWS_REFRESH_MS);
    return () => clearInterval(id);
  }, [dashboardView, runSearch]);

  useEffect(() => {
    if (dashboardView !== "news") return;
    if (!news.panelVisibility["news-video"]) return;
    void refreshVideo();
    const id = setInterval(() => void refreshVideo(), VIDEO_REFRESH_MS);
    return () => clearInterval(id);
  }, [dashboardView, news.panelVisibility, refreshVideo]);

  useEffect(() => {
    if (dashboardView !== "news") return;
    if (!news.headlineTape.enabled || news.headlineTape.paused) return;
    if (!terminalItems.length) return;
    const id = setInterval(() => {
      // #region agent log
      const workspace = document.querySelector<HTMLElement>(".wv-news-workspace");
      const gridArea = document.querySelector<HTMLElement>(".wv-news-grid-area");
      const terminalBody = document.querySelector<HTMLElement>(".wv-news-terminal-body");
      const tapeStream = document.querySelector<HTMLElement>(".wv-news-tape-stream");
      const before = {
        workspace: workspace ? { scrollTop: workspace.scrollTop, scrollHeight: workspace.scrollHeight, clientHeight: workspace.clientHeight } : null,
        gridArea: gridArea ? { scrollTop: gridArea.scrollTop, scrollHeight: gridArea.scrollHeight, clientHeight: gridArea.clientHeight } : null,
        terminalBody: terminalBody ? { scrollTop: terminalBody.scrollTop, scrollHeight: terminalBody.scrollHeight, clientHeight: terminalBody.clientHeight } : null,
        docEl: typeof document !== "undefined" ? { scrollTop: document.documentElement.scrollTop, scrollHeight: document.documentElement.scrollHeight } : null,
        body: typeof document !== "undefined" ? { scrollTop: document.body.scrollTop, scrollHeight: document.body.scrollHeight } : null,
        tapeTextLen: tapeStream ? tapeStream.textContent?.length ?? 0 : 0,
      };
      fetch("http://127.0.0.1:7928/ingest/3da76906-48e1-4cba-af71-0b7fc1ab7982", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "62a2fc" }, body: JSON.stringify({ sessionId: "62a2fc", location: "NewsWorkspace.tsx:tape-interval-before", message: "scroll before tape tick", data: before, timestamp: Date.now(), hypothesisId: "A" }) }).catch(() => {});
      // #endregion
      advanceHeadlineTape(1);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // #region agent log
          const ws = document.querySelector<HTMLElement>(".wv-news-workspace");
          const ga = document.querySelector<HTMLElement>(".wv-news-grid-area");
          const tb = document.querySelector<HTMLElement>(".wv-news-terminal-body");
          const tapeStreamAfter = document.querySelector<HTMLElement>(".wv-news-tape-stream");
          const after = {
            workspace: ws ? { scrollTop: ws.scrollTop, scrollHeight: ws.scrollHeight, clientHeight: ws.clientHeight } : null,
            gridArea: ga ? { scrollTop: ga.scrollTop, scrollHeight: ga.scrollHeight, clientHeight: ga.clientHeight } : null,
            terminalBody: tb ? { scrollTop: tb.scrollTop, scrollHeight: tb.scrollHeight, clientHeight: tb.clientHeight } : null,
            docEl: typeof document !== "undefined" ? { scrollTop: document.documentElement.scrollTop, scrollHeight: document.documentElement.scrollHeight } : null,
            body: typeof document !== "undefined" ? { scrollTop: document.body.scrollTop, scrollHeight: document.body.scrollHeight } : null,
            tapeTextLen: tapeStreamAfter ? tapeStreamAfter.textContent?.length ?? 0 : 0,
            cursor: useWorldViewStore.getState().news.headlineTape.cursor,
          };
          fetch("http://127.0.0.1:7928/ingest/3da76906-48e1-4cba-af71-0b7fc1ab7982", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "62a2fc" }, body: JSON.stringify({ sessionId: "62a2fc", location: "NewsWorkspace.tsx:tape-interval-after", message: "scroll after tape tick", data: after, timestamp: Date.now(), hypothesisId: "B" }) }).catch(() => {});
          // #endregion
        });
      });
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
    // #region agent log
    const workspace = document.querySelector<HTMLElement>(".wv-news-workspace");
    const gridArea = document.querySelector<HTMLElement>(".wv-news-grid-area");
    const terminalBody = document.querySelector<HTMLElement>(".wv-news-terminal-body");
    const scrollState = {
      workspace: workspace ? { scrollTop: workspace.scrollTop, scrollHeight: workspace.scrollHeight } : null,
      gridArea: gridArea ? { scrollTop: gridArea.scrollTop, scrollHeight: gridArea.scrollHeight } : null,
      terminalBody: terminalBody ? { scrollTop: terminalBody.scrollTop, scrollHeight: terminalBody.scrollHeight } : null,
      docEl: typeof document !== "undefined" ? document.documentElement.scrollTop : null,
      body: typeof document !== "undefined" ? document.body.scrollTop : null,
    };
    fetch("http://127.0.0.1:7928/ingest/3da76906-48e1-4cba-af71-0b7fc1ab7982", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "62a2fc" }, body: JSON.stringify({ sessionId: "62a2fc", location: "NewsWorkspace.tsx:on-cursor-change", message: "scroll when headlineTape.cursor effect ran", data: { cursor: news.headlineTape.cursor, scrollState }, timestamp: Date.now(), hypothesisId: "D" }) }).catch(() => {});
    // #endregion
  }, [news.headlineTape.cursor]);

  useEffect(() => {
    syncTerminalOrder(terminalItems);
  }, [terminalItems, syncTerminalOrder]);

  useEffect(() => {
    if (dashboardView !== "news") return;
    const id = setInterval(() => {
      const visibleIds = new Set(terminalItemsRef.current.map((item) => item.id));
      if (!visibleIds.size) return;
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

      if (!changed) {
        const visibleInOrder = terminalOrderRef.current.filter((id) => visibleIds.has(id));
        if (visibleInOrder.length > 1) {
          const first = visibleInOrder[0];
          terminalOrderRef.current = [
            ...terminalOrderRef.current.filter((id) => id !== first),
            first,
          ];
          changed = true;
        }
      }

      if (changed) {
        setTerminalVersion((v) => v + 1);
      }
    }, NEWS_TERMINAL_TICK_MS);
    return () => clearInterval(id);
  }, [dashboardView]);

  useEffect(() => {
    if (!panelMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!(event.target instanceof HTMLElement)) return;
      if (event.target.closest(".wv-news-toolbar-panels")) return;
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
    if (dashboardView !== "news") return;
    if (!news.video.autoRotateEnabled || news.video.autoRotatePaused) return;
    if (!liveStreams.length) return;
    const id = setInterval(() => {
      const currentIdx = liveStreams.findIndex((item) => item.videoId === news.video.selectedVideoId);
      const next = liveStreams[(currentIdx + 1) % liveStreams.length] ?? liveStreams[0];
      setNewsVideoState({
        selectedVideoId: next.videoId,
        selectedChannelId: next.channelId,
        lastRotateAt: Date.now(),
      });
    }, Math.max(1, news.video.autoRotateMinutes) * 60_000);
    return () => clearInterval(id);
  }, [
    dashboardView,
    news.video.autoRotateEnabled,
    news.video.autoRotatePaused,
    news.video.autoRotateMinutes,
    news.video.selectedVideoId,
    liveStreams,
    setNewsVideoState,
  ]);

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
          `/api/news/suggest?q=${encodeURIComponent(q)}&limit=8`
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
        setSuggestions([...fromSaved, ...fromIndex].slice(0, 8));
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [dashboardView, searchInputDraft, news.savedSearches]);

  useEffect(() => {
    setSearchInputDraft(news.query);
  }, [news.query]);

  useEffect(() => {
    if (dashboardView !== "news") return;
    if (!news.alerts.length) return;
    const id = setInterval(async () => {
      const alerts = news.alerts.filter((item) => item.enabled).slice(0, 8);
      for (const alert of alerts) {
        try {
          const payload = await fetchJson<SearchRouteResult>(
            `/api/news/search?q=${encodeURIComponent(alert.query)}&limit=60`
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
        } catch {
          // suppress noisy alert errors
        }
      }
    }, NEWS_REFRESH_MS);
    return () => clearInterval(id);
  }, [dashboardView, news.alerts, upsertNewsAlert]);

  useEffect(() => {
    if (dashboardView !== "news") return;
    if (!selectedItem) {
      setRelatedItems([]);
      setTimeline([]);
      return;
    }
    const query = [selectedItem.entity, selectedItem.placeName, selectedItem.headline.split(/\s+/g).slice(0, 4).join(" ")]
      .filter(Boolean)
      .join(" ");
    Promise.all([
      fetchJson<{ articles?: GdeltArticle[] }>(`/api/news/gdelt-context?q=${encodeURIComponent(query)}`),
      fetchJson<{ timeline?: Array<{ date: string; value: number }> }>(
        `/api/news/gdelt-timeline?q=${encodeURIComponent(query)}&timespan=7d`
      ),
    ])
      .then(([ctx, tl]) => {
        setRelatedItems((ctx.articles ?? []).slice(0, 8));
        setTimeline(tl.timeline ?? []);
      })
      .catch(() => {
        setRelatedItems([]);
        setTimeline([]);
      });
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
        const marker = news.markers.find((entry) => entry.articleId === item.id);
        setHighlightMarker(marker?.id ?? null);
        return;
      }
      if (event.key.toLowerCase() === "g") {
        event.preventDefault();
        useWorldViewStore.getState().setNewsPanelFocus("news-globe");
        return;
      }
      if (event.key.toLowerCase() === "v") {
        event.preventDefault();
        setNewsPanelVisibility("news-video", true);
        useWorldViewStore.getState().setNewsPanelFocus("news-video");
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

  const tapeItem = terminalItems.length
    ? terminalItems[((news.headlineTape.cursor % terminalItems.length) + terminalItems.length) % terminalItems.length]
    : null;

  const lockHeaderProps = (panelId: string) => ({
    locked: news.panelLocks[panelId] === true,
    onToggleLock: () => setNewsPanelLock(panelId, !(news.panelLocks[panelId] === true)),
  });

  const panelNodes = [
    {
      id: "news-terminal",
      node: (
        <Panel panelId="news-terminal" workspace="news">
          <PanelHeader
            title="TERMINAL FEED"
            subtitle="TIME | SOURCE | ENTITY | REGION | HEADLINE | SCORE"
            {...lockHeaderProps("news-terminal")}
            controls={
              <PanelControls
                onRefresh={() => void runSearch("manual")}
                loading={loading}
                onPin={() => setHeadlineTape({ enabled: !news.headlineTape.enabled })}
              />
            }
          />
          <PanelBody className="wv-news-terminal-body">
            <div className="wv-news-category-tabs">
              <button type="button" className={activeCategory === "all" ? "is-active" : ""} onClick={() => setActiveCategory("all")}>
                All
              </button>
              {CATEGORY_TABS.map((cat) => (
                <button key={cat} type="button" className={activeCategory === cat ? "is-active" : ""} onClick={() => setActiveCategory(cat)}>
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
            {news.headlineTape.enabled ? (
              <div className="wv-news-tape">
                <div className="wv-news-tape-stream">
                  {tapeItem ? `[${formatShortTime(tapeItem.publishedAt)}] ${tapeItem.source} ${tapeItem.headline}` : "No headlines"}
                </div>
                <div className="wv-news-tape-actions">
                  <button type="button" onClick={() => setHeadlineTape({ paused: !news.headlineTape.paused })}>
                    {news.headlineTape.paused ? "RESUME" : "PAUSE"}
                  </button>
                  <button type="button" onClick={() => advanceHeadlineTape(1)}>STEP</button>
                </div>
              </div>
            ) : null}
            <table className="wv-news-terminal-table">
              <thead>
                <tr>
                  <th scope="col">TIME</th>
                  <th scope="col">SOURCE</th>
                  <th scope="col">ENTITY</th>
                  <th scope="col">REGION</th>
                  <th scope="col">HEADLINE</th>
                  <th scope="col">SCORE</th>
                </tr>
              </thead>
              <tbody>
                {terminalItems.slice(0, 180).map((item, idx) => (
                  <tr
                    key={item.id}
                    className={item.id === selectedItem?.id ? "is-selected" : ""}
                    onClick={() => setSelectedRow(idx)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setContextItem(item);
                    }}
                  >
                    <td>{formatShortTime(item.publishedAt)}</td>
                    <td>{item.source}</td>
                    <td>{item.entity ?? "--"}</td>
                    <td>{item.region ?? item.country ?? item.placeName ?? "--"}</td>
                    <td>{item.headline}</td>
                    <td>{Math.round(item.score)}</td>
                  </tr>
                ))}
                {!terminalItems.length ? (
                  <tr>
                    <td colSpan={6} className="wv-news-empty">
                      {news.queryState.lastEmptyReason ?? "No results for current filters. Try `news time:24h`."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </PanelBody>
          <PanelFooter
            source="NEWS SEARCH"
            updatedAt={news.lastUpdated}
            health={
              newsBackendHealth.search === "degraded"
                ? "stale"
                : newsBackendHealth.search === "idle"
                  ? "ok"
                  : newsBackendHealth.search ?? "ok"
            }
            message={`${terminalItems.length} rows`}
          />
        </Panel>
      ),
    },
    {
      id: "news-story",
      node: (
        <Panel panelId="news-story" workspace="news">
          <PanelHeader
            title="STORY VIEWER"
            subtitle="Snippet, related coverage, where + timeline"
            {...lockHeaderProps("news-story")}
            controls={<PanelControls />}
          />
          <PanelBody className="wv-news-story-body">
            {selectedItem ? (
              <>
                <h4>{selectedItem.headline}</h4>
                <div className="wv-news-story-meta">
                  <span>{selectedItem.source}</span>
                  <span>{formatUtc(selectedItem.publishedAt)}</span>
                  <span>{selectedItem.domain}</span>
                </div>
                <p>{selectedItem.snippet || "No snippet available from source feed."}</p>
                <div className="wv-news-provenance">
                  <span>headline:{selectedItem.provenance.headlineSource}</span>
                  <span>coords:{selectedItem.provenance.coordsSource}</span>
                  <span>entity:{selectedItem.provenance.entitySource}</span>
                  <span>conf:{Math.round(selectedItem.provenance.confidence * 100)}%</span>
                </div>
                <div className="wv-news-story-actions">
                  <a href={selectedItem.url} target="_blank" rel="noreferrer">OPEN SOURCE</a>
                  <button
                    type="button"
                    onClick={() => {
                      const marker = news.markers.find((entry) => entry.articleId === selectedItem.id);
                      setHighlightMarker(marker?.id ?? null);
                    }}
                  >
                    HIGHLIGHT MARKER
                  </button>
                </div>
                <div className="wv-news-where">
                  <div className="wv-news-section-title">Where</div>
                  <div>
                    {Number.isFinite(selectedItem.lat) && Number.isFinite(selectedItem.lon)
                      ? `${selectedItem.placeName ?? "Unknown"} (${(selectedItem.lat as number).toFixed(4)}, ${(selectedItem.lon as number).toFixed(4)})`
                      : "No coordinates available"}
                  </div>
                  <div>Source: {selectedItem.coordSource ?? "none"}</div>
                </div>
                <div className="wv-news-related">
                  <div className="wv-news-section-title">Related</div>
                  {relatedItems.length ? (
                    <ul>
                      {relatedItems.map((entry) => (
                        <li key={`${entry.url}-${entry.seendate ?? ""}`}>
                          <a href={entry.url} target="_blank" rel="noreferrer">{entry.title || entry.url}</a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div>No related context.</div>
                  )}
                </div>
                <div className="wv-news-timeline">
                  <div className="wv-news-section-title">Timeline (7d)</div>
                  <div className="wv-news-timeline-bars">
                    {timeline.slice(-24).map((point) => (
                      <span key={point.date} title={`${point.date}: ${point.value}`} style={{ height: `${Math.max(8, Math.min(48, point.value * 4))}px` }} />
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="wv-news-empty">Select a story from the feed.</div>
            )}
          </PanelBody>
          <PanelFooter source="GDELT CONTEXT" updatedAt={Date.now()} health="ok" />
        </Panel>
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
          <PanelBody noPadding className="wv-news-globe-body">
            <div className="wv-news-globe-cube">
              <NewsWorldMap />
            </div>
          </PanelBody>
          <PanelFooter source="NEWS MAP" updatedAt={Date.now()} health={newsBackendHealth.search === "loading" ? "loading" : Object.values(newsBackendHealth).some((v) => v === "degraded") ? "stale" : "ok"} message={newsGlobeFooterMessage} />
        </Panel>
      ),
    },
    {
      id: "news-video",
      node: (
        <Panel panelId="news-video" workspace="news">
          <PanelHeader
            title="LIVE VIDEO"
            subtitle="YouTube live list + embedded player"
            {...lockHeaderProps("news-video")}
            controls={<PanelControls onRefresh={() => void refreshVideo()} loading={videoLoading} refreshText="LIVE NOW" />}
          />
          <PanelBody className="wv-news-video-body">
            {news.video.selectedVideoId ? (
              <iframe
                className="wv-news-video-frame"
                src={`https://www.youtube.com/embed/${news.video.selectedVideoId}?autoplay=0&rel=0`}
                title="Live News Video"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div className="wv-news-empty">Select a live stream or paste URL.</div>
            )}
            <div className="wv-news-video-channel-filter">
              <label htmlFor="video-channel-filter">Source</label>
              <select
                id="video-channel-filter"
                value={news.video.selectedChannelFilter ?? ""}
                onChange={(event) =>
                  setNewsVideoState({
                    selectedChannelFilter: event.target.value || null,
                  })
                }
              >
                <option value="">All sources</option>
                {videoChannels.map((channel) => (
                  <option key={channel.channelId} value={channel.channelId}>
                    {channel.channelName} ({channel.liveCount ? `LIVE ${channel.liveCount}` : `RECENT ${channel.recentCount}`})
                  </option>
                ))}
              </select>
            </div>
            <div className="wv-news-video-tabs" role="tablist" aria-label="Live video sources">
              {videoTabItems.map((stream) => (
                <button
                  key={`tab-${stream.channelId}-${stream.videoId}`}
                  type="button"
                  role="tab"
                  aria-selected={news.video.selectedVideoId === stream.videoId}
                  className={news.video.selectedVideoId === stream.videoId ? "is-active" : ""}
                  onClick={() => setNewsVideoState({ selectedVideoId: stream.videoId, selectedChannelId: stream.channelId, manualUrl: "" })}
                >
                  <span>{stream.channelName}</span>
                  <span className={`wv-tab-state ${stream.status === "live" ? "is-live" : "is-recent"}`}>
                    {stream.status === "live" ? "LIVE" : "RECENT"}
                  </span>
                </button>
              ))}
              {!videoTabItems.length ? <div className="wv-news-empty">No streams discovered for current source filter.</div> : null}
            </div>
            {news.video.selectedVideoId ? (
              <div className="wv-news-video-selected-title">
                {(filteredLiveStreams.find((stream) => stream.videoId === news.video.selectedVideoId) ?? liveStreams.find((stream) => stream.videoId === news.video.selectedVideoId))?.title ?? "Selected stream"}
              </div>
            ) : null}
            <div className="wv-news-video-manual">
              <input
                value={news.video.manualUrl}
                placeholder="Paste YouTube URL or video ID"
                onChange={(event) => setNewsVideoState({ manualUrl: event.target.value })}
              />
              <button
                type="button"
                onClick={() => {
                  const videoId = parseVideoId(news.video.manualUrl);
                  if (!videoId) {
                    setNewsUiState({ statusLine: "Invalid YouTube URL/video ID." });
                    return;
                  }
                  setNewsVideoState({ selectedVideoId: videoId });
                  setNewsUiState({ statusLine: `Opened manual video ${videoId}.` });
                }}
              >
                OPEN
              </button>
            </div>
            <div className="wv-news-video-tv">
              <Toggle label="News TV" checked={news.video.autoRotateEnabled} onChange={(checked) => setNewsVideoState({ autoRotateEnabled: checked })} />
              <Toggle label="Pause Rotate" checked={news.video.autoRotatePaused} onChange={(checked) => setNewsVideoState({ autoRotatePaused: checked })} />
              <select value={news.video.autoRotateMinutes} onChange={(event) => setNewsVideoState({ autoRotateMinutes: Number(event.target.value) || 10 })}>
                {ROTATE_INTERVAL_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>{minutes}m</option>
                ))}
              </select>
            </div>
          </PanelBody>
          <PanelFooter
            source="YOUTUBE"
            updatedAt={Date.now()}
            health={videoKeyMissing ? "stale" : newsBackendHealth.youtube === "degraded" ? "stale" : "ok"}
            message={
              videoKeyMissing
                ? "YOUTUBE_API_KEY missing; manual mode enabled."
                : `${liveStreams.filter((item) => item.status === "live").length} live / ${liveStreams.length} total`
            }
          />
        </Panel>
      ),
    },
    {
      id: "news-watchlist",
      node: (
        <Panel panelId="news-watchlist" workspace="news">
          <PanelHeader
            title="WATCHLIST"
            subtitle="Tracked items and alert rules"
            {...lockHeaderProps("news-watchlist")}
            controls={<PanelControls />}
          />
          <PanelBody className="wv-news-watchlist-body">
            <div className="wv-wl-group">
              <WatchlistChipSection
                label="Tickers"
                items={news.watchlist.tickers}
                placeholder="No tickers tracked"
                transform={(v) => v.toUpperCase()}
                onAdd={(v) =>
                  setNewsWatchlist({
                    tickers: Array.from(new Set([...news.watchlist.tickers, v])),
                  })
                }
                onRemove={(v) =>
                  setNewsWatchlist({
                    tickers: news.watchlist.tickers.filter((t) => t !== v),
                  })
                }
              />
              <WatchlistChipSection
                label="Topics"
                items={news.watchlist.topics}
                placeholder="No topics tracked"
                onAdd={(v) =>
                  setNewsWatchlist({
                    topics: Array.from(new Set([...news.watchlist.topics, v])),
                  })
                }
                onRemove={(v) =>
                  setNewsWatchlist({
                    topics: news.watchlist.topics.filter((t) => t !== v),
                  })
                }
              />
              <WatchlistChipSection
                label="Regions"
                items={news.watchlist.regions}
                placeholder="No regions tracked"
                onAdd={(v) =>
                  setNewsWatchlist({
                    regions: Array.from(new Set([...news.watchlist.regions, v])),
                  })
                }
                onRemove={(v) =>
                  setNewsWatchlist({
                    regions: news.watchlist.regions.filter((t) => t !== v),
                  })
                }
              />
            </div>

            <div className="wv-wl-divider">
              <span>ALERTS</span>
            </div>

            <div className="wv-wl-alerts">
              <div className="wv-wl-alert-create">
                <button
                  type="button"
                  onClick={() =>
                    upsertNewsAlert({
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
                    })
                  }
                >
                  + NEW ALERT
                </button>
                <span className="wv-wl-alert-hint">from current query</span>
              </div>

              {news.alerts.length === 0 && (
                <div className="wv-wl-empty">No alerts configured. Press A or click + NEW ALERT.</div>
              )}

              {news.alerts.map((alert) => (
                <div key={alert.id} className="wv-wl-alert-row">
                  <div className="wv-wl-alert-header">
                    <span className="wv-wl-alert-name">{alert.name}</span>
                    {alert.unreadCount > 0 && (
                      <span className="wv-wl-alert-badge">{alert.unreadCount}</span>
                    )}
                  </div>
                  <div className="wv-wl-alert-query">{alert.query}</div>
                  <div className="wv-wl-alert-controls">
                    <Toggle label="Enabled" checked={alert.enabled} onChange={(checked) => upsertNewsAlert({ ...alert, enabled: checked })} />
                    <Toggle label="Sound" checked={alert.soundEnabled} onChange={(checked) => upsertNewsAlert({ ...alert, soundEnabled: checked })} />
                    <button type="button" onClick={() => ackNewsAlert(alert.id)}>ACK</button>
                  </div>
                </div>
              ))}
            </div>
          </PanelBody>
          <PanelFooter
            source="WATCHLIST"
            updatedAt={Date.now()}
            health="ok"
            message={`${news.watchlist.tickers.length + news.watchlist.topics.length + news.watchlist.regions.length} items · ${news.alerts.length} alerts`}
          />
        </Panel>
      ),
    },
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
    <div className={`wv-news-workspace ${embedded ? "is-embedded" : ""}`.trim()}>
      <div className="wv-news-toolbar">
        <div className="wv-toolbar-status">
          {loading ? "SEARCHING..." : `${filteredItems.length} STORIES`}
          {news.lastUpdated ? ` | UPDATED ${formatUtc(news.lastUpdated)}` : ""}
          {news.ui.statusLine ? ` | ${news.ui.statusLine}` : ""}
        </div>
        <div className="wv-toolbar-actions">
          <button type="button" onClick={() => resetNewsLayout()}>RESET LAYOUT</button>
          <button type="button" onClick={() => setNewsUiState({ showHelpHints: !news.ui.showHelpHints })}>
            {news.ui.showHelpHints ? "HIDE HINTS" : "SHOW HINTS"}
          </button>
          <div className="wv-news-toolbar-panels">
            <button type="button" onClick={() => setPanelMenuOpen((prev) => !prev)}>PANELS</button>
            {panelMenuOpen ? (
              <div className="wv-news-panel-popover">
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
          {news.ui.showHelpHints ? (
            <span className="wv-news-hotkeys" title="Keyboard shortcuts (when not typing)">
              <kbd>/</kbd> focus search · <kbd>j</kbd>/<kbd>k</kbd> move · <kbd>Enter</kbd> open story · <kbd>g</kbd> globe · <kbd>v</kbd> video · <kbd>a</kbd> new alert
            </span>
          ) : null}
        </div>
      </div>

      <div className="wv-news-topbar">
        <div className="wv-news-topbar-main">
          <div className="wv-news-query-row">
            <input
              type="text"
              className="wv-news-search-input"
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
              placeholder="sym:NVDA merger time:7d near:37.77,-122.4,500"
            />
            <button
              type="button"
              onClick={() => {
                const nextQuery = searchInputDraft.trim();
                executeSearch(nextQuery);
              }}
            >
              RUN QUERY
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
              SAVE
            </button>
            <button
              type="button"
              className="wv-topbar-toggle"
              onClick={() => setTopbarExpanded((prev) => !prev)}
              title={topbarExpanded ? "Hide presets & saved searches" : "Show presets & saved searches"}
            >
              {topbarExpanded ? "LESS" : "MORE"}
            </button>
          </div>
          {suggestOpen && suggestions.length ? (
            <div className="wv-news-suggest-list">
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
          <div className="wv-news-query-hints">
            {QUERY_HINT_ITEMS.map((item) => (
              <button
                key={item.chip}
                type="button"
                className="wv-hint-chip"
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
                <span className="wv-hint-chip-label">{item.hint}</span>
              </button>
            ))}
          </div>
        </div>
        {topbarExpanded ? (
          <div className="wv-news-topbar-expanded">
            <div className="wv-news-presets">
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
              <div className="wv-news-facet-grid">
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
          <div className="wv-news-search-overlay">
            <div className="wv-news-search-overlay-header">
              <span className="wv-news-search-overlay-title">
                SEARCH RESULTS — {news.query || "all"} — {terminalItems.length} stories
              </span>
              <button type="button" onClick={() => setSearchResultsOpen(false)}>CLOSE</button>
            </div>
            <div className="wv-news-category-tabs">
              <button type="button" className={activeCategory === "all" ? "is-active" : ""} onClick={() => setActiveCategory("all")}>
                All
              </button>
              {CATEGORY_TABS.map((cat) => (
                <button key={cat} type="button" className={activeCategory === cat ? "is-active" : ""} onClick={() => setActiveCategory(cat)}>
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
            <div className="wv-news-search-overlay-body">
              <table className="wv-news-terminal-table">
                <thead>
                  <tr>
                    <th scope="col">TIME</th>
                    <th scope="col">SOURCE</th>
                    <th scope="col">ENTITY</th>
                    <th scope="col">REGION</th>
                    <th scope="col">HEADLINE</th>
                    <th scope="col">SCORE</th>
                  </tr>
                </thead>
                <tbody>
                  {terminalItems.slice(0, 180).map((item, idx) => (
                    <tr
                      key={item.id}
                      className={item.id === selectedItem?.id ? "is-selected" : ""}
                      onClick={() => {
                        setSelectedRow(idx);
                        setSearchResultsOpen(false);
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setContextItem(item);
                      }}
                    >
                      <td>{formatShortTime(item.publishedAt)}</td>
                      <td>{item.source}</td>
                      <td>{item.entity ?? "--"}</td>
                      <td>{item.region ?? item.country ?? item.placeName ?? "--"}</td>
                      <td>{item.headline}</td>
                      <td>{Math.round(item.score)}</td>
                    </tr>
                  ))}
                  {!terminalItems.length ? (
                    <tr>
                      <td colSpan={6} className="wv-news-empty">
                        {news.queryState.lastEmptyReason ?? "No results for current filters."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      <div className="wv-news-grid-area">
        <NewsDraggableGrid panels={panelNodes.filter((panel) => news.panelVisibility[panel.id] !== false)} />
      </div>

      {contextItem ? (
        <div className="wv-news-context-menu" role="menu" aria-label="row actions">
          <button type="button" onClick={() => { window.open(contextItem.url, "_blank", "noopener,noreferrer"); setContextItem(null); }}>
            Open Link
          </button>
          <button type="button" onClick={() => { void navigator.clipboard.writeText(contextItem.url); setContextItem(null); }}>
            Copy Link
          </button>
          <button type="button" onClick={() => { useWorldViewStore.getState().muteNewsSource(contextItem.source, true); setContextItem(null); }}>
            Mute Source
          </button>
          <button
            type="button"
            onClick={() => {
              if (contextItem.entity) {
                setNewsWatchlist({
                  tickers: Array.from(new Set([...news.watchlist.tickers, contextItem.entity.toUpperCase()])),
                });
              } else {
                const token = contextItem.headline.split(/\s+/g).slice(0, 2).join(" ");
                setNewsWatchlist({
                  topics: Array.from(new Set([...news.watchlist.topics, token])),
                });
              }
              setContextItem(null);
            }}
          >
            Add To Watchlist
          </button>
          <button
            type="button"
            onClick={() => {
              upsertNewsAlert({
                id: `alert-${Date.now().toString(36)}`,
                name: contextItem.headline.slice(0, 42),
                query: contextItem.entity ? `sym:${contextItem.entity}` : contextItem.headline.slice(0, 80),
                threshold: 1,
                soundEnabled: false,
                enabled: true,
                lastChecked: 0,
                hitCount: 0,
                unreadCount: 0,
                seenFingerprints: [],
              });
              setContextItem(null);
            }}
          >
            Create Alert
          </button>
          <button type="button" onClick={() => setContextItem(null)}>Close</button>
        </div>
      ) : null}
    </div>
  );
}
