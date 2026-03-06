/**
 * Shared types for Intel Hotspots layer (used by both server and client).
 */

import type { TimeWindow } from "../../config/hotspotRegistry";

export interface DriverBullet {
  text: string;
  sourceName: string;
  sourceUrl?: string;
  timestamp: number;
}

export interface HotspotFeatureProperties {
  id: string;
  name: string;
  tier: string;
  tags: string[];
  anchor: { lat: number; lon: number };
  scopeCountries: string[];
  baselineScore: number;
  whyItMatters: string;
  keyEntities: string[];
  historicalContext: {
    lastMajorEvent: { date: string; label: string };
    precedents: string[];
    cyclicalPattern: string;
  };
  currentScore: number;
  trend: string;
  newsScore: number;
  ciiScore: number;
  geoScore: number;
  militaryScore: number;
  drivers: DriverBullet[];
  lastUpdated: number;
  timeWindow: TimeWindow;
  sourceStatuses: Record<string, "live" | "cached" | "degraded" | "unavailable">;
}
