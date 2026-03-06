import type { LayerFeatureCollection } from "../../../newsLayers/types";
import { runConflictZonesPipeline } from "./pipeline";
import type { ConflictZoneTimeWindow } from "./types";

export interface GetConflictZonesParams {
  origin: string;
  requestUrl: string;
}

export interface GetConflictZonesResult {
  collection: LayerFeatureCollection;
  sourceStatus: {
    gdeltEvents: "live" | "cached" | "degraded" | "unavailable";
    gdeltGeo: "live" | "cached" | "degraded" | "unavailable";
    ucdpGed: "live" | "cached" | "degraded" | "unavailable";
  };
  lastRefreshedAt: number;
}

export async function getConflictZonesLayer(
  params: GetConflictZonesParams
): Promise<GetConflictZonesResult> {
  const url = new URL(params.requestUrl, params.origin);
  const timeWindow = (url.searchParams.get("timeWindow") ?? "7d") as ConflictZoneTimeWindow;
  const validWindows: ConflictZoneTimeWindow[] = ["6h", "24h", "7d", "30d", "90d"];
  const tw = validWindows.includes(timeWindow) ? timeWindow : "7d";
  const mode = url.searchParams.get("mode") === "broad" ? "broad" : "strict";
  const includeUcdp = url.searchParams.get("verifiedOverlay") === "1" || url.searchParams.get("verifiedOverlay") === "true";

  const west = url.searchParams.get("west");
  const south = url.searchParams.get("south");
  const east = url.searchParams.get("east");
  const north = url.searchParams.get("north");
  const viewport =
    west != null && south != null && east != null && north != null
      ? {
          west: parseFloat(west),
          south: parseFloat(south),
          east: parseFloat(east),
          north: parseFloat(north),
        }
      : undefined;

  const result = await runConflictZonesPipeline({
    origin: params.origin,
    timeWindow: tw,
    mode,
    includeUcdp,
    viewport,
  });

  return result;
}
