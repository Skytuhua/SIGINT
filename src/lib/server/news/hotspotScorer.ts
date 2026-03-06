import type { HotspotDefinition } from "../../../config/hotspotRegistry";

export type TimeWindow = "6h" | "24h" | "7d";

export interface HotspotSignal {
  type:
    | "news"
    | "unrest"
    | "conflict"
    | "natural"
    | "natural_event"
    | "seismic"
    | "military"
    | "faa"
    | "faa_delay"
    | "alert";
  text?: string;
  value: number;
  url?: string;
  sourceUrl?: string;
  sourceName: string;
  timestamp: number;
}

export interface DriverBullet {
  text: string;
  sourceName: string;
  sourceUrl?: string;
  timestamp: number;
}

export interface HotspotScores {
  news: number;
  cii: number;
  geo: number;
  military: number;
  currentScore: number;
  baselineScore: number;
  trend: string;
  drivers: DriverBullet[];
}

function halfLifeMs(tw: TimeWindow): number {
  switch (tw) {
    case "6h": return 1.5 * 3600_000;
    case "24h": return 6 * 3600_000;
    case "7d": return 2 * 86400_000;
  }
}

export function computeNewsScore(
  signals: HotspotSignal[],
  driverQueries: string[],
  timeWindow: TimeWindow
): number {
  const newsSignals = signals.filter((s) => s.type === "news");
  const seen = new Set<string>();
  const deduped = newsSignals.filter((s) => {
    const text = s.text ?? "";
    const key = `${text.slice(0, 60)}::${s.url ?? s.sourceUrl ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const hl = halfLifeMs(timeWindow);
  const now = Date.now();
  let total = 0;

  for (const s of deduped) {
    const age = Math.max(0, now - s.timestamp);
    const decay = Math.exp((-0.693 * age) / hl);
    const text = s.text ?? "";
    const topicBonus = driverQueries.some((q) =>
      q.split(" ").some((w) => text.toLowerCase().includes(w.toLowerCase()))
    ) ? 1.5 : 1.0;
    total += s.value * decay * topicBonus;
  }

  const maxExpected = 50;
  return Math.min(100, Math.round((total / maxExpected) * 100));
}

export function computeCiiScore(signals: HotspotSignal[]): number {
  let unrest = 0, natural = 0, seismic = 0;

  for (const s of signals) {
    if (s.type === "unrest" || s.type === "conflict") unrest += s.value;
    else if (s.type === "natural" || s.type === "natural_event" || s.type === "alert") natural += s.value;
    else if (s.type === "seismic") seismic += s.value;
  }

  return Math.min(100,
    Math.min(40, unrest * 10) +
    Math.min(30, natural * 15) +
    Math.min(30, seismic * 5)
  );
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function computeGeoScore(hotspot: HotspotDefinition): number {
  const [minLon, minLat, maxLon, maxLat] = hotspot.scope.bbox;
  const centerLat = (minLat + maxLat) / 2;
  const centerLon = (minLon + maxLon) / 2;
  const radiusKm = haversineKm(minLat, minLon, maxLat, maxLon) / 2;
  const threshold = radiusKm * 2;

  const STATIC_INFRA: Array<{ lat: number; lon: number; weight: number }> = [
    { lat: 12.6, lon: 43.3, weight: 30 },  // Bab el-Mandeb
    { lat: 26.5, lon: 56.0, weight: 30 },  // Hormuz
    { lat: 30.7, lon: 32.3, weight: 30 },  // Suez
    { lat: 9.0, lon: 79.5, weight: 25 },   // Malacca approach
    { lat: 1.3, lon: 103.8, weight: 25 },  // Singapore Strait
    { lat: 51.0, lon: 1.5, weight: 20 },   // English Channel
    { lat: 35.0, lon: -6.0, weight: 20 },  // Gibraltar
    { lat: 8.9, lon: -79.5, weight: 20 },  // Panama Canal
  ];

  let score = 0;
  for (const inf of STATIC_INFRA) {
    const dist = haversineKm(centerLat, centerLon, inf.lat, inf.lon);
    if (dist < threshold) {
      score += inf.weight * Math.max(0, 1 - dist / threshold);
    }
  }

  return Math.min(100, Math.round(score));
}

export function computeMilitaryScore(
  signals: HotspotSignal[],
  usOnly: boolean,
  faaSignals?: HotspotSignal[]
): number {
  let milScore = 0;
  for (const s of signals) {
    if (s.type === "military") milScore += s.value;
  }

  let faaScore = 0;
  if (usOnly && faaSignals) {
    for (const s of faaSignals) {
      faaScore += s.value;
    }
  }

  return Math.min(100,
    Math.min(90, milScore * 20) +
    Math.min(10, faaScore * 5)
  );
}

export function blendToCurrentScore(
  news: number,
  cii: number,
  geo: number,
  military: number
): number {
  const raw = news * 0.25 + cii * 0.3 + geo * 0.25 + military * 0.2;
  return Math.round((raw / 100) * 5 * 10) / 10;
}

export function computeTrend(current: number, baseline: number): string {
  const delta = current - baseline;
  if (delta >= 0.5) return "ESCALATING";
  if (delta >= 0.2) return "WATCH → RISING";
  if (delta <= -0.3) return "COOLING";
  return "WATCH → STABLE";
}

export function buildDrivers(signals: HotspotSignal[], topN = 6): DriverBullet[] {
  return signals
    .filter((s) => (s.text ?? "").length > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, topN)
    .map((s) => ({
      text: (s.text ?? "").length > 80 ? (s.text ?? "").slice(0, 77) + "..." : (s.text ?? ""),
      sourceName: s.sourceName,
      sourceUrl: s.url ?? s.sourceUrl,
      timestamp: s.timestamp,
    }));
}

export function scoreHotspot(
  hotspot: HotspotDefinition,
  signals: HotspotSignal[],
  timeWindow: TimeWindow,
  faaSignals?: HotspotSignal[]
): HotspotScores {
  const news = computeNewsScore(signals, hotspot.driverQueries, timeWindow);
  const cii = computeCiiScore(signals);
  const geo = computeGeoScore(hotspot);
  const military = computeMilitaryScore(signals, Boolean(hotspot.usOnly), faaSignals);
  const currentScore = blendToCurrentScore(news, cii, geo, military);
  const trend = computeTrend(currentScore, hotspot.baselineScore);
  const drivers = buildDrivers(signals);

  return {
    news,
    cii,
    geo,
    military,
    currentScore,
    baselineScore: hotspot.baselineScore,
    trend,
    drivers,
  };
}
