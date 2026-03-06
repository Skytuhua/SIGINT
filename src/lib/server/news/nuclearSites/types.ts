export type NuclearFacilityType =
  | "Nuclear Power Plant"
  | "Research Reactor"
  | "Uranium Enrichment"
  | "Reprocessing"
  | "Fuel Fabrication"
  | "Spent Fuel Storage / Dry Cask"
  | "Waste Repository / Interim Storage"
  | "Other Nuclear Facility";

export type NuclearFacilityStatus =
  | "Operating"
  | "Under Construction"
  | "Planned"
  | "Decommissioning"
  | "Retired"
  | "Unknown";

export interface NuclearFacilitySourceIds {
  wikidataQid?: string;
  osmId?: string;
  nrcId?: string;
}

export interface NuclearFacilityReference {
  label: string;
  url: string;
}

export interface NuclearFacilityRecord {
  id: string;
  name: string;
  type: NuclearFacilityType;
  status: NuclearFacilityStatus;
  lat: number;
  lon: number;
  /**
   * Optional polygon footprint (lon/lat tuples in GeoJSON winding order).
   * We keep this for future use but render the layer as points for now.
   */
  geometryPolygon?: Array<[number, number]>;
  country?: string;
  admin1?: string;
  operator?: string;
  capacityMw?: number;
  reactorCount?: number;
  startDate?: string;
  lastUpdated: number;
  sourceName: string;
  sourceUrl?: string;
  sourceIds: NuclearFacilitySourceIds;
  references: NuclearFacilityReference[];
  /**
   * Optional debug payloads to aid troubleshooting and provenance inspection.
   * These are not surfaced directly in the UI.
   */
  rawUpstream?: {
    wikidata?: unknown;
    osm?: unknown;
    nrc?: unknown;
  };
}

export type NuclearSourceKey = "wikidata" | "osm" | "nrc" | "snapshot";

export type NuclearSourceStatusCode = "live" | "cached" | "degraded" | "unavailable";

export interface NuclearSourceStatus {
  status: NuclearSourceStatusCode;
  lastUpdated: number | null;
  errorCode: string | null;
}

export type NuclearSourceStatusMap = Record<NuclearSourceKey, NuclearSourceStatus | undefined>;

