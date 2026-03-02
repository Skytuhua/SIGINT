import type { DisasterAlert, SpaceWeatherAlert } from "../../providers/types";

export interface SourceHealthSnapshot {
  status: "live" | "cached" | "degraded" | "unavailable";
  lastSuccessAt: number | null;
  errorCode: string | null;
  nextRetryAt: number | null;
}

export interface GdacsRawItem {
  guid?: string;
  title?: string;
  description?: string;
  link?: string;
  pubDate?: string;
  category?: string;
  "gdacs:eventtype"?: string;
  "gdacs:eventid"?: string;
  "gdacs:episodeid"?: string;
  "gdacs:country"?: string;
  "gdacs:alertlevel"?: string;
  "gdacs:severity"?: string;
  "gdacs:fromdate"?: string;
  "gdacs:todate"?: string;
  "gdacs:datemodified"?: string;
  "geo:lat"?: string | number;
  "geo:long"?: string | number;
  [key: string]: unknown;
}

export interface SwpcRawItem {
  product_id?: string;
  issue_datetime?: string;
  message?: string;
  [key: string]: unknown;
}

export interface NormalizedOpsPayload<T> {
  source: string;
  items: T[];
  fetchedAt: number;
  etag?: string | null;
  lastModified?: string | null;
}

export interface OpsFetchResult<T> {
  source: string;
  items: T[];
  status: "live" | "cached" | "degraded" | "unavailable";
  fetchedAt: number;
  cacheHit: boolean;
  errorCode?: string | null;
  etag?: string | null;
  lastModified?: string | null;
}

export type DisasterPayload = NormalizedOpsPayload<DisasterAlert>;
export type SpaceWeatherPayload = NormalizedOpsPayload<SpaceWeatherAlert>;
