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
  DisasterAlert,
  SpaceWeatherAlert,
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
import type { LayerHealthState } from "../lib/newsLayers/types";
import { NEWS_LAYER_DEFAULT_TOGGLES } from "../lib/newsLayers/registry";
import type { TradeRouteSelectionState, TradeRouteCategory, DisruptionSignal } from "../lib/cesium/tradeRoutes/types";
import { defaultTradeRouteSelection } from "../lib/cesium/tradeRoutes/types";

interface LayerState {
  satellites: boolean;
  flights: boolean;
  military: boolean;
  disasters: boolean;
  cctv: boolean;
  tradeRoutes: boolean;
  gpsJam: boolean;
  airspaceAnomaly: boolean;
  volcanoes: boolean;
  nuclearSites: boolean;
  militaryBases: boolean;
  countryBorders: boolean;
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
  /** Cameras that have repeatedly failed snapshot/stream loads in this session. */
  brokenIds: Record<string, boolean>;
}

interface DebugState {
  fps: number;
  entityCount: number;
  memoryMB: number;
}

type NewsBackendHealth = "idle" | "loading" | "ok" | "degraded" | "error";

type NuclearFilters = {
  types: string[];
  statuses: string[];
  searchText: string;
  inViewportOnly: boolean;
};

export type ArmsEmbargoFilters = {
  authorities: string[];
  statuses: string[];
  scopes: string[];
  searchText: string;
  startYearRange: [number, number] | null;
  inViewportOnly: boolean;
};

export type EconomicCenterFilters = {
  scoreThreshold: number;
  mode: "finance" | "trade" | "balanced";
  regionFilter: string[];
  viewportOnly: boolean;
  searchText: string;
};

export type AiDataCenterFilters = {
  confidenceThreshold: number;
  importanceThreshold: number;
  operatorFilter: string[];
  operatorTypeFilter: string[];
  viewportOnly: boolean;
  searchText: string;
};

export type UcdpFilters = {
  violenceTypes: string[];
  minFatalities: number;
  countries: string[];
  yearRange: [number, number];
  inViewportOnly: boolean;
};

export type ConflictFilters = {
  inViewportOnly: boolean;
};

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
  storyPopupArticle: NewsArticle | null;
  watchlist: NewsWatchlist;
  savedSearches: SavedSearch[];
  alerts: AlertRuleState[];
  mutedSources: string[];
  panelLayouts: DashboardLayouts;
  panelVisibility: Record<string, boolean>;
  panelLocks: Record<string, boolean>;
  /** Category feed panels with no articles are moved to bottom when true; id -> hasArticles */
  categoryPanelHasArticles: Record<string, boolean>;
  panelZOrder: string[];
  panelFocusId: string | null;
  layoutPreset: NewsLayoutPreset;
  ui: {
    compactMode: boolean;
    focusedPanel: string | null;
    statusLine: string;
    showHelpHints: boolean;
    countryDock: {
      pinned: boolean;
      expanded: boolean;
      showQuickActions: boolean;
    };
  };
  video: NewsVideoState;
  searchInView: boolean;
  cameraBounds: NewsCameraBounds | null;
  nuclearFilters: NuclearFilters;
  armsEmbargoFilters: ArmsEmbargoFilters;
  ucdpFilters: UcdpFilters;
  conflictFilters: ConflictFilters;
  economicCenterFilters: EconomicCenterFilters;
  aiDataCenterFilters: AiDataCenterFilters;
  headlineTape: {
    enabled: boolean;
    paused: boolean;
    cursor: number;
  };
  backendHealth: Record<string, NewsBackendHealth>;
  layerToggles: Record<string, boolean>;
  layerHealth: Record<string, LayerHealthState>;
  lastUpdated: number | null;
}

interface SIGINTStore {
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
  tradeRouteSelection: TradeRouteSelectionState;
  activePopup: import("../lib/events/schema").WorldEvent | null;
  layerFilters: { timeWindow: import("../lib/events/schema").TimeWindow; minSeverity: number; viewportBound: boolean };

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
  setLiveDisasters(disasters: DisasterAlert[]): void;
  setLiveSpaceWeather(alerts: SpaceWeatherAlert[]): void;
  setLiveSatellites(satellites: PropagatedSat[]): void;
  setSatelliteCatalog(satellites: Satellite[]): void;
  setLiveCctv(cctv: CctvCamera[]): void;
  setLiveScenes(scenes: Scene[]): void;
  setAirspaceAnomalies(zones: import("../lib/providers/types").AirspaceAnomalyZone[]): void;
  setDisappearedFlights(flights: import("../lib/providers/types").DisappearedFlight[]): void;
  setFeedHealth(source: string, health: LiveDataState["health"][string]): void;
  setOpsSourceHealth(
    source: string,
    state: LiveDataState["sourceHealth"][string]
  ): void;
  markFeedUpdated(source: string, ts?: number): void;
  pushFeedLog(item: Omit<FeedLogItem, "id" | "ts"> & { ts?: number }): void;
  appendTrendSnapshot(snapshot?: {
    entityCount?: number;
    flightCount?: number;
    militaryCount?: number;
    quakeAvgMag?: number;
  }): void;

  /** Mark CCTV cameras as healthy/unhealthy based on snapshot/stream errors. */
  markCctvBroken(id: string): void;
  resetCctvHealth(): void;

  setNewsQuery(query: string): void;
  setNewsQueryAst(ast: QueryAST): void;
  setNewsQueryState(partial: Partial<NewsState["queryState"]>): void;
  setNewsUiState(partial: Partial<NewsState["ui"]>): void;
  setNewsFeedItems(items: NewsArticle[]): void;
  setNewsThreads(threads: NewsThread[]): void;
  setNewsMarkers(markers: GeoMarker[]): void;
  setNewsFacets(facets: NewsFacetState): void;
  setSelectedStory(id: string | null): void;
  setStoryPopupArticle(article: NewsArticle | null): void;
  setSelectedCountry(country: string | null): void;
  setHighlightMarker(id: string | null): void;
  setSearchInView(enabled: boolean): void;
  setNewsCameraBounds(bounds: NewsCameraBounds | null): void;
  setNuclearFilters(partial: Partial<NuclearFilters>): void;
  setArmsEmbargoFilters(partial: Partial<ArmsEmbargoFilters>): void;
  setUcdpFilters(partial: Partial<UcdpFilters>): void;
  setConflictFilters(partial: Partial<ConflictFilters>): void;
  setEconomicCenterFilters(partial: Partial<EconomicCenterFilters>): void;
  setAiDataCenterFilters(partial: Partial<AiDataCenterFilters>): void;
  setNewsLayoutPreset(preset: NewsLayoutPreset): void;
  resetNewsLayout(): void;
  setNewsPanelLayouts(layouts: DashboardLayouts): void;
  setNewsPanelVisibility(panelId: string, visible: boolean): void;
  setNewsPanelLock(panelId: string, locked: boolean): void;
  setNewsCategoryPanelHasArticles(panelId: string, hasArticles: boolean): void;
  setNewsPanelFocus(panelId: string | null): void;
  bringNewsPanelToFront(panelId: string): void;
  setNewsWatchlist(partial: Partial<NewsWatchlist>): void;
  muteNewsSource(source: string, muted?: boolean): void;
  saveNewsSearch(search: SavedSearch): void;
  deleteNewsSearch(id: string): void;
  upsertNewsAlert(alert: AlertRuleState): void;
  ackNewsAlert(id: string): void;
  setNewsVideoState(partial: Partial<NewsVideoState>): void;
  setNewsVideoPanelState(panelId: string, partial: Partial<NewsVideoState["byPanel"][string]>): void;
  setHeadlineTape(partial: Partial<NewsState["headlineTape"]>): void;
  advanceHeadlineTape(step?: number): void;
  setNewsBackendHealth(source: string, health: NewsBackendHealth): void;
  setNewsLayerToggle(layerId: string, enabled: boolean): void;
  setNewsLayerHealth(layerId: string, health: LayerHealthState): void;
  setNewsLastUpdated(ts?: number): void;
  clearNewsTransient(): void;

  setTradeRouteSelection(partial: Partial<TradeRouteSelectionState>): void;
  setTradeRouteCategoryFilter(category: TradeRouteCategory, enabled: boolean): void;
  setTradeRouteDisruptions(signals: DisruptionSignal[]): void;
  clearTradeRouteSelection(): void;
  setActivePopup(event: import("../lib/events/schema").WorldEvent | null): void;
  setLayerFilters(partial: Partial<SIGINTStore["layerFilters"]>): void;
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
  "cctv-live": true,
  "space-weather": true,
};
const DEFAULT_PANEL_LOCKS: Record<string, boolean> = {
  kpi: false,
  "flight-table": false,
  "quake-table": false,
  "sat-list": false,
  feed: false,
  "cctv-live": false,
  "space-weather": false,
};
const DEFAULT_PANEL_ORDER = [...DEFAULT_PANEL_IDS];
const LIVE_VIDEO_PANEL_IDS = [
  "news-video-1",
  "news-video-2",
  "news-video-3",
  "news-video-4",
] as const;
const LIVE_VIDEO_PANEL_ID_SET = new Set<string>(LIVE_VIDEO_PANEL_IDS as readonly string[]);

const DEFAULT_NEWS_PANEL_IDS = [
  "news-terminal",
  "news-globe",
  "news-compliance",
  ...LIVE_VIDEO_PANEL_IDS,
  "news-cat-tech",
  "news-cat-ai",
  "news-cat-crypto",
  "news-cat-markets",
  "news-cat-cyber",
  "news-cat-semis",
  "news-cat-other",
  "news-cat-energy",
  "news-cat-defense",
  "news-cat-govt",
  "news-cat-finance",
  "news-cat-biotech",
  "news-predictions",
] as const;
const DEFAULT_NEWS_PANEL_VISIBILITY: Record<string, boolean> = {
  "news-terminal": true,
  "news-globe": true,
  "news-compliance": true,
  "news-video-1": true,
  "news-video-2": true,
  "news-video-3": true,
  "news-video-4": true,
  "news-cat-tech": true,
  "news-cat-ai": true,
  "news-cat-crypto": true,
  "news-cat-markets": true,
  "news-cat-cyber": true,
  "news-cat-semis": true,
  "news-cat-other": true,
  "news-cat-energy": true,
  "news-cat-defense": true,
  "news-cat-govt": true,
  "news-cat-finance": true,
  "news-cat-biotech": true,
  "news-predictions": true,
};
const DEFAULT_NEWS_PANEL_LOCKS: Record<string, boolean> = {
  "news-terminal": false,
  "news-globe": false,
  "news-compliance": false,
  "news-video-1": false,
  "news-video-2": false,
  "news-video-3": false,
  "news-video-4": false,
  "news-cat-tech": false,
  "news-cat-ai": false,
  "news-cat-crypto": false,
  "news-cat-markets": false,
  "news-cat-cyber": false,
  "news-cat-semis": false,
  "news-cat-other": false,
  "news-cat-energy": false,
  "news-cat-defense": false,
  "news-cat-govt": false,
  "news-cat-finance": false,
  "news-cat-biotech": false,
  "news-predictions": false,
};
const DEFAULT_NEWS_PANEL_ORDER = [...DEFAULT_NEWS_PANEL_IDS];

const CAT_PANEL_IDS = [
  "news-cat-tech", "news-cat-ai", "news-cat-crypto", "news-cat-markets",
  "news-cat-cyber", "news-cat-semis", "news-cat-other", "news-cat-energy",
  "news-cat-defense", "news-cat-govt", "news-cat-finance", "news-cat-biotech",
];

function buildVideoLayouts(startX: number, startY: number, totalW: number, totalH: number) {
  const cellW = Math.floor(totalW / 2);
  const cellH = Math.floor(totalH / 2);
  return LIVE_VIDEO_PANEL_IDS.map((id, idx) => ({
    i: id,
    x: startX + (idx % 2) * cellW,
    y: startY + Math.floor(idx / 2) * cellH,
    w: cellW,
    h: cellH,
    minW: 60,
    minH: 40,
  }));
}

function buildVideoRowLayouts(startX: number, startY: number, totalW: number, totalH: number) {
  const perRow = LIVE_VIDEO_PANEL_IDS.length;
  const baseW = Math.floor(totalW / perRow);
  const remainder = totalW - baseW * perRow;
  return LIVE_VIDEO_PANEL_IDS.map((id, idx) => {
    const extra = idx === perRow - 1 ? remainder : 0;
    return {
      i: id,
      x: startX + idx * baseW,
      y: startY,
      w: baseW + extra,
      h: totalH,
      minW: 60,
      minH: 40,
    };
  });
}

function buildCatLayouts(cols: number, startY: number, cellW: number, cellH: number, startX = 0, startIdx = 0, count?: number) {
  const perRow = Math.max(1, Math.floor((cols - startX) / cellW));
  const ids = count !== undefined ? CAT_PANEL_IDS.slice(startIdx, startIdx + count) : CAT_PANEL_IDS.slice(startIdx);
  return ids.map((id, idx) => ({
    i: id,
    x: startX + (idx % perRow) * cellW,
    y: startY + Math.floor(idx / perRow) * cellH,
    w: cellW,
    h: cellH,
    minW: Math.max(40, Math.round(cellW * 0.5)),
    minH: Math.max(40, Math.round(cellH * 0.5)),
  }));
}

const DEFAULT_NEWS_PANEL_LAYOUTS: DashboardLayouts = {
  lg: [
    { i: "news-globe", x: 0, y: 0, w: 360, h: 170, minW: 180, minH: 80 },
    ...buildVideoRowLayouts(0, 170, 360, 120),
    { i: "news-terminal", x: 0, y: 290, w: 180, h: 80, minW: 100, minH: 64 },
    { i: "news-compliance", x: 180, y: 290, w: 180, h: 80, minW: 100, minH: 64 },
    { i: "news-predictions", x: 0, y: 370, w: 180, h: 180, minW: 90, minH: 80 },
    // Fill blank area to the right of predictions (x=180..360, y=370..550) with first 4 cat panels
    ...buildCatLayouts(360, 370, 90, 90, 180, 0, 4),
    // Remaining 8 cat panels below
    ...buildCatLayouts(360, 550, 90, 80, 0, 4),
  ],
  md: [
    { i: "news-globe", x: 0, y: 0, w: 300, h: 140, minW: 150, minH: 70 },
    { i: "news-terminal", x: 0, y: 140, w: 150, h: 72, minW: 80, minH: 56 },
    { i: "news-compliance", x: 0, y: 212, w: 150, h: 66, minW: 80, minH: 56 },
    { i: "news-predictions", x: 0, y: 278, w: 150, h: 150, minW: 75, minH: 72 },
    ...buildVideoLayouts(150, 140, 150, 110),
    // Fill blank area to the right of predictions (x=150..300, y=358..508)
    ...buildCatLayouts(300, 358, 75, 75, 150, 0, 4),
    ...buildCatLayouts(300, 508, 75, 72, 0, 4),
  ],
  sm: [
    { i: "news-globe", x: 0, y: 0, w: 180, h: 120, minW: 90, minH: 60 },
    { i: "news-terminal", x: 0, y: 120, w: 90, h: 80, minH: 64 },
    { i: "news-compliance", x: 90, y: 120, w: 90, h: 80, minH: 56 },
    { i: "news-predictions", x: 0, y: 200, w: 90, h: 140, minH: 70 },
    ...buildVideoLayouts(90, 200, 90, 180),
    ...buildCatLayouts(180, 530, 60, 70),
  ],
  xs: [
    { i: "news-globe", x: 0, y: 0, w: 60, h: 100, minH: 60 },
    { i: "news-terminal", x: 0, y: 100, w: 60, h: 88, minH: 72 },
    { i: "news-predictions", x: 0, y: 188, w: 60, h: 160, minH: 80 },
    { i: "news-compliance", x: 0, y: 348, w: 60, h: 80, minH: 56 },
    ...buildVideoLayouts(0, 428, 60, 220),
    ...buildCatLayouts(60, 812, 60, 70),
  ],
};
const GLOBE_CENTRIC_NEWS_LAYOUTS: DashboardLayouts = {
  lg: [
    { i: "news-globe", x: 0, y: 0, w: 360, h: 190, minW: 180, minH: 100 },
    ...buildVideoRowLayouts(0, 190, 360, 120),
    { i: "news-terminal", x: 0, y: 310, w: 120, h: 80, minW: 80, minH: 64 },
    { i: "news-compliance", x: 120, y: 310, w: 120, h: 80, minW: 80, minH: 64 },
    { i: "news-predictions", x: 0, y: 390, w: 180, h: 180, minW: 90, minH: 80 },
    // Fill blank area to the right of predictions (x=180..360, y=390..570)
    ...buildCatLayouts(360, 390, 90, 90, 180, 0, 4),
    ...buildCatLayouts(360, 570, 90, 80, 0, 4),
  ],
  md: [
    { i: "news-globe", x: 0, y: 0, w: 300, h: 160, minW: 150, minH: 80 },
    { i: "news-terminal", x: 0, y: 160, w: 100, h: 72, minW: 70, minH: 56 },
    { i: "news-compliance", x: 0, y: 232, w: 100, h: 66, minW: 70, minH: 56 },
    { i: "news-predictions", x: 0, y: 320, w: 150, h: 150, minW: 75, minH: 72 },
    ...buildVideoLayouts(100, 160, 200, 110),
    // Fill blank area to the right of predictions (x=150..300, y=378..528)
    ...buildCatLayouts(300, 378, 75, 75, 150, 0, 4),
    ...buildCatLayouts(300, 528, 75, 72, 0, 4),
  ],
  sm: DEFAULT_NEWS_PANEL_LAYOUTS.sm,
  xs: DEFAULT_NEWS_PANEL_LAYOUTS.xs,
};
const SPLIT_NEWS_LAYOUTS: DashboardLayouts = {
  lg: [
    { i: "news-globe", x: 0, y: 0, w: 360, h: 165, minW: 180, minH: 80 },
    ...buildVideoRowLayouts(0, 165, 360, 120),
    { i: "news-terminal", x: 0, y: 285, w: 180, h: 80, minW: 90, minH: 64 },
    { i: "news-compliance", x: 180, y: 285, w: 180, h: 80, minW: 90, minH: 64 },
    { i: "news-predictions", x: 0, y: 365, w: 180, h: 180, minW: 90, minH: 80 },
    // Fill blank area to the right of predictions (x=180..360, y=365..545)
    ...buildCatLayouts(360, 365, 90, 90, 180, 0, 4),
    ...buildCatLayouts(360, 545, 90, 80, 0, 4),
  ],
  md: [
    { i: "news-globe", x: 0, y: 0, w: 300, h: 140, minW: 150, minH: 70 },
    { i: "news-terminal", x: 0, y: 140, w: 150, h: 72, minW: 80, minH: 56 },
    { i: "news-compliance", x: 0, y: 212, w: 150, h: 66, minW: 80, minH: 56 },
    { i: "news-predictions", x: 0, y: 278, w: 150, h: 150, minW: 75, minH: 72 },
    ...buildVideoLayouts(150, 140, 150, 110),
    // Fill blank area to the right of predictions (x=150..300, y=358..508)
    ...buildCatLayouts(300, 358, 75, 75, 150, 0, 4),
    ...buildCatLayouts(300, 508, 75, 72, 0, 4),
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
    storyPopupArticle: null,
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
    categoryPanelHasArticles: {},
    panelZOrder: [...DEFAULT_NEWS_PANEL_ORDER],
    panelFocusId: null,
    layoutPreset: "news-centric",
    ui: {
      compactMode: true,
      focusedPanel: null,
      statusLine: "Ready.",
      showHelpHints: true,
      countryDock: {
        pinned: true,
        expanded: false,
        showQuickActions: true,
      },
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
      byPanel: {},
    },
    searchInView: false,
    cameraBounds: null,
    nuclearFilters: {
      types: [],
      statuses: [],
      searchText: "",
      inViewportOnly: false,
    },
    armsEmbargoFilters: {
      authorities: [],
      statuses: [],
      scopes: [],
      searchText: "",
      startYearRange: null,
      inViewportOnly: false,
    },
    ucdpFilters: {
      violenceTypes: ["state-based", "non-state", "one-sided"],
      minFatalities: 1,
      countries: [],
      yearRange: [new Date().getFullYear() - 1, new Date().getFullYear() - 1],
      inViewportOnly: false,
    },
    conflictFilters: { inViewportOnly: false },
    economicCenterFilters: {
      scoreThreshold: 40,
      mode: "balanced",
      regionFilter: [],
      viewportOnly: false,
      searchText: "",
    },
    aiDataCenterFilters: {
      confidenceThreshold: 40,
      importanceThreshold: 0,
      operatorFilter: [],
      operatorTypeFilter: [],
      viewportOnly: false,
      searchText: "",
    },
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
    layerToggles: { ...NEWS_LAYER_DEFAULT_TOGGLES },
    layerHealth: {},
    lastUpdated: null,
  };
}

function defaultLiveDataState(): LiveDataState {
  return {
    flights: [],
    military: [],
    earthquakes: [],
    disasters: [],
    spaceWeather: [],
    satellites: [],
    satelliteCatalog: [],
    cctv: [],
    scenes: [],
    airspaceAnomalies: [],
    disappearedFlights: [],
    lastUpdated: {
      opensky: null,
      military: null,
      earthquakes: null,
      gdacs: null,
      spaceWeather: null,
      satellites: null,
      cctv: null,
      scenes: null,
    },
    health: {
      opensky: "idle",
      military: "idle",
      earthquakes: "idle",
      gdacs: "idle",
      spaceWeather: "idle",
      satellites: "idle",
      cctv: "idle",
      scenes: "idle",
    },
    sourceHealth: {},
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
  const entries = Object.entries(input).filter(([k]) => k !== "news-video").map(([k, v]) => [k, Boolean(v)]);
  const hadVideo = Boolean(input["news-video"]);
  if (hadVideo) {
    LIVE_VIDEO_PANEL_IDS.forEach((id) => { entries.push([id, true]); });
  }
  return {
    ...DEFAULT_NEWS_PANEL_VISIBILITY,
    ...Object.fromEntries(entries),
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

function sanitizePersistedNewsVideoState(
  input: Partial<NewsVideoState> | undefined
): Partial<NewsVideoState> {
  const byPanelInput = input?.byPanel ?? {};
  const byPanel = Object.fromEntries(
    Object.entries(byPanelInput).map(([panelId, panelState]) => [
      panelId,
      {
        ...(panelState ?? {}),
        selectedVideoId: null,
        selectedChannelFilter: null,
        manualUrl: "",
      },
    ])
  ) as NewsVideoState["byPanel"];

  return {
    ...(input ?? {}),
    selectedVideoId: null,
    selectedChannelId: null,
    selectedChannelFilter: null,
    manualUrl: "",
    byPanel,
  };
}

function normalizeTopOffset(layouts: DashboardLayouts): DashboardLayouts {
  const breakpoints: Array<keyof DashboardLayouts> = ["lg", "md", "sm", "xs"];
  const next = { ...layouts } as DashboardLayouts;

  for (const bp of breakpoints) {
    const items = (next[bp] ?? []).map((item) => ({ ...item }));
    if (!items.length) {
      next[bp] = items;
      continue;
    }

    const minY = Math.min(
      ...items.map((item) => (Number.isFinite(item.y) ? Number(item.y) : 0))
    );
    if (minY > 0) {
      for (const item of items) {
        item.y = Math.max(0, item.y - minY);
      }
    }
    next[bp] = items;
  }

  return next;
}

function migrateVideoPanelsBelowMap(layouts: DashboardLayouts): DashboardLayouts {
  const breakpoints: Array<keyof DashboardLayouts> = ["lg", "md", "sm", "xs"];
  const next = { ...layouts } as DashboardLayouts;

  for (const bp of breakpoints) {
    const items = (next[bp] ?? []).map((item) => ({ ...item }));
    const globe = items.find((item) => item.i === "news-globe");
    if (!globe) {
      next[bp] = items;
      continue;
    }

    const videoItems = items.filter((item) => LIVE_VIDEO_PANEL_ID_SET.has(item.i));
    if (!videoItems.length) {
      next[bp] = items;
      continue;
    }

    const globeBottom = globe.y + globe.h;
    const videoMinY = Math.min(...videoItems.map((item) => item.y));
    if (videoMinY >= globeBottom) {
      next[bp] = items;
      continue;
    }

    const videoMaxBottom = Math.max(...videoItems.map((item) => item.y + item.h));
    const videoSpan = Math.max(0, videoMaxBottom - videoMinY);
    const shiftToMapBottom = globeBottom - videoMinY;

    for (const item of items) {
      if (item.i === "news-globe") continue;
      if (LIVE_VIDEO_PANEL_ID_SET.has(item.i)) {
        item.y = Math.max(globeBottom, item.y + shiftToMapBottom);
        continue;
      }
      if (item.y >= globeBottom) {
        item.y += videoSpan;
      }
    }

    next[bp] = items;
  }

  return normalizeTopOffset(next);
}

function readLegacyState(): Partial<SIGINTStore> | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem("sigint-store-v1");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      state?: Partial<SIGINTStore>;
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
    disasters: true,
    cctv: false,
    tradeRoutes: false,
    gpsJam: false,
    airspaceAnomaly: true,
    volcanoes: false,
    nuclearSites: false,
    militaryBases: false,
    countryBorders: true,
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
    brokenIds: {},
  },
  scenes: [],
  savedScenes: [],
  currentSceneIdx: -1,
  debug: { fps: 0, entityCount: 0, memoryMB: 0 },
  dashboard: defaultDashboardState(),
  liveData: defaultLiveDataState(),
  news: defaultNewsState(),
  tradeRouteSelection: defaultTradeRouteSelection(),
  activePopup: null,
  layerFilters: { timeWindow: "24h" as const, minSeverity: 0, viewportBound: false },
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
      brokenIds: {},
    },
    dashboard: {
      ...state.dashboard,
      ...(legacy.dashboard ?? {}),
    },
    news: { ...state.news, ...(legacy.news ?? {}) },
  };
}

export const useSIGINTStore = create<SIGINTStore>()(
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
          set((s) => ({
            cctv: {
              ...s.cctv,
              cameras,
              // Drop any broken markers for cameras that no longer exist.
              brokenIds: Object.fromEntries(
                Object.entries(s.cctv.brokenIds).filter(([id]) =>
                  cameras.some((cam) => cam.id === id)
                )
              ),
            },
          })),

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

        markCctvBroken: (id) =>
          set((s) => ({
            cctv: {
              ...s.cctv,
              brokenIds: { ...s.cctv.brokenIds, [id]: true },
            },
          })),

        resetCctvHealth: () =>
          set((s) => ({
            cctv: {
              ...s.cctv,
              brokenIds: {},
            },
          })),

        setDebug: (partial) => set((s) => ({ debug: { ...s.debug, ...partial } })),

        setActiveView: (view) =>
          set((s) => ({ dashboard: { ...s.dashboard, activeView: view } })),

        setDensity: (density) =>
          set((s) => ({ dashboard: { ...s.dashboard, density } })),

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

        setLiveDisasters: (disasters) =>
          set((s) => ({
            liveData: {
              ...s.liveData,
              disasters,
            },
          })),

        setLiveSpaceWeather: (spaceWeather) =>
          set((s) => ({
            liveData: {
              ...s.liveData,
              spaceWeather,
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

        setAirspaceAnomalies: (airspaceAnomalies) =>
          set((s) => ({
            liveData: {
              ...s.liveData,
              airspaceAnomalies,
            },
          })),

        setDisappearedFlights: (disappearedFlights) =>
          set((s) => ({
            liveData: {
              ...s.liveData,
              disappearedFlights,
            },
          })),

        setFeedHealth: (source, health) =>
          set((s) => ({
            liveData: {
              ...s.liveData,
              health: { ...s.liveData.health, [source]: health },
            },
          })),

        setOpsSourceHealth: (source, state) =>
          set((s) => ({
            liveData: {
              ...s.liveData,
              sourceHealth: {
                ...s.liveData.sourceHealth,
                [source]: state,
              },
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
                current.disasters.length +
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

        setStoryPopupArticle: (storyPopupArticle) =>
          set((s) => ({
            news: { ...s.news, storyPopupArticle },
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

        setNuclearFilters: (partial) =>
          set((s) => ({
            news: {
              ...s.news,
              nuclearFilters: { ...s.news.nuclearFilters, ...partial },
            },
          })),

        setArmsEmbargoFilters: (partial) =>
          set((s) => ({
            news: {
              ...s.news,
              armsEmbargoFilters: { ...s.news.armsEmbargoFilters, ...partial },
            },
          })),

        setUcdpFilters: (partial) =>
          set((s) => ({
            news: {
              ...s.news,
              ucdpFilters: { ...s.news.ucdpFilters, ...partial },
            },
          })),

        setConflictFilters: (partial) =>
          set((s) => ({
            news: {
              ...s.news,
              conflictFilters: { ...s.news.conflictFilters, ...partial },
            },
          })),

        setEconomicCenterFilters: (partial) =>
          set((s) => ({
            news: {
              ...s.news,
              economicCenterFilters: { ...s.news.economicCenterFilters, ...partial },
            },
          })),

        setAiDataCenterFilters: (partial) =>
          set((s) => ({
            news: {
              ...s.news,
              aiDataCenterFilters: { ...s.news.aiDataCenterFilters, ...partial },
            },
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

        setNewsCategoryPanelHasArticles: (panelId, hasArticles) =>
          set((s) => ({
            news: {
              ...s.news,
              categoryPanelHasArticles: { ...s.news.categoryPanelHasArticles, [panelId]: hasArticles },
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

        setNewsVideoPanelState: (panelId, partial) =>
          set((s) => {
            const byPanel = s.news.video.byPanel ?? {};
            return {
              news: {
                ...s.news,
                video: {
                  ...s.news.video,
                  byPanel: {
                    ...byPanel,
                    [panelId]: {
                      selectedVideoId: null,
                      selectedChannelFilter: null,
                      manualUrl: "",
                      ...byPanel[panelId],
                      ...partial,
                    },
                  },
                },
              },
            };
          }),

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

        setNewsLayerToggle: (layerId, enabled) =>
          set((s) => {
            const next = { ...s.news.layerToggles, [layerId]: enabled };
            if (layerId === "trade-routes") next["trade-route-nodes"] = enabled;
            return { news: { ...s.news, layerToggles: next } };
          }),

        setNewsLayerHealth: (layerId, health) =>
          set((s) => ({
            news: {
              ...s.news,
              layerHealth: { ...s.news.layerHealth, [layerId]: health },
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
              layerHealth: {},
              lastUpdated: null,
              selectedStoryId: null,
              selectedCountry: null,
              highlightedMarkerId: null,
              storyPopupArticle: null,
              queryState: defaultNewsState().queryState,
              ui: { ...s.news.ui, statusLine: "Ready." },
            },
          })),

        setTradeRouteSelection: (partial) =>
          set((s) => ({
            tradeRouteSelection: { ...s.tradeRouteSelection, ...partial },
          })),

        setTradeRouteCategoryFilter: (category, enabled) =>
          set((s) => ({
            tradeRouteSelection: {
              ...s.tradeRouteSelection,
              categoryFilters: {
                ...s.tradeRouteSelection.categoryFilters,
                [category]: enabled,
              },
            },
          })),

        setTradeRouteDisruptions: (signals) =>
          set((s) => ({
            tradeRouteSelection: {
              ...s.tradeRouteSelection,
              disruptionSignals: signals,
            },
          })),

        clearTradeRouteSelection: () =>
          set(() => ({
            tradeRouteSelection: defaultTradeRouteSelection(),
          })),

        setActivePopup: (event) => set(() => ({ activePopup: event })),
        setLayerFilters: (partial) => set((s) => ({ layerFilters: { ...s.layerFilters, ...partial } })),
      };
    }),
    {
      name: "sigint-store-v2",
      version: 15,
      migrate: (persistedState) => {
        const state = persistedState as
          | {
              dashboard?: Partial<DashboardState>;
              news?: Partial<NewsState>;
            }
          | undefined;
        if (!state) return persistedState;

        const dashboardInput = state.dashboard ?? {};
        const activeView = dashboardInput.activeView === "news" ? "news" : dashboardInput.activeView === "market" ? "market" : "ops";
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
        const persisted = (persistedState ?? {}) as Partial<SIGINTStore>;
        const current = currentState as SIGINTStore;

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
        const nextNewsLayouts = migrateVideoPanelsBelowMap(
          sanitizeLayouts(
            persistedNews.panelLayouts as DashboardLayouts | undefined,
            NEWS_PANEL_LAYOUT_PRESETS[layoutPreset]
          )
        );
        const persistedVideo = sanitizePersistedNewsVideoState(persistedNews.video);

        return {
          ...current,
          ...persisted,
          layers: {
            ...current.layers,
            ...(persisted.layers ?? {}),
          },
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
              ...persistedVideo,
            },
            headlineTape: {
              ...current.news.headlineTape,
              ...(persistedNews.headlineTape ?? {}),
            },
            panelLayouts: nextNewsLayouts,
            panelVisibility: nextNewsVisibility,
            panelLocks: nextNewsLocks,
            panelZOrder: sanitizeNewsPanelZOrder(
              persistedNews.panelZOrder,
              nextNewsVisibility
            ),
            layerToggles: {
              ...current.news.layerToggles,
              ...(persistedNews.layerToggles ?? {}),
            },
            layerHealth: {},
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
          brokenIds: {},
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
            countryDock: s.news.ui.countryDock,
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
          video: sanitizePersistedNewsVideoState(s.news.video),
          searchInView: s.news.searchInView,
          headlineTape: s.news.headlineTape,
          layerToggles: s.news.layerToggles,
        },
        tradeRouteSelection: {
          ...defaultTradeRouteSelection(),
          categoryFilters: s.tradeRouteSelection.categoryFilters,
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

