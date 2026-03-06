export type UcdpViolenceType = "state-based" | "non-state" | "one-sided";

export interface UcdpEvent {
  id: string;
  type: "ucdp_event";
  violenceType: UcdpViolenceType;
  conflictId: number;
  conflictName: string;
  actor1Name: string;
  actor2Name: string | null;
  country: string;
  admin1: string;
  locationName: string;
  lat: number;
  lon: number;
  date: string;
  year: number;
  fatalities_best: number;
  fatalities_low: number;
  fatalities_high: number;
  sourceDatasetVersion: string;
  sourceName: "UCDP GED";
  sourceUrl: string;
  lastUpdated: number;
}

export interface UcdpQueryParams {
  fromYear?: number;
  toYear?: number;
  countries?: string[];
  violenceTypes?: UcdpViolenceType[];
  minFatalities?: number;
  viewport?: { west: number; south: number; east: number; north: number };
}

export interface UcdpStoreMeta {
  datasetVersion: string;
  releaseDate: string;
  coverage: { fromYear: number; toYear: number };
  lastRefreshedAt: number;
  totalEvents: number;
  status: "live" | "cached" | "degraded" | "unavailable";
}
