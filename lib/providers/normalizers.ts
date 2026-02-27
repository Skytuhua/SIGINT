import type { Earthquake, Flight } from "./types";

export const normalizeOpenSky = (raw: any): Flight[] => {
  const states = raw?.states ?? [];
  return states
    .map((s: any[]) => ({
      icao24: String(s[0] ?? ""),
      callsign: s[1] ? String(s[1]).trim() : null,
      lon: Number(s[5]),
      lat: Number(s[6]),
      altitudeM: s[7] === null ? null : Number(s[7]),
      onGround: Boolean(s[8]),
      velocityMS: s[9] === null ? null : Number(s[9]),
      headingDeg: s[10] === null ? null : Number(s[10]),
    }))
    .filter((f: Flight) => Number.isFinite(f.lat) && Number.isFinite(f.lon));
};

export const normalizeUsgs = (raw: any): Earthquake[] => {
  const features = raw?.features ?? [];
  return features.map((feature: any) => ({
    id: String(feature.id),
    magnitude: Number(feature.properties?.mag ?? 0),
    time: Number(feature.properties?.time ?? Date.now()),
    lat: Number(feature.geometry?.coordinates?.[1] ?? 0),
    lon: Number(feature.geometry?.coordinates?.[0] ?? 0),
    depthKm: Number(feature.geometry?.coordinates?.[2] ?? 0),
    place: String(feature.properties?.place ?? "Unknown"),
  }));
};
