import type {
  EntityData,
  Flight,
  Earthquake,
  CctvCamera,
  PropagatedSat,
  Satellite,
} from "../providers/types";
import type { FeedLogItem, LiveDataState } from "./types";
import { formatAltitudeMeters, formatSpeedMs, hashToSignedPercent, sparkFromSeries } from "./format";
import { inferFlightCountry, inferSatelliteCountry } from "../geo/country";

export interface KpiTile {
  id: string;
  label: string;
  value: string;
  delta: number;
  trend: number[];
  tone: "neutral" | "up" | "down";
}

export interface FlightTableRow {
  id: string;
  type: "COMM" | "MIL";
  callsign: string;
  country: string;
  alt: string;
  speed: string;
  heading: number;
  delta: number;
  heat: number;
  spark: number[];
  entity: EntityData;
}

export interface QuakeTableRow {
  id: string;
  place: string;
  mag: number;
  depthKm: number;
  ts: number;
  delta: number;
  spark: number[];
  entity: EntityData;
}

export interface SatelliteRow {
  id: string;
  name: string;
  noradId: string;
  orbitClass: string;
  country: string;
  liveAltitudeKm: number | null;
  referenceAltitudeKm: number;
  delta: number;
  spark: number[];
  entity: EntityData;
}

export interface RingDatum {
  id: string;
  label: string;
  value: number;
  color: string;
}

export interface SeriesDatum {
  label: string;
  values: number[];
  color: string;
}

function fallbackFlightRows(): FlightTableRow[] {
  const fallback: Flight[] = [
    {
      icao: "aabb10",
      callsign: "DAL401",
      lat: 33.6407,
      lon: -84.4277,
      altM: 10200,
      speedMs: 230,
      heading: 65,
      vRate: 2,
      onGround: false,
      country: "United States",
      isMilitary: false,
      isMock: true,
    },
    {
      icao: "43c401",
      callsign: "RRR7702",
      lat: 51.8,
      lon: -1.2,
      altM: 9500,
      speedMs: 250,
      heading: 320,
      vRate: 0,
      onGround: false,
      country: "United Kingdom",
      isMilitary: true,
      isMock: true,
    },
    {
      icao: "aabb12",
      callsign: "AAL125",
      lat: 32.8998,
      lon: -97.0403,
      altM: 8700,
      speedMs: 210,
      heading: 118,
      vRate: 0,
      onGround: false,
      country: "United States",
      isMilitary: false,
      isMock: true,
    },
  ];
  return mapFlightsToRows(fallback, []);
}

function mapFlightsToRows(flights: Flight[], military: Flight[]): FlightTableRow[] {
  const combined = [...flights, ...military];
  return combined
    .slice(0, 500)
    .map<FlightTableRow>((f) => {
      const delta = hashToSignedPercent(f.icao);
      const speed = f.speedMs ?? 0;
      return {
        id: f.icao,
        type: f.isMilitary ? "MIL" : "COMM",
        callsign: f.callsign || f.icao.toUpperCase(),
        country: inferFlightCountry({
          country: f.country,
          icao: f.icao,
          lat: f.lat,
          lon: f.lon,
        }),
        alt: formatAltitudeMeters(f.altM),
        speed: formatSpeedMs(f.speedMs),
        heading: Math.round(f.heading ?? 0),
        delta,
        heat: Math.min(1, Math.max(0, speed / 280)),
        spark: sparkFromSeries([
          speed * 0.86,
          speed * 0.92,
          speed * 0.95,
          speed,
          speed * (1 + delta / 100),
        ]),
        entity: { type: "flight" as const, id: f.icao, data: f },
      };
    })
    .sort((a, b) => b.heat - a.heat);
}

function mapQuakesToRows(quakes: Earthquake[]): QuakeTableRow[] {
  return quakes
    .slice(0, 300)
    .map<QuakeTableRow>((q) => {
      const delta = hashToSignedPercent(q.id);
      return {
        id: q.id,
        place: q.place,
        mag: q.mag,
        depthKm: q.depthKm,
        ts: q.time,
        delta,
        spark: sparkFromSeries([
          q.mag * 0.8,
          q.mag * 0.85,
          q.mag * 0.9,
          q.mag,
          q.mag + delta * 0.03,
        ]),
        entity: { type: "earthquake" as const, id: q.id, data: q },
      };
    })
    .sort((a, b) => b.mag - a.mag);
}

function fallbackQuakes(): QuakeTableRow[] {
  const now = Date.now();
  const fallback: Earthquake[] = [
    {
      id: "mock-quake-1",
      mag: 5.8,
      place: "113 km E of Hachijo-jima, Japan",
      time: now - 1000 * 60 * 20,
      lat: 33.1,
      lon: 141.2,
      depthKm: 36,
      type: "earthquake",
      url: "",
    },
    {
      id: "mock-quake-2",
      mag: 4.2,
      place: "Northern California",
      time: now - 1000 * 60 * 45,
      lat: 38.4,
      lon: -122.4,
      depthKm: 11,
      type: "earthquake",
      url: "",
    },
  ];
  return mapQuakesToRows(fallback);
}

function orbitClass(altKm: number): string {
  if (altKm < 2000) return "LEO";
  if (altKm < 35000) return "MEO";
  return "GEO";
}

function orbitClassFromName(name: string): string {
  const upper = name.toUpperCase();
  if (
    upper.includes("STARLINK") ||
    upper.includes("ONEWEB") ||
    upper.includes("IRIDIUM") ||
    upper.includes("ISS") ||
    upper.includes("NOAA") ||
    upper.includes("COSMOS") ||
    upper.includes("SWARM")
  ) {
    return "LEO";
  }
  if (
    upper.includes("SES") ||
    upper.includes("INTELSAT") ||
    upper.includes("EUTELSAT") ||
    upper.includes("INMARSAT") ||
    upper.includes("ASTRA") ||
    upper.includes("THAICOM") ||
    upper.includes("GEO")
  ) {
    return "GEO";
  }
  if (upper.includes("GPS") || upper.includes("GALILEO") || upper.includes("GLONASS")) {
    return "MEO";
  }
  return "UNKNOWN";
}

function defaultAltitudeForOrbit(orbitClassLabel: string): number {
  if (orbitClassLabel === "LEO") return 550;
  if (orbitClassLabel === "MEO") return 20_200;
  if (orbitClassLabel === "GEO") return 35_786;
  return 1_200;
}

function mapLiveSatsToRows(sats: PropagatedSat[]): SatelliteRow[] {
  return sats.slice(0, 1000).map<SatelliteRow>((s) => {
    const delta = hashToSignedPercent(s.noradId);
    const inferredOrbit = orbitClass(s.altKm);
    const country = inferSatelliteCountry(s.name);
    return {
      id: s.noradId,
      name: s.name,
      noradId: s.noradId,
      orbitClass: inferredOrbit,
      country,
      liveAltitudeKm: s.altKm,
      referenceAltitudeKm: s.altKm,
      delta,
      spark: sparkFromSeries([
        s.altKm * 0.99,
        s.altKm,
        s.altKm * 1.01,
        s.altKm * (1 + delta / 1000),
      ]),
      entity: {
        type: "satellite" as const,
        id: s.noradId,
        data: { ...s, country, sourceMode: "live" },
      },
    };
  });
}

function mapCatalogSatsToRows(catalog: Satellite[], liveSats: PropagatedSat[]): SatelliteRow[] {
  if (!catalog.length) return [];

  const liveByNoradId = new Map(liveSats.map((sat) => [sat.noradId, sat]));
  const uniqueCatalog = Array.from(new Map(catalog.map((sat) => [sat.noradId, sat])).values());

  return uniqueCatalog.slice(0, 1000).map<SatelliteRow>((sat) => {
    const live = liveByNoradId.get(sat.noradId);
    const orbitLabel = live ? orbitClass(live.altKm) : orbitClassFromName(sat.name);
    const referenceAltitudeKm = live?.altKm ?? defaultAltitudeForOrbit(orbitLabel);
    const delta = hashToSignedPercent(sat.noradId);
    const country = inferSatelliteCountry(sat.name);

    return {
      id: sat.noradId,
      name: sat.name,
      noradId: sat.noradId,
      orbitClass: orbitLabel,
      country,
      liveAltitudeKm: live?.altKm ?? null,
      referenceAltitudeKm,
      delta,
      spark: sparkFromSeries([
        referenceAltitudeKm * 0.99,
        referenceAltitudeKm,
        referenceAltitudeKm * 1.01,
        referenceAltitudeKm * (1 + delta / 1000),
      ]),
      entity: {
        type: "satellite" as const,
        id: sat.noradId,
        data: {
          ...sat,
          ...(live ?? {}),
          country,
          sourceMode: live ? "live+catalog" : "catalog",
        },
      },
    };
  });
}

function fallbackSatRows(): SatelliteRow[] {
  const fallback: PropagatedSat[] = [
    {
      noradId: "25544",
      name: "ISS",
      lat: 12,
      lon: 50,
      altKm: 417,
    },
    {
      noradId: "33591",
      name: "NOAA 19",
      lat: -30,
      lon: 140,
      altKm: 862,
    },
    {
      noradId: "40773",
      name: "SES-14",
      lat: -2,
      lon: -47,
      altKm: 35789,
      isGeo: true,
    },
    {
      noradId: "43013",
      name: "STARLINK-1067",
      lat: 22,
      lon: -73,
      altKm: 549,
    },
    {
      noradId: "41866",
      name: "GALILEO 14",
      lat: 43,
      lon: 11,
      altKm: 23222,
    },
    {
      noradId: "25639",
      name: "INTELSAT 805",
      lat: -3,
      lon: -61,
      altKm: 35782,
      isGeo: true,
    },
  ];
  return mapLiveSatsToRows(fallback);
}

export function selectKpiTiles(data: LiveDataState): KpiTile[] {
  const flights = data.flights.length + data.military.length;
  const quakes = data.earthquakes.length;
  const sats = data.satelliteCatalog.length || data.satellites.length;
  const cctv = data.cctv.length;

  const avgMag =
    data.earthquakes.length > 0
      ? data.earthquakes.reduce((sum, q) => sum + q.mag, 0) / data.earthquakes.length
      : 0;

  return [
    {
      id: "flt",
      label: "TRACKED FLIGHTS",
      value: String(flights),
      delta: hashToSignedPercent(`flight-${flights}`),
      trend: data.trendHistory.flightCount,
      tone: "neutral",
    },
    {
      id: "mil",
      label: "MILITARY SIGNALS",
      value: String(data.military.length),
      delta: hashToSignedPercent(`mil-${data.military.length}`),
      trend: data.trendHistory.militaryCount,
      tone: data.military.length > 0 ? "up" : "neutral",
    },
    {
      id: "eq",
      label: "SEISMIC EVENTS",
      value: String(quakes),
      delta: hashToSignedPercent(`eq-${quakes}`),
      trend: data.trendHistory.quakeAvgMag,
      tone: avgMag >= 4 ? "down" : "neutral",
    },
    {
      id: "sat",
      label: "SATELLITES",
      value: String(sats),
      delta: hashToSignedPercent(`sat-${sats}`),
      trend: data.trendHistory.entityCount,
      tone: "neutral",
    },
    {
      id: "cctv",
      label: "CCTV NODES",
      value: String(cctv),
      delta: hashToSignedPercent(`cctv-${cctv}`),
      trend: data.trendHistory.entityCount,
      tone: "neutral",
    },
  ];
}

export function selectFlightRows(data: LiveDataState): FlightTableRow[] {
  const rows = mapFlightsToRows(data.flights, data.military);
  return rows.length ? rows : fallbackFlightRows();
}

export function selectQuakeRows(data: LiveDataState): QuakeTableRow[] {
  const rows = mapQuakesToRows(data.earthquakes);
  return rows.length ? rows : fallbackQuakes();
}

export function selectSatelliteRows(data: LiveDataState): SatelliteRow[] {
  const rowsFromCatalog = mapCatalogSatsToRows(data.satelliteCatalog, data.satellites);
  if (rowsFromCatalog.length) return rowsFromCatalog;
  const rowsFromLive = mapLiveSatsToRows(data.satellites);
  return rowsFromLive.length ? rowsFromLive : fallbackSatRows();
}

export function selectRingSummary(data: LiveDataState): RingDatum[] {
  const comm = data.flights.length;
  const mil = data.military.length;
  const quakes = data.earthquakes.length;
  const cctv = data.cctv.length;
  const total = comm + mil + quakes + cctv;

  if (total === 0) {
    return [
      { id: "comm", label: "COMM", value: 42, color: "#4aa3d8" },
      { id: "mil", label: "MIL", value: 19, color: "#d18f47" },
      { id: "quake", label: "QUAKE", value: 17, color: "#bd5a5a" },
      { id: "cctv", label: "CCTV", value: 22, color: "#7a9ab6" },
    ];
  }

  return [
    { id: "comm", label: "COMM", value: comm, color: "#4aa3d8" },
    { id: "mil", label: "MIL", value: mil, color: "#d18f47" },
    { id: "quake", label: "QUAKE", value: quakes, color: "#bd5a5a" },
    { id: "cctv", label: "CCTV", value: cctv, color: "#7a9ab6" },
  ];
}

export function selectSeries(data: LiveDataState): SeriesDatum[] {
  return [
    {
      label: "Flights",
      values: data.trendHistory.flightCount,
      color: "#4aa3d8",
    },
    {
      label: "Military",
      values: data.trendHistory.militaryCount,
      color: "#d18f47",
    },
    {
      label: "Mag Avg",
      values: data.trendHistory.quakeAvgMag,
      color: "#bd5a5a",
    },
  ];
}

export function selectFeedItems(data: LiveDataState): FeedLogItem[] {
  if (data.feedLog.length > 0) return data.feedLog.slice(-60).reverse();

  const now = Date.now();
  return [
    {
      id: "seed-1",
      source: "SYSTEM",
      message: "Using fallback feed rows until live polling warm-up completes.",
      level: "warn",
      ts: now,
    },
    {
      id: "seed-2",
      source: "DASHBOARD",
      message: "Inspector and panel chrome active.",
      level: "info",
      ts: now - 1000 * 40,
    },
  ];
}

export function selectCctvRows(data: LiveDataState): CctvCamera[] {
  return data.cctv
    .filter((cam) => cam.streamFormat === "YOUTUBE")
    .slice(0, 200);
}

