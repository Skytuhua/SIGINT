/* ── Shared TypeScript interfaces for market data ────────────────────────── */

/** Single quote returned by Yahoo Finance */
export interface QuoteData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  prevClose: number;
  volume: number;
  marketCap?: number;
  dayHigh: number;
  dayLow: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  ytdReturn?: number;
  /** Market state: PRE, REGULAR, POST, CLOSED */
  marketState?: string;
}

/** Batched quotes response */
export interface QuotesResponse {
  quotes: Record<string, QuoteData>;
  degraded: boolean;
  timestamp: string;
}

/** Top mover row */
export interface MoverRow {
  sym: string;
  name: string;
  pct: number;
  price: string;
  volMult: string;
  reason: string;
  mcapB?: number;
}

/** Top movers response */
export interface MoversResponse {
  gainers: MoverRow[];
  losers: MoverRow[];
  degraded: boolean;
  timestamp: string;
}

/** Historical closes for correlation computation */
export interface HistoricalResponse {
  /** symbol → array of daily closes (most recent last) */
  series: Record<string, number[]>;
  /** 6×6 Pearson correlation matrix */
  correlations: number[][];
  assets: string[];
  degraded: boolean;
}

/** Earnings calendar entry */
export interface EarningsEntry {
  date: string;
  time: "BMO" | "AMC" | "TNS" | string;
  sym: string;
  company: string;
  epsEst: string;
  epsAct?: string;
  surprise?: "beat" | "miss" | "in-line" | null;
  mktCapB?: string;
}

/** Earnings response */
export interface EarningsResponse {
  upcoming: EarningsEntry[];
  recent: EarningsEntry[];
  degraded: boolean;
}

/** News headline */
export interface NewsHeadline {
  category: string;
  categoryColor: string;
  ticker?: string;
  headline: string;
  ts: string;
  url?: string;
  source?: string;
}

/** News response */
export interface NewsResponse {
  headlines: NewsHeadline[];
  degraded: boolean;
}
