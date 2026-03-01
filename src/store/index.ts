import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";
import type {
  Scene,
  CctvCamera,
  EntityData,
  CameraCalibration,
  Flight,
  Earthquake,
  PropagatedSat,
  Satellite,
} from "../lib/providers/types";
import type {
  DashboardDensity,
  DashboardLayouts,
  DashboardState,
  FeedLogItem,
  LiveDataState,
  TablePreference,
} from "../lib/dashboard/types";
import { DEFAULT_PANEL_IDS, DEFAULT_PANEL_LAYOUTS } from "../lib/dashboard/types";
import type {
  AlertRuleState,
  GeoMarker,
  NewsArticle,
  NewsCameraBounds,
  NewsFacetState,
  NewsLayoutPreset,
  NewsThread,
  NewsVideoState,
  NewsWatchlist,
  QueryAST,
  SavedSearch,
} from "../lib/news/types";

interface LayerState {
  satellites: boolean;
  flights: boolean;
  military: boolean;
  earthquakes: boolean;
  traffic: boolean;
  cctv: boolean;
  news: boolean;
}

interface FiltersState {
  minMagnitude: number;
  maxMagnitude: number;
  minAltM: number;
  maxAltM: number;
  onGroundVisible: boolean;
}

interface UiState {
  stylePreset: "normal" | "crt" | "nvg" | "flir";
  detectMode: "off" | "sparse" | "full";
  showBloom: boolean;
  cleanMode: boolean;
  showDebug: boolean;
  leftTab: "layers" | "scenes" | "cctv";
  crtDistortion: number;
  crtInstability: number;
  nvgBrightness: number;
  flirContrast: number;
  sharpen: boolean;
}

interface SelectionState {
  selectedEntity: EntityData | null;
  pinnedEntities: EntityData[];
  trackingId: string | null;
  historyTrail: [number, number, number][];
  trackedFlightId: string | null;
  flightPath: [number, number, number][];
}

interface CctvFloatingState {
  open: boolean;
  camera: CctvCamera | null;
}

interface CctvState {
  cameras: CctvCamera[];
  selectedCameraId: string | null;
  calibrations: Record<string, CameraCalibration>;
  floating: CctvFloatingState;
}

interface DebugState {
  fps: number;
  entityCount: number;
  memoryMB: number;
}

type NewsBackendHealth = "idle" | "loading" | "ok" | "degraded" | "error";

interface NewsState {
  query: string;
  queryAst: QueryAST;
  queryState: {
    lastFallbackApplied: string[];
    lastEmptyReason: string | null;
  };
  feedItems: NewsArticle[];
  threads: NewsThread[];
  markers: GeoMarker[];
  facets: NewsFacetState;
  selectedStoryId: string | null;
  selectedCountry: string | null;
  highlightedMarkerId: string | null;
  watchlist: NewsWatchlist;
  savedSearches: SavedSearch[];
  alerts: AlertRuleState[];
  mutedSources: string[];
  panelLayouts: DashboardLayouts;
  panelVisibility: Record<string, boolean>;
  panelLocks: Record<string, boolean>;
  panelZOrder: string[];
  panelFocusId: string | null;
  layoutPreset: NewsLayoutPreset;
  ui: {
    compactMode: boolean;
    focusedPanel: string | null;
    statusLine: string;
    showHelpHints: boolean;
  };
  video: NewsVideoState;
  searchInView: boolean;
  cameraBounds: NewsCameraBounds | null;
  headlineTape: {
    enabled: boolean;
    paused: boolean;
    cursor: number;
  };
  backendHealth: Record<string, NewsBackendHealth>;
  lastUpdated: number | null;
}

interface WorldViewStore {
  layers: LayerState;
  filters: FiltersState;
  ui: UiState;
  selection: SelectionState;
  cctv: CctvState;
  scenes: Scene[];
  savedScenes: Scene[];
  currentSceneIdx: number;
  debug: DebugState;
  dashboard: DashboardState;
  liveData: LiveDataState;
  news: NewsState;

  toggleLayer(name: keyof LayerState): void;
  setStylePreset(preset: UiState["stylePreset"]): void;
  setDetectMode(mode: UiState["detectMode"]): void;
  setUi(partial: Partial<UiState>): void;
  setFilters(partial: Partial<FiltersState>): void;

  selectEntity(entity: EntityData | null): void;
  pinEntity(entity: EntityData): void;
  unpinEntity(id: string): void;
  setTrackingId(id: string | null): void;
  setHistoryTrail(positions: [number, number, number][]): void;
  setTrackedFlightId(id: string | null): void;
  setFlightPath(path: [number, number, number][]): void;

  setScenes(scenes: Scene[]): void;
  gotoScene(idx: number): void;
  saveScene(scene: Scene): void;
  deleteScene(name: string): void;

  setCameras(cameras: CctvCamera[]): void;
  selectCamera(id: string | null): void;
  updateCalibration(id: string, cal: Partial<CameraCalibration>): void;
  openCctvFloating(camera: CctvCamera): void;
  closeCctvFloating(): void;

  setDebug(partial: Partial<DebugState>): void;

  setActiveView(view: DashboardState["activeView"]): void;
  setDensity(density: DashboardDensity): void;
  setDashboard(partial: Partial<DashboardState>): void;
  setPanelLayouts(layouts: DashboardState["panelLayouts"]): void;
  resetPanelLayouts(): void;
  setPanelVisibility(panelId: string, visible: boolean): void;
  setPanelLock(panelId: string, locked: boolean): void;
  setPanelFocus(panelId: string | null): void;
  bringPanelToFront(panelId: string): void;
  setTablePreference(tableId: string, partial: Partial<TablePreference>): void;
  openInspector(entity: EntityData, pinned?: boolean): void;
  closeInspector(force?: boolean): void;
  setInspectorTab(tab: DashboardState["inspector"]["tab"]): void;
  setInspectorPinned(pinned: boolean): void;
  setInspectorSplitView(splitView: boolean): void;
  setInspectorNote(entityId: string, note: string): void;
  clearSelectionContext(): void;
  setHotkeysEnabled(enabled: boolean): void;
  bumpRefreshTick(): void;

  setLiveData(partial: Partial<LiveDataState>): void;
  setLiveFlights(flights: Flight[]): void;
  setLiveMilitary(flights: Flight[]): void;
  setLiveEarthquakes(earthquakes: Earthquake[]): void;
  setLiveSatellites(satellites: PropagatedSat[]): void;
  setSatelliteCatalog(satellites: Satellite[]): void;
  setLiveCctv(cctv: CctvCamera[]): void;
  setLiveScenes(scenes: Scene[]): void;
  setFeedHealth(source: string, health: LiveDataState["health"][string]): void;
  markFeedUpdated(source: string, ts?: number): void;
  pushFeedLog(item: Omit<FeedLogItem, "id" | "ts"> & { ts?: number }): void;
  appendTrendSnapshot(snapshot?: {
    entityCount?: number;
    flightCount?: number;
    militaryCount?: number;
    quakeAvgMag?: number;
  }): void;

  setNewsQuery(query: string): void;
  setNewsQueryAst(ast: QueryAST): void;
  setNewsQueryState(partial: Partial<NewsState["queryState"]>): void;
  setNewsUiState(partial: Partial<NewsState["ui"]>): void;
  setNewsFeedItems(items: NewsArticle[]): void;
  setNewsThreads(threads: NewsThread[]): void;
  setNewsMarkers(markers: GeoMarker[]): void;
  setNewsFacets(facets: NewsFacetState): void;
  setSelectedStory(id: string | null): void;
  setSelectedCountry(country: string | null): void;
  setHighlightMarker(id: string | null): void;
  setSearchInView(enabled: boolean): void;
  setNewsCameraBounds(bounds: NewsCameraBounds | null): void;
  setNewsLayoutPreset(preset: NewsLayoutPreset): void;
  resetNewsLayout(): void;
  setNewsPanelLayouts(layouts: DashboardLayouts): void;
  setNewsPanelVisibility(panelId: string, visible: boolean): void;
  setNewsPanelLock(panelId: string, locked: boolean): void;
  setNewsPanelFocus(panelId: string | null): void;
  bringNewsPanelToFront(panelId: string): void;
  setNewsWatchlist(partial: Partial<NewsWatchlist>): void;
  muteNewsSource(source: string, muted?: boolean): void;
  saveNewsSearch(search: SavedSearch): void;
  deleteNewsSearch(id: string): void;
  upsertNewsAlert(alert: AlertRuleState): void;
  ackNewsAlert(id: string): void;
  setNewsVideoState(partial: Partial<NewsVideoState>): void;
  setHeadlineTape(partial: Partial<NewsState["headlineTape"]>): void;
  advanceHeadlineTape(step?: number): void;
  setNewsBackendHealth(source: string, health: NewsBackendHealth): void;
  setNewsLastUpdated(ts?: number): void;
  clearNewsTransient(): void;
}

const DASHBOARD_DENSITY_DEFAULT: DashboardDensity = "ultra";
const DASHBOARD_LAYOUT_COLS: Record<keyof DashboardLayouts, number> = {
  lg: 360,
  md: 300,
  sm: 180,
  xs: 60,
};
const LEGACY_DASHBOARD_LAYOUT_COLS: Record<keyof DashboardLayouts, number> = {
  lg: 120,
  md: 100,
  sm: 60,
  xs: 20,
};
const VERY_LEGACY_DASHBOARD_LAYOUT_COLS: Record<keyof DashboardLayouts, number> = {
  lg: 12,
  md: 10,
  sm: 6,
  xs: 2,
};
const MAX_PANEL_GRID_HEIGHT = 360;
const DEFAULT_PANEL_VISIBILITY: Record<string, boolean> = {
  kpi: true,
  "flight-table": true,
  "quake-table": true,
  "sat-list": true,
  feed: true,
};
const DEFAULT_PANEL_LOCKS: Record<string, boolean> = {
  kpi: false,
  "flight-table": false,
  "quake-table": false,
  "sat-list": false,
  feed: false,
};
const DEFAULT_PANEL_ORDER = [...DEFAULT_PANEL_IDS];
const DEFAULT_NEWS_PANEL_IDS = [
  "news-terminal",
  "news-story",
  "news-globe",
  "news-video",
  "news-watchlist",
] as const;
const DEFAULT_NEWS_PANEL_VISIBILITY: Record<string, boolean> = {
  "news-terminal": true,
  "news-story": true,
  "news-globe": true,
  "news-video": true,
  "news-watchlist": true,
};
const DEFAULT_NEWS_PANEL_LOCKS: Record<string, boolean> = {
  "news-terminal": false,
  "news-story": false,
  "news-globe": false,
  "news-video": false,
  "news-watchlist": false,
};
const DEFAULT_NEWS_PANEL_ORDER = [...DEFAULT_NEWS_PANEL_IDS];
const DEFAULT_NEWS_PANEL_LAYOUTS: DashboardLayouts = {
  lg: [
    { i: "news-globe", x: 0, y: 0, w: 120, h: 130, minW: 80, minH: 80 },
    { i: "news-story", x: 120, y: 0, w: 120, h: 120, minW: 80, minH: 84 },
    { i: "news-terminal", x: 240, y: 0, w: 120, h: 80, minW: 100, minH: 64 },
    { i: "news-video", x: 240, y: 80, w: 120, h: 130, minW: 80, minH: 60 },
    { i: "news-watchlist", x: 0, y: 210, w: 360, h: 48, minW: 80, minH: 40 },
  ],
  md: [
    { i: "news-globe", x: 0, y: 0, w: 100, h: 120, minW: 70, minH: 70 },
    { i: "news-story", x: 100, y: 0, w: 100, h: 110, minW: 70, minH: 72 },
    { i: "news-terminal", x: 200, y: 0, w: 100, h: 72, minW: 80, minH: 56 },
    { i: "news-video", x: 200, y: 72, w: 100, h: 118, minW: 70, minH: 56 },
    { i: "news-watchlist", x: 0, y: 190, w: 300, h: 48, minW: 70, minH: 40 },
  ],
  sm: [
    { i: "news-globe", x: 0, y: 0, w: 90, h: 100, minW: 60, minH: 60 },
    { i: "news-story", x: 90, y: 0, w: 90, h: 100, minH: 78 },
    { i: "news-terminal", x: 0, y: 100, w: 90, h: 80, minH: 64 },
    { i: "news-video", x: 0, y: 180, w: 90, h: 122, minH: 56 },
    { i: "news-watchlist", x: 0, y: 302, w: 180, h: 48, minH: 40 },
  ],
  xs: [
    { i: "news-globe", x: 0, y: 0, w: 60, h: 80, minH: 60 },
    { i: "news-terminal", x: 0, y: 80, w: 60, h: 88, minH: 72 },
    { i: "news-video", x: 0, y: 168, w: 60, h: 126, minH: 56 },
    { i: "news-story", x: 0, y: 294, w: 60, h: 100, minH: 72 },
    { i: "news-watchlist", x: 0, y: 394, w: 60, h: 48, minH: 40 },
  ],
};
const GLOBE_CENTRIC_NEWS_LAYOUTS: DashboardLayouts = {
  lg: [
    { i: "news-globe", x: 0, y: 0, w: 150, h: 160, minW: 90, minH: 90 },
    { i: "news-story", x: 150, y: 0, w: 105, h: 120, minW: 80, minH: 60 },
    { i: "news-terminal", x: 255, y: 0, w: 105, h: 80, minW: 80, minH: 64 },
    { i: "news-video", x: 255, y: 80, w: 105, h: 130, minW: 80, minH: 60 },
    { i: "news-watchlist", x: 0, y: 250, w: 360, h: 48, minW: 80, minH: 40 },
  ],
  md: [
    { i: "news-globe", x: 0, y: 0, w: 130, h: 140, minW: 80, minH: 70 },
    { i: "news-story", x: 130, y: 0, w: 85, h: 110, minW: 70, minH: 60 },
    { i: "news-terminal", x: 215, y: 0, w: 85, h: 72, minW: 70, minH: 56 },
    { i: "news-video", x: 215, y: 72, w: 85, h: 118, minW: 70, minH: 60 },
    { i: "news-watchlist", x: 0, y: 220, w: 300, h: 48, minW: 70, minH: 40 },
  ],
  sm: DEFAULT_NEWS_PANEL_LAYOUTS.sm,
  xs: DEFAULT_NEWS_PANEL_LAYOUTS.xs,
};
const SPLIT_NEWS_LAYOUTS: DashboardLayouts = {
  lg: [
    { i: "news-globe", x: 0, y: 0, w: 120, h: 120, minW: 80, minH: 80 },
    { i: "news-terminal", x: 0, y: 120, w: 120, h: 80, minW: 90, minH: 64 },
    { i: "news-video", x: 0, y: 200, w: 120, h: 120, minW: 80, minH: 56 },
    { i: "news-story", x: 120, y: 0, w: 120, h: 200, minW: 90, minH: 84 },
    { i: "news-watchlist", x: 0, y: 320, w: 360, h: 48, minW: 90, minH: 40 },
  ],
  md: [
    { i: "news-globe", x: 0, y: 0, w: 100, h: 110, minW: 70, minH: 70 },
    { i: "news-terminal", x: 0, y: 110, w: 100, h: 72, minW: 80, minH: 56 },
    { i: "news-video", x: 0, y: 182, w: 100, h: 108, minW: 70, minH: 50 },
    { i: "news-story", x: 100, y: 0, w: 100, h: 200, minW: 80, minH: 72 },
    { i: "news-watchlist", x: 0, y: 290, w: 300, h: 48, minW: 80, minH: 40 },
  ],
  sm: DEFAULT_NEWS_PANEL_LAYOUTS.sm,
  xs: DEFAULT_NEWS_PANEL_LAYOUTS.xs,
};
const NEWS_PANEL_LAYOUT_PRESETS: Record<NewsLayoutPreset, DashboardLayouts> = {
  "news-centric": DEFAULT_NEWS_PANEL_LAYOUTS,
  "globe-centric": GLOBE_CENTRIC_NEWS_LAYOUTS,
  split: SPLIT_NEWS_LAYOUTS,
};

function defaultDashboardState(): DashboardState {
  return {
    activeView: "ops",
    density: DASHBOARD_DENSITY_DEFAULT,
    inspector: {
      open: false,
      pinned: false,
      splitView: false,
      tab: "summary",
      entity: null,
      notes: {},
    },
    panelLayouts: DEFAULT_PANEL_LAYOUTS,
    panelVisibility: { ...DEFAULT_PANEL_VISIBILITY },
    panelLocks: { ...DEFAULT_PANEL_LOCKS },
    tablePrefs: {},
    panelFocusId: null,
    panelZOrder: [...DEFAULT_PANEL_ORDER],
    hotkeysEnabled: true,
  };
}

function defaultNewsState(): NewsState {
  return {
    query: "",
    queryAst: { raw: "", freeText: [] },
    queryState: {
      lastFallbackApplied: [],
      lastEmptyReason: null,
    },
    feedItems: [],
    threads: [],
    markers: [],
    facets: {
      sources: [],
      categories: [],
      languages: [],
      regions: [],
      coordAvailability: [],
    },
    selectedStoryId: null,
    selectedCountry: null,
    highlightedMarkerId: null,
    watchlist: {
      tickers: [],
      topics: [],
      regions: [],
      sources: [],
    },
    savedSearches: [],
    alerts: [],
    mutedSources: [],
    panelLayouts: DEFAULT_NEWS_PANEL_LAYOUTS,
    panelVisibility: { ...DEFAULT_NEWS_PANEL_VISIBILITY },
    panelLocks: { ...DEFAULT_NEWS_PANEL_LOCKS },
    panelZOrder: [...DEFAULT_NEWS_PANEL_ORDER],
    panelFocusId: null,
    layoutPreset: "news-centric",
    ui: {
      compactMode: true,
      focusedPanel: null,
      statusLine: "Ready.",
      showHelpHints: true,
    },
    video: {
      selectedVideoId: null,
      selectedChannelId: null,
      selectedChannelFilter: null,
      manualUrl: "",
      mode: "live_first",
      autoRotateEnabled: false,
      autoRotateMinutes: 10,
      autoRotatePaused: false,
      lastRotateAt: 0,
    },
    searchInView: false,
    cameraBounds: null,
    headlineTape: {
      enabled: false,
      paused: false,
      cursor: 0,
    },
    backendHealth: {
      search: "idle",
      gdelt: "idle",
      rss: "idle",
      sec: "idle",
      wikidata: "idle",
      geo: "idle",
      youtube: "idle",
      nominatim: "idle",
    },
    lastUpdated: null,
  };
}

function defaultLiveDataState(): LiveDataState {
  return {
    flights: [],
    military: [],
    earthquakes: [],
    satellites: [],
    satelliteCatalog: [],
    cctv: [],
    scenes: [],
    lastUpdated: {
      opensky: null,
      military: null,
      earthquakes: null,
      satellites: null,
      cctv: null,
      scenes: null,
    },
    health: {
      opensky: "idle",
      military: "idle",
      earthquakes: "idle",
      satellites: "idle",
      cctv: "idle",
      scenes: "idle",
    },
    trendHistory: {
      timeline: [],
      entityCount: [],
      flightCount: [],
      militaryCount: [],
      quakeAvgMag: [],
    },
    feedLog: [],
    refreshTick: 0,
  };
}

function defaultTablePref(): TablePreference {
  return {
    columnOrder: [],
    columnSizing: {},
    sorting: [],
    filters: [],
    globalFilter: "",
    stickyFirstColumn: false,
  };
}

function sanitizeLayouts(
  input: DashboardLayouts | undefined,
  fallbackLayouts: DashboardLayouts = DEFAULT_PANEL_LAYOUTS
): DashboardLayouts {
  const next = { ...fallbackLayouts } as DashboardLayouts;
  if (!input) return next;

  (Object.keys(DASHBOARD_LAYOUT_COLS) as Array<keyof DashboardLayouts>).forEach((bp) => {
    const cols = DASHBOARD_LAYOUT_COLS[bp];
    const legacyCols = LEGACY_DASHBOARD_LAYOUT_COLS[bp];
    const veryLegacyCols = VERY_LEGACY_DASHBOARD_LAYOUT_COLS[bp];
    const incoming = Array.isArray(input[bp]) ? input[bp] : [];
    const defaults = fallbackLayouts[bp];
    const incomingById = new Map(incoming.map((item) => [item.i, item]));
    const usesVeryLegacyScale =
      incoming.length > 0 &&
      incoming.every((item) => {
        const x = Number(item.x);
        const w = Number(item.w);
        return Number.isFinite(x) && Number.isFinite(w) && x <= veryLegacyCols && w <= veryLegacyCols;
      });
    const usesLegacyScale =
      !usesVeryLegacyScale &&
      incoming.length > 0 &&
      incoming.every((item) => {
        const x = Number(item.x);
        const w = Number(item.w);
        return Number.isFinite(x) && Number.isFinite(w) && x <= legacyCols && w <= legacyCols;
      });

    const legacyScale = usesVeryLegacyScale ? cols / veryLegacyCols : cols / legacyCols;
    const rowScale = usesVeryLegacyScale ? 4 : 3;

    const normalize = <T extends DashboardLayouts[keyof DashboardLayouts][number]>(source: T): T => {
      if (!usesLegacyScale && !usesVeryLegacyScale) return source;

      const scaleSpan = (value: unknown) => {
        const num = Number(value);
        if (!Number.isFinite(num)) return undefined;
        return Math.max(1, Math.round(num * legacyScale));
      };

      const scalePos = (value: unknown) => {
        const num = Number(value);
        if (!Number.isFinite(num)) return undefined;
        return Math.max(0, Math.round(num * legacyScale));
      };

      const scaleHeight = (value: unknown) => {
        const num = Number(value);
        if (!Number.isFinite(num)) return undefined;
        return Math.max(1, Math.round(num * rowScale));
      };

      const scaleY = (value: unknown) => {
        const num = Number(value);
        if (!Number.isFinite(num)) return undefined;
        return Math.max(0, Math.round(num * rowScale));
      };

      return {
        ...source,
        x: scalePos(source.x) ?? source.x,
        y: scaleY(source.y) ?? source.y,
        w: scaleSpan(source.w) ?? source.w,
        h: scaleHeight(source.h) ?? source.h,
        minW: source.minW == null ? source.minW : scaleSpan(source.minW),
        minH: source.minH == null ? source.minH : scaleHeight(source.minH),
        maxW: source.maxW == null ? source.maxW : scaleSpan(source.maxW),
        maxH: source.maxH == null ? source.maxH : scaleHeight(source.maxH),
      };
    };

    next[bp] = defaults.map((fallback) => {
      const sourceRaw = incomingById.get(fallback.i);
      const source = sourceRaw ? normalize(sourceRaw) : fallback;
      const fallbackMinW = Math.max(1, Number(fallback.minW) || 1);
      const fallbackMaxW = Number.isFinite(Number(fallback.maxW))
        ? Math.max(fallbackMinW, Math.min(cols, Number(fallback.maxW)))
        : cols;
      const minWRaw = Number(source.minW);
      const minWCandidate = Number.isFinite(minWRaw) ? minWRaw : fallbackMinW;
      const minW = Math.max(fallbackMinW, Math.min(fallbackMaxW, minWCandidate));
      const maxWRaw = Number(source.maxW);
      const maxWCandidate = Number.isFinite(maxWRaw) ? maxWRaw : fallbackMaxW;
      const maxW = Math.max(minW, Math.min(cols, Math.min(fallbackMaxW, maxWCandidate)));
      const wBase = Number(source.w);
      const w = Math.max(minW, Math.min(maxW, wBase || fallback.w));
      const xRaw = Number(source.x);
      const x = Math.max(0, Math.min(cols - w, Number.isFinite(xRaw) ? xRaw : fallback.x));
      const yRaw = Number(source.y);
      const y = Math.max(0, Number.isFinite(yRaw) ? yRaw : fallback.y);
      const fallbackMinH = Math.max(1, Number(fallback.minH) || 1);
      const hasFallbackMaxH = Number.isFinite(Number(fallback.maxH));
      const fallbackMaxH = hasFallbackMaxH
        ? Math.max(fallbackMinH, Number(fallback.maxH))
        : undefined;
      const minHRaw = Number(source.minH);
      const minHCandidate = Number.isFinite(minHRaw) ? minHRaw : fallbackMinH;
      let minH = hasFallbackMaxH
        ? Math.max(fallbackMinH, Math.min(fallbackMaxH as number, minHCandidate))
        : Math.max(fallbackMinH, minHCandidate);
      const maxHRaw = Number(source.maxH);
      const maxHCandidate = Number.isFinite(maxHRaw) ? Math.max(minH, maxHRaw) : fallbackMaxH;
      let maxH = hasFallbackMaxH
        ? Math.max(minH, Math.min(fallbackMaxH as number, maxHCandidate ?? fallbackMaxH as number))
        : maxHCandidate;
      minH = Math.min(minH, MAX_PANEL_GRID_HEIGHT);
      if (maxH != null) {
        maxH = Math.min(MAX_PANEL_GRID_HEIGHT, maxH);
      }
      const hBase = Number(source.h) || fallback.h;
      const hBounded = Math.max(minH, hBase);
      const hCapped = Math.min(MAX_PANEL_GRID_HEIGHT, hBounded);
      const h = maxH ? Math.min(maxH, hCapped) : hCapped;

      return {
        ...fallback,
        ...source,
        x,
        y,
        w,
        h,
        minW,
        minH,
        maxW,
        maxH,
      };
    });
  });

  return next;
}

function sanitizePanelVisibility(input: Record<string, boolean> | undefined): Record<string, boolean> {
  if (!input) return { ...DEFAULT_PANEL_VISIBILITY };
  return {
    ...DEFAULT_PANEL_VISIBILITY,
    ...Object.fromEntries(
      Object.entries(input).map(([key, value]) => [key, Boolean(value)])
    ),
  };
}

function sanitizePanelLocks(input: Record<string, boolean> | undefined): Record<string, boolean> {
  if (!input) return { ...DEFAULT_PANEL_LOCKS };
  return {
    ...DEFAULT_PANEL_LOCKS,
    ...Object.fromEntries(
      Object.entries(input).map(([key, value]) => [key, Boolean(value)])
    ),
  };
}

function sanitizePanelZOrder(
  input: string[] | undefined,
  visibility: Record<string, boolean> | undefined
): string[] {
  const known = Array.from(
    new Set<string>([...DEFAULT_PANEL_ORDER, ...Object.keys(visibility ?? {})])
  );
  const next: string[] = [];

  if (Array.isArray(input)) {
    for (const id of input) {
      if (typeof id !== "string") continue;
      if (!known.includes(id)) continue;
      if (next.includes(id)) continue;
      next.push(id);
    }
  }

  for (const id of known) {
    if (!next.includes(id)) next.push(id);
  }

  return next;
}

function sanitizeNewsPanelVisibility(input: Record<string, boolean> | undefined): Record<string, boolean> {
  if (!input) return { ...DEFAULT_NEWS_PANEL_VISIBILITY };
  return {
    ...DEFAULT_NEWS_PANEL_VISIBILITY,
    ...Object.fromEntries(Object.entries(input).map(([key, value]) => [key, Boolean(value)])),
  };
}

function sanitizeNewsPanelLocks(input: Record<string, boolean> | undefined): Record<string, boolean> {
  if (!input) return { ...DEFAULT_NEWS_PANEL_LOCKS };
  return {
    ...DEFAULT_NEWS_PANEL_LOCKS,
    ...Object.fromEntries(Object.entries(input).map(([key, value]) => [key, Boolean(value)])),
  };
}

function sanitizeNewsPanelZOrder(
  input: string[] | undefined,
  visibility: Record<string, boolean> | undefined
): string[] {
  const known = Array.from(new Set<string>([...DEFAULT_NEWS_PANEL_ORDER, ...Object.keys(visibility ?? {})]));
  const next: string[] = [];

  if (Array.isArray(input)) {
    for (const id of input) {
      if (typeof id !== "string") continue;
      if (!known.includes(id)) continue;
      if (next.includes(id)) continue;
      next.push(id);
    }
  }

  for (const id of known) {
    if (!next.includes(id)) next.push(id);
  }

  return next;
}

function readLegacyState(): Partial<WorldViewStore> | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem("worldview-store-v1");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      state?: Partial<WorldViewStore>;
    };
    if (!parsed || typeof parsed !== "object") return null;
    const s = parsed.state ?? {};

    return {
      layers: s.layers,
      filters: s.filters,
      ui: s.ui,
      savedScenes: s.savedScenes,
      cctv: s.cctv,
      dashboard: {
        ...defaultDashboardState(),
        density:
          (s.dashboard?.density as DashboardDensity | undefined) ??
          DASHBOARD_DENSITY_DEFAULT,
      },
    };
  } catch {
    return null;
  }
}

const baseState = {
  layers: {
    satellites: true,
    flights: true,
    military: false,
    earthquakes: true,
    traffic: false,
    cctv: false,
    news: true,
  },
  filters: {
    minMagnitude: 0,
    maxMagnitude: 10,
    minAltM: 0,
    maxAltM: 1_200_000,
    onGroundVisible: false,
  },
  ui: {
    stylePreset: "normal" as const,
    detectMode: "off" as const,
    showBloom: false,
    cleanMode: false,
    showDebug: false,
    leftTab: "layers" as const,
    crtDistortion: 0.2,
    crtInstability: 0.05,
    nvgBrightness: 1.2,
    flirContrast: 1.0,
    sharpen: false,
  },
  selection: {
    selectedEntity: null,
    pinnedEntities: [],
    trackingId: null,
    historyTrail: [],
    trackedFlightId: null,
    flightPath: [],
  },
  cctv: {
    cameras: [],
    selectedCameraId: null,
    calibrations: {},
    floating: { open: false, camera: null },
  },
  scenes: [],
  savedScenes: [],
  currentSceneIdx: -1,
  debug: { fps: 0, entityCount: 0, memoryMB: 0 },
  dashboard: defaultDashboardState(),
  liveData: defaultLiveDataState(),
  news: defaultNewsState(),
};

function withLegacyDefaults<T extends typeof baseState>(state: T): T {
  const legacy = readLegacyState();
  if (!legacy) return state;

  return {
    ...state,
    layers: { ...state.layers, ...(legacy.layers ?? {}) },
    filters: { ...state.filters, ...(legacy.filters ?? {}) },
    ui: { ...state.ui, ...(legacy.ui ?? {}) },
    savedScenes: legacy.savedScenes ?? state.savedScenes,
    cctv: {
      ...state.cctv,
      calibrations: legacy.cctv?.calibrations ?? state.cctv.calibrations,
      selectedCameraId: null,
      cameras: [],
      floating: { open: false, camera: null },
    },
    dashboard: {
      ...state.dashboard,
      ...(legacy.dashboard ?? {}),
    },
    news: { ...state.news, ...(legacy.news ?? {}) },
  };
}

export const useWorldViewStore = create<WorldViewStore>()(
  persist(
    subscribeWithSelector((set) => {
      const initial = withLegacyDefaults(baseState);

      return {
        ...initial,

        toggleLayer: (name) =>
          set((s) => ({ layers: { ...s.layers, [name]: !s.layers[name] } })),

        setStylePreset: (preset) =>
          set((s) => ({ ui: { ...s.ui, stylePreset: preset } })),

        setDetectMode: (mode) =>
          set((s) => ({ ui: { ...s.ui, detectMode: mode } })),

        setUi: (partial) => set((s) => ({ ui: { ...s.ui, ...partial } })),

        setFilters: (partial) =>
          set((s) => ({ filters: { ...s.filters, ...partial } })),

        selectEntity: (entity) =>
          set((s) => ({ selection: { ...s.selection, selectedEntity: entity } })),

        pinEntity: (entity) =>
          set((s) => ({
            selection: {
              ...s.selection,
              pinnedEntities: [
                ...s.selection.pinnedEntities.filter((e) => e.id !== entity.id),
                entity,
              ],
            },
          })),

        unpinEntity: (id) =>
          set((s) => ({
            selection: {
              ...s.selection,
              pinnedEntities: s.selection.pinnedEntities.filter((e) => e.id !== id),
            },
          })),

        setTrackingId: (id) =>
          set((s) => ({ selection: { ...s.selection, trackingId: id } })),

        setHistoryTrail: (positions) =>
          set((s) => ({ selection: { ...s.selection, historyTrail: positions } })),

        setTrackedFlightId: (id) =>
          set((s) => ({ selection: { ...s.selection, trackedFlightId: id } })),

        setFlightPath: (path) =>
          set((s) => ({ selection: { ...s.selection, flightPath: path } })),

        setScenes: (scenes) => set({ scenes }),

        gotoScene: (idx) => set({ currentSceneIdx: idx }),

        saveScene: (scene) =>
          set((s) => ({ savedScenes: [...s.savedScenes, scene] })),

        deleteScene: (name) =>
          set((s) => ({
            savedScenes: s.savedScenes.filter((sc) => sc.name !== name),
          })),

        setCameras: (cameras) =>
          set((s) => ({ cctv: { ...s.cctv, cameras } })),

        selectCamera: (id) =>
          set((s) => ({ cctv: { ...s.cctv, selectedCameraId: id } })),

        updateCalibration: (id, cal) =>
          set((s) => ({
            cctv: {
              ...s.cctv,
              calibrations: {
                ...s.cctv.calibrations,
                [id]: { ...(s.cctv.calibrations[id] ?? defaultCalibration()), ...cal },
              },
            },
          })),

        openCctvFloating: (camera) =>
          set((s) => ({ cctv: { ...s.cctv, floating: { open: true, camera } } })),

        closeCctvFloating: () =>
          set((s) => ({ cctv: { ...s.cctv, floating: { open: false, camera: null } } })),

        setDebug: (partial) => set((s) => ({ debug: { ...s.debug, ...partial } })),

        setActiveView: (view) =>
          set((s) => ({ dashboard: { ...s.dashboard, activeView: view } })),

        setDensity: () =>
          set((s) => ({ dashboard: { ...s.dashboard, density: "ultra" } })),

        setDashboard: (partial) =>
          set((s) => ({ dashboard: { ...s.dashboard, ...partial } })),

        setPanelLayouts: (layouts) =>
          set((s) => ({
            dashboard: { ...s.dashboard, panelLayouts: sanitizeLayouts(layouts) },
          })),

        resetPanelLayouts: () =>
          set((s) => ({
            dashboard: { ...s.dashboard, panelLayouts: sanitizeLayouts(DEFAULT_PANEL_LAYOUTS) },
          })),

        setPanelVisibility: (panelId, visible) =>
          set((s) => ({
            dashboard: {
              ...s.dashboard,
              panelVisibility: {
                ...s.dashboard.panelVisibility,
                [panelId]: visible,
              },
              panelZOrder: visible
                ? sanitizePanelZOrder([...s.dashboard.panelZOrder, panelId], {
                    ...s.dashboard.panelVisibility,
                    [panelId]: visible,
                  })
                : s.dashboard.panelZOrder,
            },
          })),

        setPanelLock: (panelId, locked) =>
          set((s) => ({
            dashboard: {
              ...s.dashboard,
              panelLocks: {
                ...s.dashboard.panelLocks,
                [panelId]: locked,
              },
            },
          })),

        setPanelFocus: (panelFocusId) =>
          set((s) => ({ dashboard: { ...s.dashboard, panelFocusId } })),

        bringPanelToFront: (panelId) =>
          set((s) => ({
            dashboard: {
              ...s.dashboard,
              panelZOrder: sanitizePanelZOrder(
                [...s.dashboard.panelZOrder.filter((id) => id !== panelId), panelId],
                s.dashboard.panelVisibility
              ),
            },
          })),

        setTablePreference: (tableId, partial) =>
          set((s) => {
            const current = s.dashboard.tablePrefs[tableId] ?? defaultTablePref();
            return {
              dashboard: {
                ...s.dashboard,
                tablePrefs: {
                  ...s.dashboard.tablePrefs,
                  [tableId]: { ...current, ...partial },
                },
              },
            };
          }),

        openInspector: (entity, pinned = false) =>
          set((s) => ({
            dashboard: {
              ...s.dashboard,
              inspector: {
                ...s.dashboard.inspector,
                open: true,
                pinned,
                entity,
              },
            },
          })),

        closeInspector: (force = false) =>
          set((s) => {
            if (s.dashboard.inspector.pinned && !force) return s;
            return {
              dashboard: {
                ...s.dashboard,
                inspector: {
                  ...s.dashboard.inspector,
                  open: false,
                  entity: force ? null : s.dashboard.inspector.entity,
                },
              },
            };
          }),

        setInspectorTab: (tab) =>
          set((s) => ({
            dashboard: {
              ...s.dashboard,
              inspector: { ...s.dashboard.inspector, tab },
            },
          })),

        setInspectorPinned: (pinned) =>
          set((s) => ({
            dashboard: {
              ...s.dashboard,
              inspector: { ...s.dashboard.inspector, pinned },
            },
          })),

        setInspectorSplitView: (splitView) =>
          set((s) => ({
            dashboard: {
              ...s.dashboard,
              inspector: { ...s.dashboard.inspector, splitView },
            },
          })),

        setInspectorNote: (entityId, note) =>
          set((s) => ({
            dashboard: {
              ...s.dashboard,
              inspector: {
                ...s.dashboard.inspector,
                notes: {
                  ...s.dashboard.inspector.notes,
                  [entityId]: note,
                },
              },
            },
          })),

        clearSelectionContext: () =>
          set((s) => ({
            selection: {
              ...s.selection,
              selectedEntity: null,
              trackingId: null,
              historyTrail: [],
              trackedFlightId: null,
              flightPath: [],
            },
            dashboard: {
              ...s.dashboard,
              inspector: {
                ...s.dashboard.inspector,
                open: false,
                pinned: false,
                entity: null,
              },
            },
          })),

        setHotkeysEnabled: (enabled) =>
          set((s) => ({
            dashboard: {
              ...s.dashboard,
              hotkeysEnabled: enabled,
            },
          })),

        bumpRefreshTick: () =>
          set((s) => ({
            liveData: { ...s.liveData, refreshTick: s.liveData.refreshTick + 1 },
          })),

        setLiveData: (partial) =>
          set((s) => ({
            liveData: {
              ...s.liveData,
              ...partial,
            },
          })),

        setLiveFlights: (flights) =>
          set((s) => ({
            liveData: {
              ...s.liveData,
              flights,
            },
          })),

        setLiveMilitary: (military) =>
          set((s) => ({
            liveData: {
              ...s.liveData,
              military,
            },
          })),

        setLiveEarthquakes: (earthquakes) =>
          set((s) => ({
            liveData: {
              ...s.liveData,
              earthquakes,
            },
          })),

        setLiveSatellites: (satellites) =>
          set((s) => ({
            liveData: {
              ...s.liveData,
              satellites,
            },
          })),

        setSatelliteCatalog: (satelliteCatalog) =>
          set((s) => ({
            liveData: {
              ...s.liveData,
              satelliteCatalog,
            },
          })),

        setLiveCctv: (cctv) =>
          set((s) => ({
            liveData: {
              ...s.liveData,
              cctv,
            },
          })),

        setLiveScenes: (scenes) =>
          set((s) => ({
            liveData: {
              ...s.liveData,
              scenes,
            },
          })),

        setFeedHealth: (source, health) =>
          set((s) => ({
            liveData: {
              ...s.liveData,
              health: { ...s.liveData.health, [source]: health },
            },
          })),

        markFeedUpdated: (source, ts = Date.now()) =>
          set((s) => ({
            liveData: {
              ...s.liveData,
              lastUpdated: { ...s.liveData.lastUpdated, [source]: ts },
            },
          })),

        pushFeedLog: ({ source, message, level, ts = Date.now() }) =>
          set((s) => {
            const next: FeedLogItem = {
              id: `${source}-${ts}-${Math.random().toString(16).slice(2, 8)}`,
              source,
              message,
              level,
              ts,
            };
            const feedLog = [...s.liveData.feedLog, next].slice(-200);
            return {
              liveData: {
                ...s.liveData,
                feedLog,
              },
            };
          }),

        appendTrendSnapshot: (snapshot = {}) =>
          set((s) => {
            const current = s.liveData;
            const entityCount =
              snapshot.entityCount ??
              current.flights.length +
                current.military.length +
                current.earthquakes.length +
                current.satellites.length;
            const flightCount =
              snapshot.flightCount ?? current.flights.length + current.military.length;
            const militaryCount = snapshot.militaryCount ?? current.military.length;
            const quakeAvgMag =
              snapshot.quakeAvgMag ??
              (current.earthquakes.length
                ? current.earthquakes.reduce((sum, q) => sum + q.mag, 0) /
                  current.earthquakes.length
                : 0);

            const limit = 60;
            const timeline = [...current.trendHistory.timeline, Date.now()].slice(-limit);
            const nextTrend = {
              timeline,
              entityCount: [...current.trendHistory.entityCount, entityCount].slice(-limit),
              flightCount: [...current.trendHistory.flightCount, flightCount].slice(-limit),
              militaryCount: [...current.trendHistory.militaryCount, militaryCount].slice(-limit),
              quakeAvgMag: [...current.trendHistory.quakeAvgMag, quakeAvgMag].slice(-limit),
            };

            return {
              liveData: {
                ...current,
                trendHistory: nextTrend,
              },
            };
          }),

        setNewsQuery: (query) =>
          set((s) => ({
            news: { ...s.news, query },
          })),

        setNewsQueryAst: (queryAst) =>
          set((s) => ({
            news: { ...s.news, queryAst },
          })),

        setNewsQueryState: (partial) =>
          set((s) => ({
            news: {
              ...s.news,
              queryState: { ...s.news.queryState, ...partial },
            },
          })),

        setNewsUiState: (partial) =>
          set((s) => ({
            news: {
              ...s.news,
              ui: { ...s.news.ui, ...partial },
            },
          })),

        setNewsFeedItems: (feedItems) =>
          set((s) => ({
            news: { ...s.news, feedItems },
          })),

        setNewsThreads: (threads) =>
          set((s) => ({
            news: { ...s.news, threads },
          })),

        setNewsMarkers: (markers) =>
          set((s) => ({
            news: { ...s.news, markers },
          })),

        setNewsFacets: (facets) =>
          set((s) => ({
            news: { ...s.news, facets },
          })),

        setSelectedStory: (selectedStoryId) =>
          set((s) => ({
            news: { ...s.news, selectedStoryId },
          })),

        setSelectedCountry: (selectedCountry) =>
          set((s) => ({
            news: { ...s.news, selectedCountry },
          })),

        setHighlightMarker: (highlightedMarkerId) =>
          set((s) => ({
            news: { ...s.news, highlightedMarkerId },
          })),

        setSearchInView: (searchInView) =>
          set((s) => ({
            news: { ...s.news, searchInView },
          })),

        setNewsCameraBounds: (cameraBounds) =>
          set((s) => ({
            news: { ...s.news, cameraBounds },
          })),

        setNewsLayoutPreset: (layoutPreset) =>
          set((s) => ({
            news: {
              ...s.news,
              layoutPreset,
              panelLayouts: sanitizeLayouts(NEWS_PANEL_LAYOUT_PRESETS[layoutPreset], DEFAULT_NEWS_PANEL_LAYOUTS),
            },
          })),

        resetNewsLayout: () =>
          set((s) => ({
            news: {
              ...s.news,
              layoutPreset: "news-centric",
              panelLayouts: sanitizeLayouts(DEFAULT_NEWS_PANEL_LAYOUTS, DEFAULT_NEWS_PANEL_LAYOUTS),
              panelVisibility: { ...DEFAULT_NEWS_PANEL_VISIBILITY },
              panelLocks: { ...DEFAULT_NEWS_PANEL_LOCKS },
              panelZOrder: [...DEFAULT_NEWS_PANEL_ORDER],
              panelFocusId: null,
              ui: {
                ...s.news.ui,
                focusedPanel: null,
                statusLine: "Default NEWS layout restored.",
              },
            },
          })),

        setNewsPanelLayouts: (layouts) =>
          set((s) => ({
            news: {
              ...s.news,
              panelLayouts: sanitizeLayouts(layouts, DEFAULT_NEWS_PANEL_LAYOUTS),
            },
          })),

        setNewsPanelVisibility: (panelId, visible) =>
          set((s) => ({
            news: {
              ...s.news,
              panelVisibility: { ...s.news.panelVisibility, [panelId]: visible },
              panelZOrder: visible
                ? sanitizeNewsPanelZOrder([...s.news.panelZOrder, panelId], {
                    ...s.news.panelVisibility,
                    [panelId]: visible,
                  })
                : s.news.panelZOrder,
            },
          })),

        setNewsPanelLock: (panelId, locked) =>
          set((s) => ({
            news: {
              ...s.news,
              panelLocks: { ...s.news.panelLocks, [panelId]: locked },
            },
          })),

        setNewsPanelFocus: (panelFocusId) =>
          set((s) => ({
            news: {
              ...s.news,
              panelFocusId,
              ui: { ...s.news.ui, focusedPanel: panelFocusId },
            },
          })),

        bringNewsPanelToFront: (panelId) =>
          set((s) => ({
            news: {
              ...s.news,
              panelZOrder: sanitizeNewsPanelZOrder(
                [...s.news.panelZOrder.filter((id) => id !== panelId), panelId],
                s.news.panelVisibility
              ),
            },
          })),

        setNewsWatchlist: (partial) =>
          set((s) => ({
            news: {
              ...s.news,
              watchlist: {
                ...s.news.watchlist,
                ...partial,
                tickers: partial.tickers ?? s.news.watchlist.tickers,
                topics: partial.topics ?? s.news.watchlist.topics,
                regions: partial.regions ?? s.news.watchlist.regions,
                sources: partial.sources ?? s.news.watchlist.sources,
              },
            },
          })),

        muteNewsSource: (source, muted = true) =>
          set((s) => {
            const key = source.trim().toLowerCase();
            if (!key) return s;
            const next = new Set(s.news.mutedSources.map((value) => value.toLowerCase()));
            if (muted) next.add(key);
            else next.delete(key);
            return {
              news: {
                ...s.news,
                mutedSources: Array.from(next),
              },
            };
          }),

        saveNewsSearch: (search) =>
          set((s) => {
            const next = [...s.news.savedSearches.filter((item) => item.id !== search.id), search];
            next.sort((a, b) => b.createdAt - a.createdAt);
            return {
              news: { ...s.news, savedSearches: next.slice(0, 40) },
            };
          }),

        deleteNewsSearch: (id) =>
          set((s) => ({
            news: {
              ...s.news,
              savedSearches: s.news.savedSearches.filter((item) => item.id !== id),
            },
          })),

        upsertNewsAlert: (alert) =>
          set((s) => {
            const alerts = [...s.news.alerts];
            const idx = alerts.findIndex((item) => item.id === alert.id);
            if (idx >= 0) alerts[idx] = { ...alerts[idx], ...alert };
            else alerts.unshift(alert);
            return {
              news: { ...s.news, alerts: alerts.slice(0, 60) },
            };
          }),

        ackNewsAlert: (id) =>
          set((s) => ({
            news: {
              ...s.news,
              alerts: s.news.alerts.map((alert) =>
                alert.id === id ? { ...alert, unreadCount: 0 } : alert
              ),
            },
          })),

        setNewsVideoState: (partial) =>
          set((s) => ({
            news: {
              ...s.news,
              video: { ...s.news.video, ...partial },
            },
          })),

        setHeadlineTape: (partial) =>
          set((s) => ({
            news: {
              ...s.news,
              headlineTape: { ...s.news.headlineTape, ...partial },
            },
          })),

        advanceHeadlineTape: (step = 1) =>
          set((s) => {
            const len = Math.max(1, s.news.feedItems.length);
            const cursor = ((s.news.headlineTape.cursor + step) % len + len) % len;
            return {
              news: {
                ...s.news,
                headlineTape: { ...s.news.headlineTape, cursor },
              },
            };
          }),

        setNewsBackendHealth: (source, health) =>
          set((s) => ({
            news: {
              ...s.news,
              backendHealth: { ...s.news.backendHealth, [source]: health },
            },
          })),

        setNewsLastUpdated: (ts = Date.now()) =>
          set((s) => ({
            news: {
              ...s.news,
              lastUpdated: ts,
            },
          })),

        clearNewsTransient: () =>
          set((s) => ({
            news: {
              ...s.news,
              feedItems: [],
              markers: [],
              threads: [],
              facets: defaultNewsState().facets,
              backendHealth: defaultNewsState().backendHealth,
              lastUpdated: null,
              selectedStoryId: null,
              selectedCountry: null,
              highlightedMarkerId: null,
              queryState: defaultNewsState().queryState,
              ui: { ...s.news.ui, statusLine: "Ready." },
            },
          })),
      };
    }),
    {
      name: "worldview-store-v2",
      version: 13,
      migrate: (persistedState) => {
        const state = persistedState as
          | {
              dashboard?: Partial<DashboardState>;
              news?: Partial<NewsState>;
            }
          | undefined;
        if (!state) return persistedState;

        const dashboardInput = state.dashboard ?? {};
        const activeView = dashboardInput.activeView === "news" ? "news" : "ops";
        const panelVisibility = sanitizePanelVisibility(dashboardInput.panelVisibility);
        const panelLocks = sanitizePanelLocks(dashboardInput.panelLocks);

        // v12 intentionally resets all NEWS persisted state once to clear stale layout
        // and incompatible query/control states while keeping OPS/dashboard preferences.
        const mergedNews: NewsState = defaultNewsState();

        return {
          ...state,
          dashboard: {
            ...defaultDashboardState(),
            ...dashboardInput,
            activeView,
            density: "ultra",
            panelLayouts: sanitizeLayouts(dashboardInput.panelLayouts as DashboardLayouts | undefined),
            panelVisibility,
            panelLocks,
            panelZOrder: sanitizePanelZOrder(dashboardInput.panelZOrder, panelVisibility),
          },
          news: mergedNews,
        };
      },
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<WorldViewStore>;
        const current = currentState as WorldViewStore;

        const persistedDashboard = (persisted.dashboard ?? {}) as Partial<DashboardState>;
        const nextDashboardVisibility = sanitizePanelVisibility(persistedDashboard.panelVisibility);
        const nextDashboardLocks = sanitizePanelLocks(persistedDashboard.panelLocks);

        const persistedNews = (persisted.news ?? {}) as Partial<NewsState>;
        const layoutPreset =
          persistedNews.layoutPreset === "news-centric" ||
          persistedNews.layoutPreset === "globe-centric" ||
          persistedNews.layoutPreset === "split"
            ? persistedNews.layoutPreset
            : current.news.layoutPreset;
        const nextNewsVisibility = sanitizeNewsPanelVisibility(persistedNews.panelVisibility);
        const nextNewsLocks = sanitizeNewsPanelLocks(persistedNews.panelLocks);

        return {
          ...current,
          ...persisted,
          dashboard: {
            ...current.dashboard,
            ...persistedDashboard,
            panelLayouts: sanitizeLayouts(
              persistedDashboard.panelLayouts as DashboardLayouts | undefined
            ),
            panelVisibility: nextDashboardVisibility,
            panelLocks: nextDashboardLocks,
            panelZOrder: sanitizePanelZOrder(
              persistedDashboard.panelZOrder,
              nextDashboardVisibility
            ),
          },
          news: {
            ...current.news,
            ...persistedNews,
            queryState: {
              ...current.news.queryState,
              ...(persistedNews.queryState ?? {}),
            },
            ui: {
              ...current.news.ui,
              ...(persistedNews.ui ?? {}),
            },
            watchlist: {
              ...current.news.watchlist,
              ...(persistedNews.watchlist ?? {}),
            },
            video: {
              ...current.news.video,
              ...(persistedNews.video ?? {}),
            },
            headlineTape: {
              ...current.news.headlineTape,
              ...(persistedNews.headlineTape ?? {}),
            },
            panelLayouts: sanitizeLayouts(
              persistedNews.panelLayouts as DashboardLayouts | undefined,
              NEWS_PANEL_LAYOUT_PRESETS[layoutPreset]
            ),
            panelVisibility: nextNewsVisibility,
            panelLocks: nextNewsLocks,
            panelZOrder: sanitizeNewsPanelZOrder(
              persistedNews.panelZOrder,
              nextNewsVisibility
            ),
            feedItems: [],
            markers: [],
            threads: [],
            facets: current.news.facets,
            backendHealth: current.news.backendHealth,
            selectedStoryId: null,
            highlightedMarkerId: null,
            lastUpdated: null,
          },
        };
      },
      partialize: (s) => ({
        layers: s.layers,
        filters: s.filters,
        ui: s.ui,
        savedScenes: s.savedScenes,
        cctv: {
          cameras: [],
          selectedCameraId: null,
          calibrations: s.cctv.calibrations,
          floating: { open: false, camera: null },
        },
        dashboard: {
          activeView: s.dashboard.activeView,
          density: s.dashboard.density,
          inspector: {
            ...s.dashboard.inspector,
            entity: null,
          },
          panelLayouts: s.dashboard.panelLayouts,
          panelVisibility: s.dashboard.panelVisibility,
          panelLocks: s.dashboard.panelLocks,
          tablePrefs: s.dashboard.tablePrefs,
          panelFocusId: s.dashboard.panelFocusId,
          panelZOrder: s.dashboard.panelZOrder,
          hotkeysEnabled: s.dashboard.hotkeysEnabled,
        },
        news: {
          query: s.news.query,
          queryAst: s.news.queryAst,
          queryState: {
            lastFallbackApplied: [],
            lastEmptyReason: null,
          },
          ui: {
            compactMode: s.news.ui.compactMode,
            focusedPanel: null,
            statusLine: "Ready.",
            showHelpHints: s.news.ui.showHelpHints,
          },
          watchlist: s.news.watchlist,
          savedSearches: s.news.savedSearches,
          alerts: s.news.alerts,
          mutedSources: s.news.mutedSources,
          panelLayouts: s.news.panelLayouts,
          panelVisibility: s.news.panelVisibility,
          panelLocks: s.news.panelLocks,
          panelZOrder: s.news.panelZOrder,
          panelFocusId: s.news.panelFocusId,
          layoutPreset: s.news.layoutPreset,
          video: s.news.video,
          searchInView: s.news.searchInView,
          headlineTape: s.news.headlineTape,
        },
      }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.error("[store] hydrate error", error);
        }
      },
    }
  )
);

function defaultCalibration(): CameraCalibration {
  return {
    heading: 0,
    pitch: -15,
    fov: 60,
    range: 200,
    height: 5,
    northM: 0,
    eastM: 0,
  };
}
