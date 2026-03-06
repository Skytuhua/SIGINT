import type { NewsCameraBounds } from "../news/types";
import type { LayerFeatureCollection } from "./types";

export interface ConflictFilters {
  inViewportOnly: boolean;
}

export function applyConflictZoneFilters(
  data: LayerFeatureCollection,
  filters: ConflictFilters | null | undefined,
  cameraBounds: NewsCameraBounds | null
): LayerFeatureCollection {
  if (!filters) return data;
  if (!filters.inViewportOnly || !cameraBounds) return data;

  const filtered = data.features.filter((feature) => {
    const props = feature.properties as Record<string, unknown>;
    const centLon = Number(props.centroidLon ?? NaN);
    const centLat = Number(props.centroidLat ?? NaN);
    return (
      Number.isFinite(centLat) &&
      Number.isFinite(centLon) &&
      centLon >= cameraBounds.west &&
      centLon <= cameraBounds.east &&
      centLat >= cameraBounds.south &&
      centLat <= cameraBounds.north
    );
  });

  return { type: "FeatureCollection", features: filtered };
}
