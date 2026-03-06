// ── Sanctions Entities: Normalized schema ──────────────────────────────────

export type SanctionsAuthority = "OFAC" | "EU" | "UK" | "UN";

export type SanctionsEntityType =
  | "Individual"
  | "Organization"
  | "Company"
  | "Bank"
  | "Vessel"
  | "Aircraft"
  | "Government"
  | "Other";

export type SanctionsEntityStatus = "Active" | "Removed" | "Unknown";

export type GeoConfidence = "High" | "Medium" | "Low";

export interface SanctionsEntityGeo {
  lat: number;
  lon: number;
  placeName: string | null;
  geoConfidence: GeoConfidence;
}

export interface SanctionsIdentifiers {
  ofacSdnId?: string | null;
  euId?: string | null;
  ukId?: string | null;
  unId?: string | null;
  imo?: string | null;
  mmsi?: string | null;
  callsign?: string | null;
  tailNumber?: string | null;
  icao24?: string | null;
}

export interface SanctionsSourceTrace {
  sourceName: string;
  sourceUrl: string;
  datasetVersion: string | null;
  lastUpdated: string;
}

export interface SanctionsEntity {
  id: string;
  name: string;
  aliases: string[];
  entityType: SanctionsEntityType;
  authority: SanctionsAuthority;
  program: string;
  designationDate: string | null;
  status: SanctionsEntityStatus;
  identifiers: SanctionsIdentifiers;
  jurisdictionCountry: string | null;
  linkedCountries: string[];
  geo: SanctionsEntityGeo | null;
  sourceTrace: SanctionsSourceTrace;
  raw?: Record<string, unknown>;
}

// ── Per-source health tracking ─────────────────────────────────────────────

export type SanctionsSourceStatusCode =
  | "live"
  | "cached"
  | "degraded"
  | "unavailable";

export interface SanctionsSourceStatus {
  status: SanctionsSourceStatusCode;
  lastUpdated: number | null;
  rowCount: number;
  datasetVersion: string | null;
  errorCode: string | null;
}

export type SanctionsSourceKey = "ofac" | "un" | "eu" | "uk" | "snapshot";

export type SanctionsSourceStatusMap = Partial<
  Record<SanctionsSourceKey, SanctionsSourceStatus>
>;

// ── Composite result from the ingestion pipeline ───────────────────────────

export interface SanctionsDataResult {
  entities: SanctionsEntity[];
  collection: import("../../../../lib/newsLayers/types").LayerFeatureCollection;
  sourceStatus: SanctionsSourceStatusMap;
}
