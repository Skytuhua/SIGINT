import { NextResponse } from "next/server";
import type { Flight } from "../../../lib/providers/types";
import { inferFlightCountry } from "../../../lib/geo/country";
import { fetchWithTimeout as _fetchWithTimeout } from "../../../lib/server/fetchWithTimeout";
import { STANDARD_LIMITER } from "../../../lib/server/rateLimitPresets";
import { withRateLimit } from "../../../lib/server/withRateLimit";

export const dynamic = "force-dynamic";

const OPENSKY_BASE = "https://opensky-network.org/api";
const AIRPLANESLIVE_BASE = "https://api.airplanes.live/v2";
const ADSBLOL_BASE = process.env.ADSBX_COMMERCIAL_URL ?? "https://api.adsb.lol/v2";
const FR24_URL =
  "https://data-live.flightradar24.com/zones/fcgi/feed.js?faa=1&mlat=1&flarm=1&adsb=1&gnd=1&air=1&vehicles=1&estimated=1&maxage=900&glm=1";

const OPENSKY_TTL_MS = 15_000;
const TTL_MS = 12_000;
const BACKOFF_MS = 120_000;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_AIRCRAFT = 5_000;

const ADSB_GLOBAL_DIST_NM = 10_000;
const ADSB_REGION_MAX_PER_REGION = 500;
const ADSB_REGION_MIN_SUCCESS = 4;

type AdsbRegion = {
  name: string;
  lat: number;
  lon: number;
  radiusNm: number;
};

const ADSB_REGIONS: AdsbRegion[] = [
  { name: "na-west", lat: 37.5, lon: -122.2, radiusNm: 650 },
  { name: "na-central", lat: 39.0, lon: -98.0, radiusNm: 800 },
  { name: "na-east", lat: 40.5, lon: -75.0, radiusNm: 650 },
  { name: "south-america", lat: -23.5, lon: -46.6, radiusNm: 750 },
  { name: "europe-west", lat: 51.5, lon: -0.1, radiusNm: 650 },
  { name: "europe-east", lat: 50.0, lon: 20.0, radiusNm: 650 },
  { name: "middle-east", lat: 25.2, lon: 55.3, radiusNm: 700 },
  { name: "south-asia", lat: 28.6, lon: 77.2, radiusNm: 700 },
  { name: "east-asia", lat: 35.7, lon: 139.7, radiusNm: 750 },
  { name: "oceania", lat: -33.9, lon: 151.2, radiusNm: 700 },
  { name: "africa-north", lat: 30.0, lon: 31.2, radiusNm: 700 },
  { name: "africa-south", lat: -26.2, lon: 28.0, radiusNm: 700 },
];

const MOCK_COMMERCIAL: Flight[] = [
  {
    icao: "aabb10",
    callsign: "DAL401",
    lat: 33.6407,
    lon: -84.4277,
    altM: 10_200,
    speedMs: 230,
    heading: 65,
    vRate: 2,
    onGround: false,
    country: "United States",
    isMilitary: false,
    isMock: true,
  },
  {
    icao: "aabb11",
    callsign: "UAL908",
    lat: 41.9742,
    lon: -87.9073,
    altM: 9_800,
    speedMs: 220,
    heading: 240,
    vRate: -1,
    onGround: false,
    country: "United States",
    isMilitary: false,
    isMock: true,
  },
  {
    icao: "aabb12",
    callsign: "AAL125",
    lat: 32.8998,
    lon: -97.0403,
    altM: 8_700,
    speedMs: 210,
    heading: 118,
    vRate: 0,
    onGround: false,
    country: "United States",
    isMilitary: false,
    isMock: true,
  },
];

type AdsbxAircraft = {
  hex?: string;
  flight?: string | null;
  lat?: number | null;
  lon?: number | null;
  alt_baro?: number | string | null;
  alt_geom?: number | null;
  gs?: number | null;
  tas?: number | null;
  ias?: number | null;
  mach?: number | null;
  track?: number | null;
  true_heading?: number | null;
  mag_heading?: number | null;
  mag_declination?: number | null;
  roll?: number | null;
  track_rate?: number | null;
  baro_rate?: number | null;
  geom_rate?: number | null;
  on_ground?: boolean | null;
  reg?: string | null;
  t?: string | null;
  desc?: string | null;
  squawk?: string | number | null;
  route?: string | null;
  db_flags?: string | null;
  src?: string | null;
  type?: string | null;       // reception source: adsb_icao, mlat, tisb_icao, mode_s, adsc, uat, etc.
  rssi?: number | null;
  messages?: number | null;
  seen_pos?: number | null;
  seen?: number | null;
  nav_altitude_mcp?: number | null;
  nav_heading?: number | null;
  ws?: number | null;
  wd?: number | null;
  tat?: number | null;
  oat?: number | null;
  nav_modes?: string[] | null;
  version?: number | string | null;
  category?: string | null;
  nac_p?: number | string | null;
  sil?: number | string | null;
  nac_v?: number | string | null;
  nic_baro?: number | string | null;
  rc?: number | null;
};

type OpenSkyResponse = {
  time?: number;
  states?: unknown[];
};

class RateLimitError extends Error {}

/** Map readsb/tar1090 `type` field to human-readable reception source label. */
function mapReceptionSource(ac: AdsbxAircraft): string {
  const raw = String(ac.type ?? ac.src ?? "").trim().toLowerCase();
  if (!raw) return "ADS-B";
  if (raw === "adsb_icao" || raw === "adsb_icao_nt" || raw === "adsb_other") return "ADS-B";
  if (raw === "adsr_icao" || raw === "adsr_other") return "UAT / ADS-R";
  if (raw === "uat" || raw === "uat_other") return "UAT / ADS-R";
  if (raw === "tisb_icao" || raw === "tisb_trackfile" || raw === "tisb_other") return "TIS-B";
  if (raw === "mlat") return "MLAT";
  if (raw === "mode_s") return "Mode-S";
  if (raw === "mode_ac") return "Mode-S";
  if (raw === "adsc" || raw === "adsb_adsc") return "ADS-C";
  return "Other";
}

let cache: { data: Flight[]; expires: number } | null = null;
const sourceBackoff: Record<string, number> = {};

function pointUrl(base: string, region: AdsbRegion): string {
  const root = base.replace(/\/$/, "");
  return `${root}/point/${region.lat}/${region.lon}/${region.radiusNm}`;
}

function globalUrl(base: string): string {
  const root = base.replace(/\/$/, "");
  return `${root}/lat/0/lon/0/dist/${ADSB_GLOBAL_DIST_NM}`;
}

function feetToMeters(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v * 0.3048 : null;
}

function knotsToMps(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v * 0.514444 : null;
}

function fpmToMps(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v * 0.00508 : null;
}

function parseNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function dedupeByIcao(flights: Flight[]): Flight[] {
  const seen = new Set<string>();
  const unique: Flight[] = [];
  for (const f of flights) {
    if (!f.icao || seen.has(f.icao)) continue;
    seen.add(f.icao);
    unique.push(f);
  }
  return unique;
}

type WorldRegion = "na" | "sa" | "eu" | "af" | "me" | "asia" | "oce" | "other";

const WORLD_REGION_ORDER: WorldRegion[] = ["na", "sa", "eu", "af", "me", "asia", "oce", "other"];

const WORLD_REGION_QUOTA: Record<WorldRegion, number> = {
  na: 0.22,
  sa: 0.08,
  eu: 0.18,
  af: 0.10,
  me: 0.08,
  asia: 0.23,
  oce: 0.09,
  other: 0.02,
};

function classifyWorldRegion(lat: number, lon: number): WorldRegion {
  if (lat >= 8 && lat <= 85 && lon >= -170 && lon <= -50) return "na";
  if (lat <= 15 && lat >= -60 && lon >= -95 && lon <= -30) return "sa";
  if (lat >= 34 && lat <= 72 && lon >= -12 && lon <= 45) return "eu";
  if (lat >= -35 && lat <= 38 && lon >= -20 && lon <= 52) return "af";
  if (lat >= 12 && lat <= 42 && lon >= 35 && lon <= 66) return "me";
  if (lat >= -12 && lat <= 75 && lon >= 45 && lon <= 170) return "asia";
  if (lat >= -55 && lat <= 5 && lon >= 105 && lon <= 180) return "oce";
  return "other";
}

function bucketKey(lat: number, lon: number): string {
  const latClamped = Math.max(-89.999, Math.min(89.999, lat));
  const lonNorm = ((((lon + 180) % 360) + 360) % 360) - 180;
  const latCell = Math.floor((latClamped + 90) / 10);
  const lonCell = Math.floor((lonNorm + 180) / 10);
  return `${latCell}:${lonCell}`;
}

function sampleRegionByGeoBuckets(flights: Flight[], target: number): Flight[] {
  if (target <= 0 || flights.length === 0) return [];
  const buckets = new Map<string, Flight[]>();
  for (const flight of flights) {
    const key = bucketKey(flight.lat, flight.lon);
    const existing = buckets.get(key);
    if (existing) {
      existing.push(flight);
    } else {
      buckets.set(key, [flight]);
    }
  }

  const queue = Array.from(buckets.values())
    .map((rows) => rows.slice().sort((a, b) => a.icao.localeCompare(b.icao)))
    .sort((a, b) => b.length - a.length);
  const sampled: Flight[] = [];
  let idx = 0;

  while (queue.length > 0 && sampled.length < target) {
    const bucketIndex = idx % queue.length;
    const bucket = queue[bucketIndex];
    const next = bucket.shift();
    if (next) sampled.push(next);
    if (bucket.length === 0) {
      queue.splice(bucketIndex, 1);
      continue;
    }
    idx += 1;
  }

  return sampled;
}

function balanceFlightsWorldwide(
  flights: Flight[],
  limit: number
): { flights: Flight[]; counts: Record<WorldRegion, number> } {
  const unique = dedupeByIcao(flights).sort((a, b) => a.icao.localeCompare(b.icao));
  if (unique.length <= limit) {
    const counts = summarizeWorldRegions(unique);
    return { flights: unique, counts };
  }

  const byRegion: Record<WorldRegion, Flight[]> = {
    na: [],
    sa: [],
    eu: [],
    af: [],
    me: [],
    asia: [],
    oce: [],
    other: [],
  };

  for (const row of unique) {
    byRegion[classifyWorldRegion(row.lat, row.lon)].push(row);
  }

  const selectedByRegion: Record<WorldRegion, Flight[]> = {
    na: [],
    sa: [],
    eu: [],
    af: [],
    me: [],
    asia: [],
    oce: [],
    other: [],
  };

  for (const region of WORLD_REGION_ORDER) {
    const target = Math.floor(limit * WORLD_REGION_QUOTA[region]);
    selectedByRegion[region] = sampleRegionByGeoBuckets(byRegion[region], target);
  }

  const selected: Flight[] = WORLD_REGION_ORDER.flatMap((region) => selectedByRegion[region]);
  if (selected.length < limit) {
    const selectedIds = new Set(selected.map((f) => f.icao));
    const leftovers: Record<WorldRegion, Flight[]> = {
      na: byRegion.na.filter((f) => !selectedIds.has(f.icao)),
      sa: byRegion.sa.filter((f) => !selectedIds.has(f.icao)),
      eu: byRegion.eu.filter((f) => !selectedIds.has(f.icao)),
      af: byRegion.af.filter((f) => !selectedIds.has(f.icao)),
      me: byRegion.me.filter((f) => !selectedIds.has(f.icao)),
      asia: byRegion.asia.filter((f) => !selectedIds.has(f.icao)),
      oce: byRegion.oce.filter((f) => !selectedIds.has(f.icao)),
      other: byRegion.other.filter((f) => !selectedIds.has(f.icao)),
    };

    let progressed = true;
    while (selected.length < limit && progressed) {
      progressed = false;
      for (const region of WORLD_REGION_ORDER) {
        const next = leftovers[region].shift();
        if (!next) continue;
        selected.push(next);
        progressed = true;
        if (selected.length >= limit) break;
      }
    }
  }

  const capped = selected.slice(0, limit);
  const counts = summarizeWorldRegions(capped);
  return { flights: capped, counts };
}

function summarizeWorldRegions(flights: Flight[]): Record<WorldRegion, number> {
  const counts: Record<WorldRegion, number> = {
    na: 0,
    sa: 0,
    eu: 0,
    af: 0,
    me: 0,
    asia: 0,
    oce: 0,
    other: 0,
  };
  for (const f of flights) {
    counts[classifyWorldRegion(f.lat, f.lon)] += 1;
  }
  return counts;
}

function formatRegionSummary(counts: Record<WorldRegion, number>): string {
  return `NA:${counts.na} SA:${counts.sa} EU:${counts.eu} AF:${counts.af} ME:${counts.me} AS:${counts.asia} OC:${counts.oce} OT:${counts.other}`;
}

function normalizeOpenSky(raw: OpenSkyResponse): Flight[] {
  const flights: Flight[] = [];
  for (const state of raw.states ?? []) {
    if (!Array.isArray(state) || state.length < 9) continue;

    const lon = state[5] as number | null;
    const lat = state[6] as number | null;
    if (typeof lon !== "number" || typeof lat !== "number") continue;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

    const icao = String(state[0] ?? "").trim();
    if (!icao) continue;

    flights.push({
      icao,
      callsign: typeof state[1] === "string" ? state[1].trim() || null : null,
      lat,
      lon,
      altM: typeof state[7] === "number" && Number.isFinite(state[7]) ? state[7] : null,
      speedMs: typeof state[9] === "number" && Number.isFinite(state[9]) ? state[9] : null,
      heading: typeof state[10] === "number" && Number.isFinite(state[10]) ? state[10] : null,
      vRate: typeof state[11] === "number" && Number.isFinite(state[11]) ? state[11] : null,
      onGround: state[8] === true,
      country: inferFlightCountry({
        country: typeof state[2] === "string" ? state[2] : undefined,
        icao,
        lat,
        lon,
      }),
      source: "OpenSky",
      baroAltFt:
        typeof state[7] === "number" && Number.isFinite(state[7]) ? state[7] / 0.3048 : undefined,
      vertRateFpm:
        typeof state[11] === "number" && Number.isFinite(state[11])
          ? state[11] / 0.00508
          : undefined,
      trackDeg:
        typeof state[10] === "number" && Number.isFinite(state[10]) ? state[10] : undefined,
      isMilitary: false,
      isMock: false,
    });
  }
  return dedupeByIcao(flights);
}

function normalizeAdsbx(raw: { ac?: AdsbxAircraft[] }): Flight[] {
  const flights = (raw.ac ?? [])
    .filter((ac) => typeof ac.lat === "number" && typeof ac.lon === "number")
    .map(
      (ac) =>
        ({
          icao: String(ac.hex ?? ""),
          callsign: ac.flight ? String(ac.flight).trim() || null : null,
          lat: Number(ac.lat),
          lon: Number(ac.lon),
          altM: feetToMeters(parseNumber(ac.alt_baro)),
          speedMs: knotsToMps(ac.gs ?? null),
          heading: typeof ac.track === "number" ? ac.track : null,
          vRate: fpmToMps(ac.baro_rate ?? null),
          onGround: ac.on_ground === true || ac.alt_baro === "ground",
          country: inferFlightCountry({
            country: undefined,
            icao: String(ac.hex ?? ""),
            lat: Number(ac.lat),
            lon: Number(ac.lon),
          }),
          registration: ac.reg ? String(ac.reg).trim() : undefined,
          aircraftType: ac.t ? String(ac.t).trim() : undefined,
          aircraftTypeDescription: ac.desc ? String(ac.desc).trim() : undefined,
          squawk: ac.squawk ?? undefined,
          route: ac.route ? String(ac.route).trim() : undefined,
          source: mapReceptionSource(ac),
          rssi: parseNumber(ac.rssi) ?? undefined,
          messageRate: parseNumber(ac.messages) ?? undefined,
          receivers: undefined,
          lastPosSec: parseNumber(ac.seen_pos) ?? undefined,
          lastSeenSec: parseNumber(ac.seen) ?? undefined,
          selectedAltitudeFt: parseNumber(ac.nav_altitude_mcp) ?? undefined,
          selectedHeadingDeg: parseNumber(ac.nav_heading) ?? undefined,
          windSpeedKt: parseNumber(ac.ws) ?? undefined,
          windDirectionFromDeg: parseNumber(ac.wd) ?? undefined,
          tatC: parseNumber(ac.tat) ?? undefined,
          oatC: parseNumber(ac.oat) ?? undefined,
          trueAirspeedKt: parseNumber(ac.tas) ?? undefined,
          indicatedAirspeedKt: parseNumber(ac.ias) ?? undefined,
          mach: parseNumber(ac.mach) ?? undefined,
          baroAltFt: parseNumber(ac.alt_baro) ?? undefined,
          geomAltFt: parseNumber(ac.alt_geom) ?? undefined,
          vertRateFpm: parseNumber(ac.baro_rate) ?? undefined,
          trackDeg: parseNumber(ac.track) ?? undefined,
          trueHeadingDeg: parseNumber(ac.true_heading) ?? undefined,
          magneticHeadingDeg: parseNumber(ac.mag_heading) ?? undefined,
          magDeclinationDeg: parseNumber(ac.mag_declination) ?? undefined,
          trackRateDegPerSec: parseNumber(ac.track_rate) ?? undefined,
          rollDeg: parseNumber(ac.roll) ?? undefined,
          navModes: Array.isArray(ac.nav_modes) ? ac.nav_modes.map((mode) => String(mode)) : undefined,
          adsbVersion:
            ac.version != null ? `v${String(ac.version).trim()}` : undefined,
          category: ac.category ? String(ac.category).trim() : undefined,
          dbFlags: ac.db_flags ? String(ac.db_flags).trim() : undefined,
          nacp: ac.nac_p != null ? String(ac.nac_p) : undefined,
          sil: ac.sil != null ? String(ac.sil) : undefined,
          nacv: ac.nac_v != null ? String(ac.nac_v) : undefined,
          nicBaro: ac.nic_baro != null ? String(ac.nic_baro) : undefined,
          rcMeters: parseNumber(ac.rc) ?? undefined,
          isMilitary: false,
        }) as Flight
    )
    .filter((f) => f.icao.length > 0);

  return dedupeByIcao(flights);
}

const FR24_SKIP = new Set(["full_count", "version", "stats", "selected_count", "source"]);

function normalizeFr24(raw: Record<string, unknown>): Flight[] {
  const flights: Flight[] = [];
  const dataSource =
    raw != null &&
    typeof (raw as { aircraft?: unknown }).aircraft === "object" &&
    (raw as { aircraft?: Record<string, unknown> }).aircraft != null
      ? (raw as { aircraft: Record<string, unknown> }).aircraft
      : raw;

  for (const [key, row] of Object.entries(dataSource)) {
    if (FR24_SKIP.has(key) || !Array.isArray(row) || row.length < 6) continue;
    const lat = Number(row[1]);
    const lon = Number(row[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    flights.push({
      icao: String(row[0] ?? key),
      callsign: typeof row[11] === "string" ? row[11].trim() || null : null,
      lat,
      lon,
      altM: typeof row[4] === "number" ? row[4] * 0.3048 : null,
      speedMs: typeof row[5] === "number" ? row[5] * 0.514444 : null,
      heading: typeof row[3] === "number" ? row[3] : null,
      vRate: null,
      onGround: row[4] === 0,
      country: inferFlightCountry({
        country: undefined,
        icao: String(row[0] ?? key),
        lat,
        lon,
      }),
      source: "FR24",
      isMilitary: false,
      isMock: false,
    });
  }

  return dedupeByIcao(flights);
}

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  return _fetchWithTimeout(url, options, FETCH_TIMEOUT_MS);
}

async function readJson<T>(res: Response, sourceLabel: string): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    const summary = text.slice(0, 120).replace(/\s+/g, " ").trim();
    if (/too many requests|rate limit|rate limited/i.test(summary)) {
      throw new RateLimitError(`${sourceLabel} rate limited`);
    }
    throw new Error(`${sourceLabel} returned non-JSON payload: ${summary || "<empty>"}`);
  }
}

async function fetchOpenSky(): Promise<Flight[]> {
  const username = process.env.OPENSKY_USERNAME;
  const password = process.env.OPENSKY_PASSWORD;

  const headers: Record<string, string> = {
    "User-Agent": "SIGINT/0.1 (educational/research use)",
  };

  if (username && password) {
    const credentials = Buffer.from(`${username}:${password}`).toString("base64");
    headers["Authorization"] = `Basic ${credentials}`;
  }

  const res = await fetchWithTimeout(`${OPENSKY_BASE}/states/all`, { headers, cache: "no-store" });
  if (res.status === 429) throw new RateLimitError("OpenSky rate limited (429)");
  if (res.status === 401) {
    throw new Error("OpenSky invalid credentials (check OPENSKY_USERNAME/OPENSKY_PASSWORD)");
  }
  if (!res.ok) throw new Error(`OpenSky returned ${res.status}`);

  const normalized = normalizeOpenSky(await readJson<OpenSkyResponse>(res, "OpenSky"));
  return balanceFlightsWorldwide(normalized, MAX_AIRCRAFT).flights;
}

async function fetchAdsbxGlobal(baseUrl: string, label: string): Promise<Flight[]> {
  const res = await fetchWithTimeout(globalUrl(baseUrl), {
    headers: { "User-Agent": "SIGINT/0.1 (educational/research use)" },
    cache: "no-store",
  });

  if (res.status === 429) throw new RateLimitError(`${label} rate limited (429)`);
  if (!res.ok) throw new Error(`${label} returned ${res.status}`);

  const normalized = normalizeAdsbx(await readJson<{ ac?: AdsbxAircraft[] }>(res, label));
  return balanceFlightsWorldwide(normalized, MAX_AIRCRAFT).flights;
}

function mergeRegionBatchesRoundRobin(regionBatches: Flight[][], limit: number): Flight[] {
  const cursors = new Array(regionBatches.length).fill(0);
  const seen = new Set<string>();
  const merged: Flight[] = [];
  let advanced = true;

  while (merged.length < limit && advanced) {
    advanced = false;
    for (let i = 0; i < regionBatches.length; i += 1) {
      const rows = regionBatches[i];
      while (cursors[i] < rows.length) {
        const next = rows[cursors[i]];
        cursors[i] += 1;
        if (!next.icao || seen.has(next.icao)) continue;
        seen.add(next.icao);
        merged.push(next);
        advanced = true;
        break;
      }
      if (merged.length >= limit) break;
    }
  }

  return merged;
}

async function fetchAdsbxMultiPoint(
  baseUrl: string,
  label: string,
  delayMs: number,
  minRegionSuccess: number
): Promise<Flight[]> {
  const headers = { "User-Agent": "SIGINT/0.1 (educational/research use)" as const };
  const regionBatches: Flight[][] = [];
  const failures: string[] = [];
  let rateLimitHits = 0;

  for (const region of ADSB_REGIONS) {
    const url = pointUrl(baseUrl, region);

    try {
      const res = await fetchWithTimeout(url, { headers, cache: "no-store" });
      if (res.status === 429) {
        rateLimitHits += 1;
        continue;
      }
      if (!res.ok) {
        failures.push(`${region.name}:${res.status}`);
        continue;
      }

      const normalized = normalizeAdsbx(
        await readJson<{ ac?: AdsbxAircraft[] }>(res, `${label}/${region.name}`)
      );
      if (normalized.length > 0) {
        regionBatches.push(normalized.slice(0, ADSB_REGION_MAX_PER_REGION));
      }
    } catch (err) {
      if (err instanceof RateLimitError) {
        rateLimitHits += 1;
      } else {
        failures.push(`${region.name}:${err instanceof Error ? err.message : "unknown"}`);
      }
    }

    if (delayMs > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, delayMs);
      });
    }
  }

  if (regionBatches.length < minRegionSuccess) {
    if (rateLimitHits > 0) {
      throw new RateLimitError(`${label} limited on ${rateLimitHits} regions`);
    }
    throw new Error(
      `${label} insufficient regional coverage (${regionBatches.length}/${minRegionSuccess})`
    );
  }

  if (failures.length > 0) {
    console.warn(`[api/opensky] ${label} partial region failures: ${failures.slice(0, 5).join(", ")}`);
  }

  return balanceFlightsWorldwide(
    mergeRegionBatchesRoundRobin(regionBatches, MAX_AIRCRAFT),
    MAX_AIRCRAFT
  ).flights;
}

async function fetchFr24(): Promise<Flight[]> {
  const res = await fetchWithTimeout(FR24_URL, {
    headers: { "User-Agent": "SIGINT/0.1 (educational/research use)" },
    cache: "no-store",
  });
  if (res.status === 429) throw new RateLimitError("flightradar24 rate limited (429)");
  if (!res.ok) throw new Error(`flightradar24 returned ${res.status}`);

  const normalized = normalizeFr24(await readJson<Record<string, unknown>>(res, "flightradar24"));
  return balanceFlightsWorldwide(normalized, MAX_AIRCRAFT).flights;
}

async function handler(_request: Request) {
  const now = Date.now();

  if (cache && cache.expires > now) {
    return NextResponse.json(cache.data, {
      headers: { "Cache-Control": "public, max-age=12" },
    });
  }

  const sources: Array<{
    name: string;
    fn: () => Promise<Flight[]>;
    ttl: number;
    min: number;
  }> = [
    { name: "opensky", fn: fetchOpenSky, ttl: OPENSKY_TTL_MS, min: 50 },
    { name: "adsb.lol-global", fn: () => fetchAdsbxGlobal(ADSBLOL_BASE, "adsb.lol"), ttl: TTL_MS, min: 200 },
    {
      name: "adsb.lol-regions",
      fn: () => fetchAdsbxMultiPoint(ADSBLOL_BASE, "adsb.lol", 250, ADSB_REGION_MIN_SUCCESS),
      ttl: TTL_MS,
      min: 100,
    },
    {
      name: "airplanes.live-regions",
      fn: () => fetchAdsbxMultiPoint(AIRPLANESLIVE_BASE, "airplanes.live", 1_000, 3),
      ttl: TTL_MS,
      min: 100,
    },
    { name: "flightradar24", fn: fetchFr24, ttl: TTL_MS, min: 1 },
  ];

  for (const source of sources) {
    if (sourceBackoff[source.name] && now < sourceBackoff[source.name]) {
      console.log(`[api/opensky] ${source.name} in backoff, skipping`);
      continue;
    }

    try {
      const data = await source.fn();
      if (data.length >= source.min) {
        cache = { data, expires: now + source.ttl };
        console.log(
          `[api/opensky] ${source.name} returned ${data.length} flights (${formatRegionSummary(
            summarizeWorldRegions(data)
          )})`
        );
        return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
      }
      console.warn(
        `[api/opensky] ${source.name} returned only ${data.length} flights (min ${source.min}), trying next`
      );
    } catch (err) {
      if (err instanceof RateLimitError) {
        sourceBackoff[source.name] = now + BACKOFF_MS;
        console.warn(`[api/opensky] ${source.name} rate limited, backing off for 2 min`);
      } else {
        console.warn(
          `[api/opensky] ${source.name} failed:`,
          err instanceof Error ? err.message : err
        );
      }
    }
  }

  if (cache?.data?.length) {
    console.warn("[api/opensky] all sources failed, serving stale cache");
    return NextResponse.json(cache.data, { headers: { "Cache-Control": "no-store" } });
  }

  console.warn("[api/opensky] all sources failed, serving mock data");
  return NextResponse.json(MOCK_COMMERCIAL, { headers: { "Cache-Control": "no-store" } });
}

export const GET = withRateLimit(STANDARD_LIMITER, handler);
