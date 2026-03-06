import type { DisplacementFlowLayerResult, DisplacementFlowParams, DisplacementFlowSourceStatus } from "./types";
import { fetchUnhcrFlows } from "./unhcr";
import { fetchIdmcFlows } from "./idmc";
import { mergeFlows, toFeature } from "./pipeline";

type GenericFeature = {
  type: "Feature";
  id?: string | number;
  geometry: { type: string; coordinates: unknown };
  properties?: Record<string, unknown>;
};

type GenericFeatureCollection = {
  type: "FeatureCollection";
  features: GenericFeature[];
};

export type { DisplacementFlowLayerResult };

export async function getDisplacementFlowsLayer(params: DisplacementFlowParams): Promise<{
  collection: GenericFeatureCollection;
  sourceStatus: DisplacementFlowSourceStatus;
  dataYear: number;
  lastRefreshed: number;
}> {
  const [unhcrResult, idmcResult] = await Promise.allSettled([
    fetchUnhcrFlows(),
    fetchIdmcFlows(),
  ]);

  const unhcrStatus =
    unhcrResult.status === "fulfilled"
      ? unhcrResult.value.status
      : ("unavailable" as const);
  const idmcStatus =
    idmcResult.status === "fulfilled"
      ? idmcResult.value.status
      : ("unavailable" as const);

  const unhcrFlows =
    unhcrResult.status === "fulfilled" ? unhcrResult.value.flows : [];
  const idmcFlows =
    idmcResult.status === "fulfilled" ? idmcResult.value.flows : [];
  const dataYear =
    unhcrResult.status === "fulfilled" ? unhcrResult.value.dataYear : new Date().getFullYear() - 1;

  const merged = mergeFlows(unhcrFlows, idmcFlows, params);
  const features = merged.map(toFeature) as GenericFeature[];

  return {
    collection: { type: "FeatureCollection", features },
    sourceStatus: { unhcr: unhcrStatus, idmc: idmcStatus },
    dataYear,
    lastRefreshed: Date.now(),
  };
}
