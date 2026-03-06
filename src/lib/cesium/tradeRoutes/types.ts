export type TradeRouteCategory = "container" | "energy" | "bulk" | "strategic";

export type TradeNodeType = "hub" | "chokepoint" | "waypoint";

export interface TradeRouteNode {
  id: string;
  name: string;
  type: TradeNodeType;
  lat: number;
  lon: number;
  country?: string;
  wikidataId?: string;
  osmId?: string;
  // Enrichment
  summary?: string;
  // Hub-specific
  topExports?: string[];
  topImports?: string[];
  throughput?: string;
  globalRank?: string;
  // Chokepoint-specific
  dailyVessels?: number;
  tradeSharePct?: string;
  widthKm?: number;
  primaryCommodities?: string[];
  controlledBy?: string;
}

export interface TradeRoute {
  id: string;
  name: string;
  category: TradeRouteCategory;
  importance: 1 | 2 | 3 | 4 | 5;
  startHub: string;
  endHub: string;
  /** Ordered node IDs forming the waypoint chain (inclusive of start/end). */
  waypoints: string[];
  whyItMatters: string;
  keyChokepoints: string[];
  sourceTrace: string[];
}

export interface TradeRouteGraph {
  nodes: TradeRouteNode[];
  routes: TradeRoute[];
}

export interface DisruptionSignal {
  chokepoint: string;
  headlines: { title: string; url: string; date: string }[];
}

export interface TradeRouteSelectionState {
  selectedRouteId: string | null;
  selectedNodeId: string | null;
  hoveredRouteId: string | null;
  hoveredNodeId: string | null;
  categoryFilters: Record<TradeRouteCategory, boolean>;
  disruptionSignals: DisruptionSignal[];
}

export const CATEGORY_COLORS: Record<TradeRouteCategory, string> = {
  container: "#4fc3f7",
  energy: "#ffab40",
  bulk: "#76ff03",
  strategic: "#ea80fc",
};

export const CATEGORY_LABELS: Record<TradeRouteCategory, string> = {
  container: "Container",
  energy: "Energy",
  bulk: "Bulk",
  strategic: "Strategic",
};

export const ALL_CATEGORIES: TradeRouteCategory[] = [
  "container",
  "energy",
  "bulk",
  "strategic",
];

export function defaultTradeRouteSelection(): TradeRouteSelectionState {
  return {
    selectedRouteId: null,
    selectedNodeId: null,
    hoveredRouteId: null,
    hoveredNodeId: null,
    categoryFilters: { container: true, energy: true, bulk: true, strategic: true },
    disruptionSignals: [],
  };
}
