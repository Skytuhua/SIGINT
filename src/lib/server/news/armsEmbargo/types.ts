export type ArmsEmbargoAuthority = "UNSC" | "EU" | "UK" | "US" | "Other";

export type ArmsEmbargoScope = "Full" | "Partial" | "Unknown";

export type ArmsEmbargoStatus = "Active" | "Ended" | "Unknown";

export interface ArmsEmbargoSource {
  sourceName: string;
  sourceUrl: string;
  sourceId?: string | null;
}

export interface ArmsEmbargoProgramme {
  id: string;
  name: string;
  authority: ArmsEmbargoAuthority;
  scope: ArmsEmbargoScope;
  measures: string[];
  startDate: string | null;
  endDate: string | null;
  status: ArmsEmbargoStatus;
  legalBasis: string | null;
  sources: ArmsEmbargoSource[];
  lastUpdated: string | null;
  targets: string[];
  wikidataQid?: string | null;
  programName?: string | null;
}

export interface ArmsEmbargoCountryAggregate {
  countryCode: string;
  countryLabel: string;
  programmes: ArmsEmbargoProgramme[];
  programmeCount: number;
  activeProgrammeCount: number;
  dominantStatus: ArmsEmbargoStatus;
  dominantScope: ArmsEmbargoScope;
}

export type EmbargoSourceKey =
  | "wikidata"
  | "un"
  | "eu"
  | "uk"
  | "us"
  | "snapshot";

export type EmbargoSourceStatusCode = "live" | "cached" | "degraded" | "unavailable";

export interface EmbargoSourceStatus {
  status: EmbargoSourceStatusCode;
  lastUpdated: number | null;
  errorCode: string | null;
  rowCount?: number;
  datasetVersion?: string | null;
}

export type EmbargoSourceStatusMap = Partial<
  Record<EmbargoSourceKey, EmbargoSourceStatus>
>;
