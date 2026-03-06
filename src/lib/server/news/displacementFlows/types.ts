export type FlowType = "refugee" | "idp";
export type FlowCause = "conflict" | "disaster" | "other";
export type FlowConfidence = "measured" | "estimated";
export type SourceStatus = "live" | "cached" | "degraded" | "unavailable";

export interface DisplacementFlow {
  id: string;
  flowType: FlowType;
  corridorName: string;
  originName: string;
  originIso3: string;
  originLat: number;
  originLon: number;
  destinationName: string;
  destinationIso3: string;
  destLat: number;
  destLon: number;
  value: number;
  valueFormatted: string;
  unit: "individuals";
  cause?: FlowCause;
  confidence: FlowConfidence;
  timeRangeFrom: string;
  timeRangeTo: string;
  sourceName: string;
  sourceUrl: string;
  corroboratedValue?: number;
  corroboratedSource?: string;
  lastUpdated: number;
  ts: number;
}

export interface DisplacementFlowParams {
  mode?: "all" | "refugee" | "idp";
  cause?: string[];
  minVolume?: number;
  originRegion?: string[];
  destRegion?: string[];
  maxFeatures?: number;
}

export interface DisplacementFlowSourceStatus {
  unhcr: SourceStatus;
  idmc: SourceStatus;
}

export interface DisplacementFlowLayerResult {
  flows: DisplacementFlow[];
  sourceStatus: DisplacementFlowSourceStatus;
  dataYear: number;
  lastRefreshed: number;
}
