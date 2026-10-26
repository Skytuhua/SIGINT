import type {
  EntityData,
  Flight,
  Earthquake,
  CctvCamera,
  PropagatedSat,
  Satellite,
} from "../providers/types";
import type { FeedLogItem, LiveDataState } from "./types";
import { formatAltitudeMeters, formatSpeedMs } from "./format";
import { inferFlightCountry, inferSatelliteCountry } from "../geo/country";

export interface KpiTile {
  id: string;
  label: string;
  value: string;
  delta: number | null;
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
  delta: number | null;
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
  delta: number | null;
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
  delta: number | null;
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

function mapFlightsToRows(flights: Flight[], military: Flight[]): FlightTableRow[] {
  const combined = [...flights, ...military];
  return combined
    .map<FlightTableRow>((f) => {
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
        delta: null,
        heat: Math.min(1, Math.max(0, speed / 280)),
        spark: [],
        entity: { type: "flight" as const, id: f.icao, data: f },
      };
    })
    .sort((a, b) => b.heat - a.heat);
}

function mapQuakesToRows(quakes: Earthquake[]): QuakeTableRow[] {
  return quakes
    .slice(0, 300)
    .map<QuakeTableRow>((q) => {
      return {
        id: q.id,
        place: q.place,
        mag: q.mag,
        depthKm: q.depthKm,
        ts: q.time,
        delta: null,
        spark: [],
        entity: { type: "earthquake" as const, id: q.id, data: q },
      };
    })
    .sort((a, b) => b.mag - a.mag);
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
      delta: null,
      spark: [],
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
    const country = inferSatelliteCountry(sat.name);

    return {
      id: sat.noradId,
      name: sat.name,
      noradId: sat.noradId,
      orbitClass: orbitLabel,
      country,
      liveAltitudeKm: live?.altKm ?? null,
      referenceAltitudeKm,
      delta: null,
      spark: [],
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

export function selectKpiTiles(data: LiveDataState): KpiTile[] {
  const flights = data.flights.length + data.military.length;
  const quakes = data.earthquakes.length;
  const sats = data.satelliteCatalog.length || data.satellites.length;
  const cctv = data.cctv.length;

  const avgMag =
    data.earthquakes.length > 0
      ? data.earthquakes.reduce((sum, q) => sum + q.mag, 0) / data.earthquakes.length
      : 0;

  // No defined historical comparison window exists for these counts yet.
  // Omit percentage changes instead of inventing directional metrics.
  return [
    {
      id: "flt",
      label: "TRACKED FLIGHTS",
      value: String(flights),
      delta: null,
      trend: data.trendHistory.flightCount,
      tone: "neutral",
    },
    {
      id: "mil",
      label: "MILITARY SIGNALS",
      value: String(data.military.length),
      delta: null,
      trend: data.trendHistory.militaryCount,
      tone: data.military.length > 0 ? "up" : "neutral",
    },
    {
      id: "eq",
      label: "SEISMIC EVENTS",
      value: String(quakes),
      delta: null,
      trend: [],
      tone: avgMag >= 4 ? "down" : "neutral",
    },
    {
      id: "sat",
      label: "SATELLITES",
      value: String(sats),
      delta: null,
      trend: [],
      tone: "neutral",
    },
    {
      id: "cctv",
      label: "CCTV NODES",
      value: String(cctv),
      delta: null,
      trend: [],
      tone: "neutral",
    },
  ];
}

export function selectFlightRows(data: LiveDataState): FlightTableRow[] {
  return mapFlightsToRows(data.flights, data.military);
}

export function selectQuakeRows(
  data: LiveDataState,
  range?: { minMagnitude: number; maxMagnitude: number }
): QuakeTableRow[] {
  const quakes = range
    ? data.earthquakes.filter((quake) => quake.mag >= range.minMagnitude && quake.mag <= range.maxMagnitude)
    : data.earthquakes;
  return mapQuakesToRows(quakes);
}

export function selectSatelliteRows(data: LiveDataState): SatelliteRow[] {
  const rowsFromCatalog = mapCatalogSatsToRows(data.satelliteCatalog, data.satellites);
  if (rowsFromCatalog.length) return rowsFromCatalog;
  return mapLiveSatsToRows(data.satellites);
}

export function selectRingSummary(data: LiveDataState): RingDatum[] {
  const comm = data.flights.length;
  const mil = data.military.length;
  const quakes = data.earthquakes.length;
  const cctv = data.cctv.length;

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
      message: "Waiting for live feed updates.",
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

