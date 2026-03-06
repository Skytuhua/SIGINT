export interface WorldEvent {
  id: string;
  type: string;
  subtype?: string;
  lat: number;
  lon: number;
  geometry?: {
    type: "Point" | "LineString" | "Polygon";
    coordinates: unknown;
  };
  startTime: number;
  endTime?: number;
  severity?: number;
  headline: string;
  summary?: string;
  sourceName: string;
  sourceUrl?: string;
  raw?: unknown;
}

export type TimeWindow = "6h" | "24h" | "7d";

export function timeWindowMs(tw: TimeWindow): number {
  switch (tw) {
    case "6h":
      return 6 * 60 * 60_000;
    case "24h":
      return 24 * 60 * 60_000;
    case "7d":
      return 7 * 24 * 60 * 60_000;
  }
}
