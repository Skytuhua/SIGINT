import type {
  EntityData,
  Flight,
  Earthquake,
  CctvCamera,
  Scene,
  PropagatedSat,
  Satellite,
  DisasterAlert,
  SpaceWeatherAlert,
} from "../providers/types";
import type { ColumnFiltersState, ColumnSizingState, SortingState } from "@tanstack/react-table";

export type DashboardView = "ops" | "news" | "market";
// Kept for persistence compatibility. Runtime is enforced to "ultra".
export type DashboardDensity = "comfortable" | "dense" | "ultra";
export type InspectorTab = "summary" | "history" | "related" | "notes";
export type FeedLevel = "info" | "warn" | "error";
export type FeedHealth = "idle" | "loading" | "ok" | "stale" | "error";
export type SourceHealthStatus = "live" | "cached" | "degraded" | "unavailable";

export interface SourceHealthState {
  status: SourceHealthStatus;
  lastSuccessAt: number | null;
  errorCode: string | null;
  nextRetryAt: number | null;
}

export interface FeedLogItem {
  id: string;
  source: string;
  message: string;
  level: FeedLevel;
  ts: number;
}

export interface TrendHistory {
  timeline: number[];
  entityCount: number[];
  flightCount: number[];
  militaryCount: number[];
  quakeAvgMag: number[];
}

export interface DashboardInspectorState {
  open: boolean;
  pinned: boolean;
  splitView: boolean;
  tab: InspectorTab;
  entity: EntityData | null;
  notes: Record<string, string>;
}

export interface TablePreference {
  columnOrder: string[];
  columnSizing: ColumnSizingState;
  sorting: SortingState;
  filters: ColumnFiltersState;
  globalFilter: string;
  stickyFirstColumn: boolean;
}

export interface DashboardState {
  // Kept for persistence compatibility. Unified workspace always renders at runtime.
  activeView: DashboardView;
  density: DashboardDensity;
  inspector: DashboardInspectorState;
  panelLayouts: DashboardLayouts;
  panelVisibility: Record<string, boolean>;
  panelLocks: Record<string, boolean>;
  tablePrefs: Record<string, TablePreference>;
  panelFocusId: string | null;
  panelZOrder: string[];
  hotkeysEnabled: boolean;
}

export interface LiveDataState {
  flights: Flight[];
  military: Flight[];
  earthquakes: Earthquake[];
  disasters: DisasterAlert[];
  spaceWeather: SpaceWeatherAlert[];
  satellites: PropagatedSat[];
  satelliteCatalog: Satellite[];
  cctv: CctvCamera[];
  scenes: Scene[];
  airspaceAnomalies: import("../providers/types").AirspaceAnomalyZone[];
  disappearedFlights: import("../providers/types").DisappearedFlight[];
  lastUpdated: Record<string, number | null>;
  health: Record<string, FeedHealth>;
  sourceHealth: Record<string, SourceHealthState>;
  trendHistory: TrendHistory;
  feedLog: FeedLogItem[];
  refreshTick: number;
}

export type DashboardLayoutItem = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
};

export type DashboardLayouts = {
  lg: DashboardLayoutItem[];
  md: DashboardLayoutItem[];
  sm: DashboardLayoutItem[];
  xs: DashboardLayoutItem[];
};

export const DEFAULT_PANEL_IDS = [
  "kpi",
  "flight-table",
  "quake-table",
  "sat-list",
  "feed",
  "cctv-live",
  "space-weather",
  "threat-board",
  "source-health",
] as const;

export const DEFAULT_PANEL_LAYOUTS: DashboardLayouts = {
  lg: [
    { i: "kpi", x: 0, y: 0, w: 360, h: 24, minW: 180, minH: 24, maxH: 36 },
    { i: "cctv-live", x: 180, y: 24, w: 180, h: 120, minW: 180, minH: 96 },
    // Fill the left-hand side of the webcams row with the Ops feed.
    { i: "feed", x: 0, y: 24, w: 180, h: 120, minW: 90, minH: 96 },
    // Next row starts immediately below webcams / feed row (24 + 120 = 144).
    { i: "flight-table", x: 0, y: 144, w: 180, h: 108, minW: 90, minH: 72 },
    { i: "quake-table", x: 180, y: 144, w: 180, h: 108, minW: 90, minH: 72 },
    // Sat list + space weather share the bottom row side-by-side.
    { i: "sat-list", x: 0, y: 252, w: 180, h: 96, minW: 90, minH: 60 },
    { i: "space-weather", x: 180, y: 252, w: 180, h: 96, minW: 120, minH: 72 },
    { i: "threat-board", x: 0, y: 348, w: 180, h: 72, minW: 90, minH: 48 },
    { i: "source-health", x: 180, y: 348, w: 180, h: 72, minW: 90, minH: 48 },
  ],
  md: [
    { i: "kpi", x: 0, y: 0, w: 300, h: 24, maxH: 36 },
    // Medium layout: feed on the left, webcams on the right.
    { i: "cctv-live", x: 150, y: 24, w: 150, h: 120, minW: 150, minH: 96 },
    { i: "feed", x: 0, y: 24, w: 150, h: 120, minH: 96 },
    { i: "flight-table", x: 0, y: 144, w: 150, h: 108, minH: 72 },
    { i: "quake-table", x: 150, y: 144, w: 150, h: 108, minH: 72 },
    { i: "sat-list", x: 0, y: 252, w: 150, h: 96, minH: 60 },
    { i: "space-weather", x: 150, y: 252, w: 150, h: 96, minW: 120, minH: 72 },
    { i: "threat-board", x: 0, y: 348, w: 150, h: 72, minH: 48 },
    { i: "source-health", x: 150, y: 348, w: 150, h: 72, minH: 48 },
  ],
  sm: [
    { i: "kpi", x: 0, y: 0, w: 180, h: 24, maxH: 36 },
    // Small layout: keep webcams full-width for readability.
    { i: "cctv-live", x: 0, y: 24, w: 180, h: 120, minW: 120, minH: 96 },
    { i: "flight-table", x: 0, y: 144, w: 180, h: 96, minH: 72 },
    { i: "quake-table", x: 0, y: 240, w: 180, h: 96, minH: 72 },
    { i: "sat-list", x: 0, y: 336, w: 180, h: 96, minH: 60 },
    { i: "feed", x: 0, y: 432, w: 180, h: 120, minH: 96 },
    { i: "space-weather", x: 0, y: 552, w: 180, h: 96, minW: 120, minH: 72 },
    { i: "threat-board", x: 0, y: 648, w: 180, h: 72, minH: 48 },
    { i: "source-health", x: 0, y: 720, w: 180, h: 72, minH: 48 },
  ],
  xs: [
    { i: "kpi", x: 0, y: 0, w: 60, h: 24, maxH: 36 },
    { i: "flight-table", x: 0, y: 24, w: 60, h: 96, minH: 72 },
    { i: "quake-table", x: 0, y: 120, w: 60, h: 96, minH: 72 },
    { i: "sat-list", x: 0, y: 216, w: 60, h: 96, minH: 60 },
    { i: "feed", x: 0, y: 312, w: 60, h: 72, minH: 48 },
    { i: "cctv-live", x: 0, y: 384, w: 60, h: 140, minW: 60, minH: 110 },
    { i: "space-weather", x: 0, y: 524, w: 60, h: 96, minW: 60, minH: 72 },
    { i: "threat-board", x: 0, y: 620, w: 60, h: 72, minH: 48 },
    { i: "source-health", x: 0, y: 692, w: 60, h: 72, minH: 48 },
  ],
};
