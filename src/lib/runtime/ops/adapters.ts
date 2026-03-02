import type { DisasterAlert, SpaceWeatherAlert } from "../../providers/types";
import { GDACS_MAX_ITEMS } from "./gdacsNormalizer";
import { SPACE_WEATHER_MAX_ITEMS } from "./spaceWeatherNormalizer";
import { mergeByCanonicalId } from "./mergePolicy";

export interface GdacsRouteResponse {
  source: "gdacs";
  items: DisasterAlert[];
  fetchedAt: number;
  status: "live" | "cached" | "degraded" | "unavailable";
  etag: string | null;
  lastModified: string | null;
  errorCode: string | null;
}

export interface SpaceWeatherRouteResponse {
  source: "spaceWeather";
  items: SpaceWeatherAlert[];
  fetchedAt: number;
  status: "live" | "cached" | "degraded" | "unavailable";
  etag: string | null;
  lastModified: string | null;
  errorCode: string | null;
}

export function adaptGdacsResponse(
  payload: GdacsRouteResponse,
  existing: DisasterAlert[] = []
): DisasterAlert[] {
  const incoming = (payload.items ?? []).filter(
    (item) =>
      item &&
      typeof item.id === "string" &&
      typeof item.upstreamId === "string" &&
      Number.isFinite(item.lat) &&
      Number.isFinite(item.lon) &&
      Number.isFinite(item.updatedAt)
  );
  return mergeByCanonicalId(existing, incoming, {
    source: "gdacs",
    maxItems: GDACS_MAX_ITEMS,
    getUpstreamId: (item) => item.upstreamId,
    getUpdatedAt: (item) => item.updatedAt,
  });
}

export function adaptSpaceWeatherResponse(
  payload: SpaceWeatherRouteResponse,
  existing: SpaceWeatherAlert[] = []
): SpaceWeatherAlert[] {
  const incoming = (payload.items ?? []).filter(
    (item) =>
      item &&
      typeof item.id === "string" &&
      typeof item.upstreamId === "string" &&
      typeof item.rawMessage === "string" &&
      Number.isFinite(item.issueDatetime)
  );
  return mergeByCanonicalId(existing, incoming, {
    source: "swpc",
    maxItems: SPACE_WEATHER_MAX_ITEMS,
    getUpstreamId: (item) => item.upstreamId,
    getUpdatedAt: (item) => item.issueDatetime,
  });
}
