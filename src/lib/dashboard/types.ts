import type { EntityData, Flight, Earthquake, CctvCamera, Scene, PropagatedSat, Satellite } from "../providers/types";
import type { ColumnFiltersState, ColumnSizingState, SortingState } from "@tanstack/react-table";

export type DashboardView = "ops" | "news";
// Kept for persistence compatibility. Runtime is enforced to "ultra".
export type DashboardDensity = "comfortable" | "dense" | "ultra";
export type InspectorTab = "summary" | "history" | "related" | "notes";
export type FeedLevel = "info" | "warn" | "error";
export type FeedHealth = "idle" | "loading" | "ok" | "stale" | "error";

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
  satellites: PropagatedSat[];
  satelliteCatalog: Satellite[];
  cctv: CctvCamera[];
  scenes: Scene[];
  lastUpdated: Record<string, number | null>;
  health: Record<string, FeedHealth>;
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

export const DEFAULT_PANEL_IDS = ["kpi", "flight-table", "quake-table", "sat-list", "feed"] as const;

export const DEFAULT_PANEL_LAYOUTS: DashboardLayouts = {
  lg: [
    { i: "kpi", x: 0, y: 0, w: 360, h: 24, minW: 180, minH: 24, maxH: 36 },
    { i: "flight-table", x: 0, y: 24, w: 180, h: 108, minW: 90, minH: 72 },
    { i: "quake-table", x: 180, y: 24, w: 180, h: 108, minW: 90, minH: 72 },
    { i: "sat-list", x: 0, y: 132, w: 210, h: 96, minW: 90, minH: 60 },
    { i: "feed", x: 210, y: 132, w: 150, h: 96, minW: 90, minH: 48 },
  ],
  md: [
    { i: "kpi", x: 0, y: 0, w: 300, h: 24, maxH: 36 },
    { i: "flight-table", x: 0, y: 24, w: 150, h: 108, minH: 72 },
    { i: "quake-table", x: 150, y: 24, w: 150, h: 108, minH: 72 },
    { i: "sat-list", x: 0, y: 132, w: 180, h: 96, minH: 60 },
    { i: "feed", x: 180, y: 132, w: 120, h: 96, minH: 48 },
  ],
  sm: [
    { i: "kpi", x: 0, y: 0, w: 180, h: 24, maxH: 36 },
    { i: "flight-table", x: 0, y: 24, w: 180, h: 96, minH: 72 },
    { i: "quake-table", x: 0, y: 120, w: 180, h: 96, minH: 72 },
    { i: "sat-list", x: 0, y: 216, w: 180, h: 96, minH: 60 },
    { i: "feed", x: 0, y: 312, w: 180, h: 72, minH: 48 },
  ],
  xs: [
    { i: "kpi", x: 0, y: 0, w: 60, h: 24, maxH: 36 },
    { i: "flight-table", x: 0, y: 24, w: 60, h: 96, minH: 72 },
    { i: "quake-table", x: 0, y: 120, w: 60, h: 96, minH: 72 },
    { i: "sat-list", x: 0, y: 216, w: 60, h: 96, minH: 60 },
    { i: "feed", x: 0, y: 312, w: 60, h: 72, minH: 48 },
  ],
};
