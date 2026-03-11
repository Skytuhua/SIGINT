import { z } from 'zod';
import type { NewsArticle } from "../news/types";

// 閳光偓閳光偓閳光偓 Satellite 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓

export const SatelliteSchema = z.object({
  noradId: z.string(),
  name: z.string(),
  tle1: z.string(),
  tle2: z.string(),
});
export type Satellite = z.infer<typeof SatelliteSchema>;

/** Position after SGP4 propagation (comes from the satellite worker) */
export const PropagatedSatSchema = z.object({
  noradId: z.string(),
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
  altKm: z.number(),
  velocityKmS: z.number().optional(),
  inclinationDeg: z.number().optional(),
  isGeo: z.boolean().optional(),
});
export type PropagatedSat = z.infer<typeof PropagatedSatSchema>;

// 閳光偓閳光偓閳光偓 Flight 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓

export const FlightSchema = z.object({
  icao: z.string(),
  callsign: z.string().nullable(),
  lat: z.number(),
  lon: z.number(),
  altM: z.number().nullable(),
  speedMs: z.number().nullable(),
  heading: z.number().nullable(),
  vRate: z.number().nullable(),
  onGround: z.boolean(),
  country: z.string().optional(),
  isMilitary: z.boolean().optional().default(false),
  isMock: z.boolean().optional().default(false),
  registration: z.string().optional(),
  aircraftType: z.string().optional(),
  aircraftTypeDescription: z.string().optional(),
  squawk: z.union([z.string(), z.number()]).optional(),
  route: z.string().optional(),
  source: z.string().optional(),
  rssi: z.number().optional(),
  messageRate: z.number().optional(),
  receivers: z.number().optional(),
  lastPosSec: z.number().optional(),
  lastSeenSec: z.number().optional(),
  selectedAltitudeFt: z.number().optional(),
  selectedHeadingDeg: z.number().optional(),
  windSpeedKt: z.number().optional(),
  windDirectionFromDeg: z.number().optional(),
  tatC: z.number().optional(),
  oatC: z.number().optional(),
  trueAirspeedKt: z.number().optional(),
  indicatedAirspeedKt: z.number().optional(),
  mach: z.number().optional(),
  baroAltFt: z.number().optional(),
  geomAltFt: z.number().optional(),
  vertRateFpm: z.number().optional(),
  trackDeg: z.number().optional(),
  trueHeadingDeg: z.number().optional(),
  magneticHeadingDeg: z.number().optional(),
  magDeclinationDeg: z.number().optional(),
  trackRateDegPerSec: z.number().optional(),
  rollDeg: z.number().optional(),
  navModes: z.array(z.string()).optional(),
  adsbVersion: z.string().optional(),
  category: z.string().optional(),
  dbFlags: z.string().optional(),
  nacp: z.string().optional(),
  sil: z.string().optional(),
  nacv: z.string().optional(),
  nicBaro: z.string().optional(),
  rcMeters: z.number().optional(),
  details: z.record(z.unknown()).optional(),
});
export type Flight = z.infer<typeof FlightSchema>;

export interface GpsJamZone {
  lat: number;
  lon: number;
  degradedRatio: number;
  count: number;
  degradedCount: number;
  /** Weighted multi-indicator degradation score 0-1 */
  compositeScore?: number;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  trend?: 'rising' | 'stable' | 'falling';
  /** Bitmask: 1=quality-degradation, 2=track-noise, 4=report-thinning */
  symptomFlags?: number;
  thinningRatio?: number;
  trackNoiseCount?: number;
  /** How long zone has been active (ms) */
  durationMs?: number;
  peakScore?: number;
  nearbyMilitary?: number;
}

export interface AirspaceAnomalyZone {
  lat: number;
  lon: number;
  baselineAvg: number;
  currentCount: number;
  deviationRatio: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  nearbyMilitary: number;
}

export interface DisappearedFlight {
  icao: string;
  callsign: string | null;
  lastLat: number;
  lastLon: number;
  lastAltM: number;
  lastHeading: number;
  lastSpeedMs: number;
  isMilitary: boolean;
  disappearedAt: number;
  aircraftType?: string;
  aircraftTypeDescription?: string;
}

// 閳光偓閳光偓閳光偓 Earthquake 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓

export const EarthquakeSchema = z.object({
  id: z.string(),
  mag: z.number(),
  place: z.string(),
  time: z.number(),
  lat: z.number(),
  lon: z.number(),
  depthKm: z.number(),
  type: z.string().optional(),
  url: z.string().optional(),
});
export type Earthquake = z.infer<typeof EarthquakeSchema>;

export const DisasterAlertSchema = z.object({
  id: z.string(),
  source: z.literal("gdacs").default("gdacs"),
  upstreamId: z.string(),
  title: z.string(),
  eventType: z.string(),
  eventId: z.string().optional(),
  episodeId: z.string().optional(),
  alertLevel: z.string().optional(),
  severity: z.string().optional(),
  severityValue: z.number().nullable().optional(),
  country: z.string().optional(),
  description: z.string().optional(),
  lat: z.number(),
  lon: z.number(),
  startedAt: z.number().nullable().optional(),
  updatedAt: z.number(),
  link: z.string().optional(),
  raw: z.record(z.unknown()).optional(),
});
export type DisasterAlert = z.infer<typeof DisasterAlertSchema>;

export const SpaceWeatherAlertLevelSchema = z.enum([
  "ALERT",
  "WARNING",
  "WATCH",
  "INFO",
]);

export const SpaceWeatherAlertSchema = z.object({
  id: z.string(),
  source: z.literal("swpc").default("swpc"),
  upstreamId: z.string(),
  productId: z.string(),
  issueDatetime: z.number(),
  title: z.string(),
  level: SpaceWeatherAlertLevelSchema,
  summary: z.string(),
  rawMessage: z.string(),
});
export type SpaceWeatherAlert = z.infer<typeof SpaceWeatherAlertSchema>;
export type SpaceWeatherAlertLevel = z.infer<typeof SpaceWeatherAlertLevelSchema>;

// 閳光偓閳光偓閳光偓 Traffic 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓

export const RoadSegmentSchema = z.object({
  id: z.string(),
  type: z.string(),
  coords: z.array(z.tuple([z.number(), z.number()])),
});
export type RoadSegment = z.infer<typeof RoadSegmentSchema>;

export const VehicleSchema = z.object({
  id: z.string(),
  lat: z.number(),
  lon: z.number(),
  headingDeg: z.number(),
  speedKmH: z.number(),
  roadType: z.string(),
});
export type Vehicle = z.infer<typeof VehicleSchema>;

// 閳光偓閳光偓閳光偓 CCTV 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓

export const CctvStreamFormat = z.enum([
  "M3U8",
  "IMAGE_STREAM",
  "JPEG",
  "YOUTUBE",
  "UNKNOWN",
]);
export type CctvStreamFormat = z.infer<typeof CctvStreamFormat>;

export const CctvRegion = z.enum(["mideast", "europe", "americas", "asia", "africa", "oceania"]);
export type CctvRegion = z.infer<typeof CctvRegion>;

export const CctvCameraSchema = z.object({
  id: z.string(),
  city: z.string(),
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
  snapshotUrl: z.string().optional().default(""),
  refreshSeconds: z.number().optional().default(60),
  streamUrl: z.string().optional(),
  streamFormat: CctvStreamFormat.optional(),
  state: z.string().optional(),
  direction: z.string().optional(),
  region: CctvRegion.optional(),
  /** Category tags for custom filter tabs (e.g. "iran-attacks") */
  tags: z.array(z.string()).optional(),
  /** Section label for grouping within a category (defaults to city) */
  section: z.string().optional(),
});
export type CctvCamera = z.infer<typeof CctvCameraSchema>;

// 閳光偓閳光偓閳光偓 Scene 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓

export const SceneSchema = z.object({
  name: z.string(),
  city: z.string().optional(),
  lat: z.number(),
  lon: z.number(),
  altM: z.number(),
  heading: z.number().optional().default(0),
  pitch: z.number().optional().default(-45),
});
export type Scene = z.infer<typeof SceneSchema>;

// 閳光偓閳光偓閳光偓 Provider interface 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓

export interface DataProvider<T> {
  name: string;
  enabledByDefault: boolean;
  refreshIntervalMs: number;
  fetch(): Promise<T[]>;
}

// 閳光偓閳光偓閳光偓 Selection entity 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓

export interface EntityData {
  type: 'satellite' | 'flight' | 'earthquake' | 'disaster' | 'cctv' | 'traffic' | 'news';
  id: string;
  data:
    | PropagatedSat
    | Flight
    | Earthquake
    | DisasterAlert
    | CctvCamera
    | NewsArticle
    | Record<string, unknown>;
}

// 閳光偓閳光偓閳光偓 Camera calibration 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓

export interface CameraCalibration {
  heading: number;
  pitch: number;
  fov: number;
  range: number;
  height: number;
  northM: number;
  eastM: number;
}
