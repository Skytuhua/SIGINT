import { NextResponse } from 'next/server';
import type { Flight } from '../../../lib/providers/types';
import { inferFlightCountry } from '../../../lib/geo/country';

export const dynamic = 'force-dynamic';

const ADSBX_URL = process.env.ADSBX_MILITARY_URL ?? 'https://api.adsb.lol/v2/mil';
const TTL_MS = 12_000;
const FETCH_TIMEOUT_MS = 15_000;

let cache: { data: Flight[]; expires: number } | null = null;

// Kept as a fallback so the layer can still render when upstream is unreachable.
const MOCK_MILITARY: Flight[] = [
  {
    icao: 'AE1234',
    callsign: 'VIPER01',
    lat: 38.9,
    lon: -77.0,
    altM: 9000,
    speedMs: 240,
    heading: 45,
    vRate: 0,
    onGround: false,
    country: 'United States',
    isMilitary: true,
    isMock: true,
  },
  {
    icao: '43C401',
    callsign: 'RRR7702',
    lat: 51.8,
    lon: -1.2,
    altM: 9500,
    speedMs: 250,
    heading: 320,
    vRate: 0,
    onGround: false,
    country: 'United Kingdom',
    isMilitary: true,
    isMock: true,
  },
  {
    icao: '3C6C94',
    callsign: 'GAF683',
    lat: 49.3,
    lon: 8.4,
    altM: 7000,
    speedMs: 210,
    heading: 60,
    vRate: 3,
    onGround: false,
    country: 'Germany',
    isMilitary: true,
    isMock: true,
  },
];

type AdsbxAircraft = {
  hex?: string;
  flight?: string | null;
  lat?: number | null;
  lon?: number | null;
  /** Rough/reported position when no precise lat/lon (e.g. Mode S) */
  rr_lat?: number | null;
  rr_lon?: number | null;
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

function feetToMeters(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value * 0.3048 : null;
}

function knotsToMps(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value * 0.514444 : null;
}

function fpmToMps(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value * 0.00508 : null;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function hasPosition(ac: AdsbxAircraft): ac is AdsbxAircraft & { lat: number; lon: number } {
  return typeof ac.lat === 'number' && typeof ac.lon === 'number';
}

function hasRoughPosition(ac: AdsbxAircraft): ac is AdsbxAircraft & { rr_lat: number; rr_lon: number } {
  return typeof ac.rr_lat === 'number' && typeof ac.rr_lon === 'number';
}

function normalizeAdsbx(raw: { ac?: AdsbxAircraft[] }): Flight[] {
  return (raw.ac ?? [])
    .filter((ac) => hasPosition(ac) || hasRoughPosition(ac))
    .map((ac) => {
      const altRaw = typeof ac.alt_baro === 'number' ? ac.alt_baro : null;
      const onGround = ac.on_ground === true || ac.alt_baro === 'ground';
      const lat = hasPosition(ac) ? ac.lat : (ac as AdsbxAircraft & { rr_lat: number; rr_lon: number }).rr_lat;
      const lon = hasPosition(ac) ? ac.lon : (ac as AdsbxAircraft & { rr_lat: number; rr_lon: number }).rr_lon;

      return {
        icao: String(ac.hex ?? ''),
        callsign: ac.flight ? String(ac.flight).trim() || null : null,
        lat: Number(lat),
        lon: Number(lon),
        altM: feetToMeters(parseNumber(ac.alt_baro) ?? altRaw),
        speedMs: knotsToMps(ac.gs ?? null),
        heading: typeof ac.track === 'number' ? ac.track : null,
        vRate: fpmToMps(ac.baro_rate ?? null),
        onGround,
        country: inferFlightCountry({
          country: undefined,
          icao: String(ac.hex ?? ''),
          lat: Number(lat),
          lon: Number(lon),
        }),
        registration: ac.reg ? String(ac.reg).trim() : undefined,
        aircraftType: ac.t ? String(ac.t).trim() : undefined,
        aircraftTypeDescription: ac.desc ? String(ac.desc).trim() : undefined,
        squawk: ac.squawk ?? undefined,
        route: ac.route ? String(ac.route).trim() : undefined,
        source: ac.src ? String(ac.src).trim() : "ADS-B",
        rssi: parseNumber(ac.rssi) ?? undefined,
        messageRate: parseNumber(ac.messages) ?? undefined,
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
        adsbVersion: ac.version != null ? `v${String(ac.version).trim()}` : undefined,
        category: ac.category ? String(ac.category).trim() : undefined,
        dbFlags: ac.db_flags ? String(ac.db_flags).trim() : undefined,
        nacp: ac.nac_p != null ? String(ac.nac_p) : undefined,
        sil: ac.sil != null ? String(ac.sil) : undefined,
        nacv: ac.nac_v != null ? String(ac.nac_v) : undefined,
        nicBaro: ac.nic_baro != null ? String(ac.nic_baro) : undefined,
        rcMeters: parseNumber(ac.rc) ?? undefined,
        isMilitary: true,
        isMock: false,
      };
    })
    .filter((f) => f.icao.length > 0);
}

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const live = url.searchParams.get('live') === '1';
  const now = Date.now();
  if (!live && cache && cache.expires > now) {
    return NextResponse.json(cache.data, {
      headers: { 'Cache-Control': 'public, max-age=12' },
    });
  }

  try {
    const res = await fetchWithTimeout(ADSBX_URL, {
      headers: {
        'User-Agent': 'WorldView/0.1 (educational/research use)',
      },
      cache: 'no-store',
    });

    if (!res.ok) throw new Error(`ADSBX returned ${res.status}`);

    const raw = await res.json();
    const data = normalizeAdsbx(raw);
    // No client-side limit: we return the full API response. If you see ~25, that is the adsb.lol /v2/mil response size.

    cache = { data, expires: now + TTL_MS };
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, max-age=12' },
    });
  } catch (err) {
    console.error('[api/military] fetch error:', err);
    if (cache) return NextResponse.json(cache.data);
    return NextResponse.json(MOCK_MILITARY, {
      headers: { 'Cache-Control': 'public, max-age=60' },
    });
  }
}
