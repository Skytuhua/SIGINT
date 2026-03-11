import { NextResponse } from 'next/server';
import type { Flight } from '../../../lib/providers/types';
import { inferFlightCountry } from '../../../lib/geo/country';

export const dynamic = 'force-dynamic';

// ── Source endpoints ────────────────────────────────────────────────────────

const ADSBX_MIL_URL = process.env.ADSBX_MILITARY_URL ?? 'https://api.adsb.lol/v2/mil';
const ADSBLOL_BASE = process.env.ADSBX_COMMERCIAL_URL ?? 'https://api.adsb.lol/v2';
const AIRPLANESLIVE_BASE = 'https://api.airplanes.live/v2';

const TTL_MS = 12_000;
const FETCH_TIMEOUT_MS = 18_000;
const BACKOFF_MS = 120_000;

const UA = { 'User-Agent': 'SIGINT/0.1 (educational/research use)' } as const;

let cacheP1: { data: Flight[]; expires: number } | null = null;
let cacheP2: { data: Flight[]; expires: number } | null = null;
let cacheP3: { data: Flight[]; expires: number } | null = null;
let cacheFull: { data: Flight[]; expires: number } | null = null;
const sourceBackoff: Record<string, number> = {};

// ── Military aircraft type codes (ICAO type designators) ────────────────────
// Exclusively military types — every aircraft of these types is military.
const EXCLUSIVE_MIL_TYPES = [
  // Transport
  'C17', 'C130', 'C30J', 'C5M', 'C5', 'A400', 'Y20', 'IL76', 'AN124', 'C27J', 'KC30',
  // Tanker
  'K35R', 'K35E', 'K35A', 'KC10', 'KC46',
  // ISR / AWACS / Patrol / EW
  'E3CF', 'E3TF', 'E6B', 'P8', 'E2HK', 'RC135',
  'E8', 'E4B', 'RC12', 'RC26', 'U2', 'EP3', 'JSTR', 'EC30',
  // UAV
  'GLHK', 'MQ9', 'HRON', 'MQ1', 'RQ4', 'MQ4C', 'BT4B',
  // Bombers
  'B52H', 'B1B', 'B2', 'TU95', 'TU160', 'TU22M',
  // Fighters
  'F16', 'F15', 'F35', 'EUFI', 'RFAL', 'TORN', 'F18H', 'F18S', 'FA18',
  'F22', 'F14', 'SU27', 'SU30', 'SU34', 'SU35', 'MG29', 'MG31', 'JF17',
  'J10', 'J11', 'JAS39', 'AV8B', 'F5',
  // Helicopters / Tiltrotor (exclusively military)
  'V22', 'AH64', 'H64', 'AH1Z', 'AH1W',
  // Trainers (exclusively military)
  'T38', 'T6', 'HAWK', 'M346', 'T45', 'L39', 'MB39',
  // Maritime patrol / ASW
  'SH60', 'MH60', 'S3', 'ATL', 'NIMR',
];

// Dual-use types — used by both civilian and military operators.
// Results from these queries are filtered through isMilitaryAircraft().
const DUAL_USE_TYPES = [
  // Transport (civilian variants exist)
  'C2', 'C295', 'CN35', 'C160', 'AN12', 'AN26', 'A310',
  // Tanker (civilian airframe variants)
  'A332', 'A339',
  // ISR (civilian base airframes)
  'P3', 'MC12', 'BE20',
  // Helicopters (civilian variants)
  'H60', 'H47', 'NH90', 'H53', 'UH1', 'S70', 'S92', 'A109', 'A139', 'A149', 'AS32',
  // Trainers (civilian variants)
  'PC21', 'PC9', 'PC7',
];

// ── Military squawk codes ───────────────────────────────────────────────────
const MIL_SQUAWKS = [
  '0100', '0200', '0300', '0400',
  '7001', '7002', '7003', '7004',
  '4401', '4402', '4403', '4404', '4405',
  '5100', '5200', '5300', '5400',
  '1277', '1276', '1275',
];

// ── Military-dense regions for geographic scanning ──────────────────────────
type MilRegion = { name: string; lat: number; lon: number; radiusNm: number };

const MIL_REGIONS: MilRegion[] = [
  // Continental US
  { name: 'conus-east',    lat: 36.0, lon: -77.0,  radiusNm: 450 },
  { name: 'conus-central', lat: 35.0, lon: -98.0,  radiusNm: 500 },
  { name: 'conus-west',    lat: 34.0, lon: -118.0, radiusNm: 400 },
  // Europe — NATO
  { name: 'europe-west',   lat: 51.0, lon: 2.0,    radiusNm: 500 },
  { name: 'europe-east',   lat: 50.5, lon: 22.0,   radiusNm: 450 },
  // Middle East — CENTCOM / active conflict
  { name: 'gulf',          lat: 25.0, lon: 52.0,    radiusNm: 500 },
  { name: 'levant',        lat: 33.0, lon: 36.0,    radiusNm: 400 },
  // East Asia — INDOPACOM
  { name: 'east-asia',     lat: 36.0, lon: 128.0,   radiusNm: 500 },
  { name: 'south-china-sea', lat: 15.0, lon: 115.0, radiusNm: 500 },
  // Other high-activity
  { name: 'uk-atlantic',   lat: 55.0, lon: -5.0,    radiusNm: 400 },
  { name: 'india',         lat: 28.0, lon: 77.0,    radiusNm: 450 },
  { name: 'black-sea',     lat: 44.0, lon: 34.0,    radiusNm: 350 },
];

// ── Military identification ─────────────────────────────────────────────────

// Known military ICAO hex prefixes (uppercase).
// Each entry is tested via startsWith against the uppercased ICAO hex.
const MIL_ICAO_PREFIXES = [
  // United States (DoD block AE0000-AFFFFF)
  'AE', 'AF',
  // United Kingdom (43C000-43CFFF)
  '43C',
  // France (3A0000-3AFFFF + 3B0000-3BFFFF)
  '3A', '3B',
  // Germany (3F0000-3FFFFF)
  '3F',
  // Italy (33F000-33FFFF)
  '33F',
  // Spain (34 range)
  '34',
  // Netherlands (48)
  '480',
  // Australia (7C military sub-range)
  '7CF',
  // Canada (C0 military sub-range)
  'C0F',
  // Israel (738)
  '738',
  // Turkey (E4)
  'E40',
  // Saudi Arabia (710000-717FFF)
  '710',
  // Brazil (E49)
  'E49',
  // India (800-803 mil)
  '800', '801', '802', '803',
  // Japan (840-843)
  '840', '841', '842', '843',
  // South Korea (718000-71FFFF)
  '718',
  // UAE (896)
  '896',
  // Yemen
  '8A8',
  // Syria
  '900',
  // NATO joint (various)
  '3E0', '3E1', '3E2', '3E3',
  // Poland (504)
  '504',
  // Norway (478)
  '478',
  // Denmark (458)
  '458',
  // Greece (468)
  '468',
  // Belgium (44F)
  '44F',
  // Sweden (4A0 military subrange)
  '4A0',
  // Czech Republic (498)
  '498',
  // Romania (4A8)
  '4A8',
  // Ukraine (508)
  '508',
  // Qatar (06A)
  '06A',
  // Egypt (700)
  '700',
  // Pakistan (PAF range)
  '740',
  // Singapore (76B)
  '76B',
  // Taiwan (899)
  '899',
];

// Known military callsign prefixes (uppercase match).
const MIL_CALLSIGN_PREFIXES = [
  'RCH', 'REACH', 'EVAC', 'DUKE', 'VIPER', 'TOPCAT', 'HAWK', 'THUD',
  'RRR', 'ASCOT', 'NATO', 'GAF', 'IAM', 'FAF', 'BAF', 'RFR', 'HRZ',
  'PAF', 'SPAR', 'SAM', 'EXEC', 'VALOR', 'JAKE', 'CHAOS', 'ANGRY',
  'ETHYL', 'IRON', 'STEEL', 'SWIFT', 'BOLT', 'DARK', 'NIGHT', 'GHOST',
  'REAPER', 'FORTE', 'NCHO', 'NAVY', 'ARMY', 'USAF', 'USMC', 'CGRD',
  'ORCA', 'BOXER', 'COBRA', 'EAGLE', 'TIGER', 'RAMBO', 'HAVOC', 'TANGO',
  'HOBO', 'TABOO', 'CYLON', 'BLADE', 'TORCH', 'LANCE', 'RIFLE', 'SHELL',
  'SNIPER', 'DEMON', 'ROGUE', 'RAPTOR', 'TALON', 'STING', 'DAGGER',
  'CNV', 'CFC', 'MMF', 'MAG', 'RESCUE', 'PEDRO', 'DUSTOFF', 'MEDEVAC',
  // US CENTCOM theater
  'NEON', 'TROUT', 'HOMER', 'MAGIC', 'BONE', 'GRIZZLY',
  // Regional air forces (Middle East)
  'RSAF', 'KAF', 'RJF', 'EAF', 'COTAM', 'CTM',
  // Additional US military
  'DOOM', 'WEASEL', 'RAVEN', 'SPECTRE', 'JOKER', 'VENOM', 'PYTHON',
  // NATO AWACS
  'NAEW',
  // UK
  'RAFTER', 'TARTAN', 'LOSSIE',
  // French military
  'FRENCH', 'AEREA',
  // German military
  'DCH', 'GAFFA',
  // Additional Middle East / Asia
  'EMIRI', 'IQAF', 'JASDF',
];

function isMilitaryAircraft(ac: AdsbxAircraft): boolean {
  // 1. db_flags check — bitwise: bit 0 = military, bit 2 = PIA, bit 3 = LADD
  const flagsNum = parseInt(String(ac.db_flags ?? '0').trim(), 10);
  if (!isNaN(flagsNum) && (flagsNum & 1) !== 0) return true;

  const hex = String(ac.hex ?? '').trim().toUpperCase();

  // 2. ICAO hex range check
  for (const prefix of MIL_ICAO_PREFIXES) {
    if (hex.startsWith(prefix)) return true;
  }

  // 3. Callsign pattern check
  const cs = String(ac.flight ?? '').trim().toUpperCase();
  if (cs) {
    for (const prefix of MIL_CALLSIGN_PREFIXES) {
      if (cs.startsWith(prefix)) return true;
    }
  }

  return false;
}

// ── ADSBX data types & normalization ────────────────────────────────────────

type AdsbxAircraft = {
  hex?: string;
  flight?: string | null;
  lat?: number | null;
  lon?: number | null;
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

const MOCK_MILITARY: Flight[] = [
  { icao: 'AE1234', callsign: 'VIPER01', lat: 38.9, lon: -77.0, altM: 9000, speedMs: 240, heading: 45, vRate: 0, onGround: false, country: 'United States', isMilitary: true, isMock: true },
  { icao: '43C401', callsign: 'RRR7702', lat: 51.8, lon: -1.2, altM: 9500, speedMs: 250, heading: 320, vRate: 0, onGround: false, country: 'United Kingdom', isMilitary: true, isMock: true },
  { icao: '3C6C94', callsign: 'GAF683', lat: 49.3, lon: 8.4, altM: 7000, speedMs: 210, heading: 60, vRate: 3, onGround: false, country: 'Germany', isMilitary: true, isMock: true },
];

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
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Map readsb/tar1090 `type` field to human-readable reception source label. */
function mapReceptionSource(ac: AdsbxAircraft): string {
  const raw = String(ac.type ?? ac.src ?? '').trim().toLowerCase();
  if (!raw) return 'ADS-B';
  if (raw === 'adsb_icao' || raw === 'adsb_icao_nt' || raw === 'adsb_other') return 'ADS-B';
  if (raw === 'adsr_icao' || raw === 'adsr_other') return 'UAT / ADS-R';
  if (raw === 'uat' || raw === 'uat_other') return 'UAT / ADS-R';
  if (raw === 'tisb_icao' || raw === 'tisb_trackfile' || raw === 'tisb_other') return 'TIS-B';
  if (raw === 'mlat') return 'MLAT';
  if (raw === 'mode_s') return 'Mode-S';
  if (raw === 'mode_ac') return 'Mode-S';
  if (raw === 'adsc' || raw === 'adsb_adsc') return 'ADS-C';
  return 'Other';
}

function hasPosition(ac: AdsbxAircraft): boolean {
  return typeof ac.lat === 'number' && typeof ac.lon === 'number';
}

function hasRoughPosition(ac: AdsbxAircraft): boolean {
  return typeof ac.rr_lat === 'number' && typeof ac.rr_lon === 'number';
}

function normalizeAc(ac: AdsbxAircraft): Flight | null {
  if (!hasPosition(ac) && !hasRoughPosition(ac)) return null;
  const lat = hasPosition(ac) ? ac.lat! : ac.rr_lat!;
  const lon = hasPosition(ac) ? ac.lon! : ac.rr_lon!;
  const icao = String(ac.hex ?? '').trim();
  if (!icao) return null;

  return {
    icao,
    callsign: ac.flight ? String(ac.flight).trim() || null : null,
    lat: Number(lat),
    lon: Number(lon),
    altM: feetToMeters(parseNumber(ac.alt_baro)),
    speedMs: knotsToMps(ac.gs ?? null),
    heading: typeof ac.track === 'number' ? ac.track : null,
    vRate: fpmToMps(ac.baro_rate ?? null),
    onGround: ac.on_ground === true || ac.alt_baro === 'ground',
    country: inferFlightCountry({
      country: undefined,
      icao,
      lat: Number(lat),
      lon: Number(lon),
    }),
    registration: ac.reg ? String(ac.reg).trim() : undefined,
    aircraftType: ac.t ? String(ac.t).trim() : undefined,
    aircraftTypeDescription: ac.desc ? String(ac.desc).trim() : undefined,
    squawk: ac.squawk ?? undefined,
    route: ac.route ? String(ac.route).trim() : undefined,
    source: mapReceptionSource(ac),
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
    navModes: Array.isArray(ac.nav_modes) ? ac.nav_modes.map((m) => String(m)) : undefined,
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
}

/** Normalize raw ADSBX response — all aircraft marked military. */
function normalizeAdsbxAllMil(raw: { ac?: AdsbxAircraft[] }): Flight[] {
  const result: Flight[] = [];
  for (const ac of raw.ac ?? []) {
    const f = normalizeAc(ac);
    if (f) result.push(f);
  }
  return result;
}

/** Normalize raw ADSBX response — filter for military only using classifier. */
function normalizeAdsbxFilterMil(raw: { ac?: AdsbxAircraft[] }): Flight[] {
  const result: Flight[] = [];
  for (const ac of raw.ac ?? []) {
    if (!isMilitaryAircraft(ac)) continue;
    const f = normalizeAc(ac);
    if (f) result.push(f);
  }
  return result;
}

// ── Deduplication ───────────────────────────────────────────────────────────

function dedupeByIcao(flights: Flight[]): Flight[] {
  const seen = new Map<string, Flight>();
  for (const f of flights) {
    const key = f.icao.toLowerCase();
    const existing = seen.get(key);
    // Keep the entry with more telemetry (higher message rate)
    if (!existing || (f.messageRate ?? 0) > (existing.messageRate ?? 0)) {
      seen.set(key, f);
    }
  }
  const result: Flight[] = [];
  seen.forEach((f) => result.push(f));
  return result;
}

// ── Fetch helpers ───────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readJson<T>(res: Response, label: string): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${label} returned non-JSON: ${text.slice(0, 100)}`);
  }
}

// ── Source 1: adsb.lol dedicated /v2/mil endpoint ────────────────────────────

async function fetchMilDedicated(): Promise<Flight[]> {
  const res = await fetchWithTimeout(ADSBX_MIL_URL, { headers: UA, cache: 'no-store' });
  if (!res.ok) throw new Error(`mil-dedicated returned ${res.status}`);
  return normalizeAdsbxAllMil(await readJson<{ ac?: AdsbxAircraft[] }>(res, 'mil-dedicated'));
}

// ── Source 2: airplanes.live dedicated /v2/mil endpoint ──────────────────────

async function fetchMilDedicatedAirplanesLive(): Promise<Flight[]> {
  const url = `${AIRPLANESLIVE_BASE}/mil`;
  const res = await fetchWithTimeout(url, { headers: UA, cache: 'no-store' });
  if (!res.ok) throw new Error(`aplive-mil-dedicated returned ${res.status}`);
  return normalizeAdsbxAllMil(await readJson<{ ac?: AdsbxAircraft[] }>(res, 'aplive-mil-dedicated'));
}

// ── Source 3+4: LADD restricted aircraft (filter for military) ───────────────

async function fetchLadd(baseUrl: string, label: string): Promise<Flight[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/ladd`;
  const res = await fetchWithTimeout(url, { headers: UA, cache: 'no-store' });
  if (!res.ok) throw new Error(`${label} returned ${res.status}`);
  return normalizeAdsbxFilterMil(await readJson<{ ac?: AdsbxAircraft[] }>(res, label));
}

// ── Source 5+6: PIA privacy ICAO (anonymized military/gov aircraft) ──────────

async function fetchPia(baseUrl: string, label: string): Promise<Flight[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/pia`;
  const res = await fetchWithTimeout(url, { headers: UA, cache: 'no-store' });
  if (!res.ok) throw new Error(`${label} returned ${res.status}`);
  // PIA aircraft use anonymized hex — can't classify by ICAO, include all
  return normalizeAdsbxAllMil(await readJson<{ ac?: AdsbxAircraft[] }>(res, label));
}

// ── Source 7: Type-based queries (military types globally) ───────────────────

async function fetchMilByTypes(baseUrl: string, label: string): Promise<Flight[]> {
  const root = baseUrl.replace(/\/$/, '');
  const BATCH_SIZE = 8;
  const BATCH_DELAY_MS = 200;
  const all: Flight[] = [];

  // Combine both lists with a flag for which normalizer to use
  const allTypes: Array<{ code: string; exclusive: boolean }> = [
    ...EXCLUSIVE_MIL_TYPES.map((code) => ({ code, exclusive: true })),
    ...DUAL_USE_TYPES.map((code) => ({ code, exclusive: false })),
  ];

  for (let i = 0; i < allTypes.length; i += BATCH_SIZE) {
    const batch = allTypes.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async ({ code, exclusive }) => {
        const url = `${root}/type/${code}`;
        try {
          const res = await fetchWithTimeout(url, { headers: UA, cache: 'no-store' });
          if (!res.ok) return [];
          const raw = await readJson<{ ac?: AdsbxAircraft[] }>(res, `${label}/${code}`);
          return exclusive ? normalizeAdsbxAllMil(raw) : normalizeAdsbxFilterMil(raw);
        } catch {
          return [];
        }
      })
    );
    for (const r of results) {
      if (r.status === 'fulfilled') all.push(...r.value);
    }
    if (i + BATCH_SIZE < allTypes.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }
  return all;
}

// ── Source 8: Squawk-based queries ───────────────────────────────────────────

async function fetchMilBySquawks(baseUrl: string, label: string): Promise<Flight[]> {
  const root = baseUrl.replace(/\/$/, '');
  const BATCH_SIZE = 5;
  const BATCH_DELAY_MS = 200;
  const all: Flight[] = [];

  for (let i = 0; i < MIL_SQUAWKS.length; i += BATCH_SIZE) {
    const batch = MIL_SQUAWKS.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (sqk) => {
        const url = `${root}/sqk/${sqk}`;
        try {
          const res = await fetchWithTimeout(url, { headers: UA, cache: 'no-store' });
          if (!res.ok) return [];
          // Filter through classifier since some squawks are shared with civilian
          return normalizeAdsbxFilterMil(
            await readJson<{ ac?: AdsbxAircraft[] }>(res, `${label}/sqk-${sqk}`)
          );
        } catch {
          return [];
        }
      })
    );
    for (const r of results) {
      if (r.status === 'fulfilled') all.push(...r.value);
    }
    if (i + BATCH_SIZE < MIL_SQUAWKS.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }
  return all;
}

// ── Source 9: Regional geographic scanning ───────────────────────────────────

async function fetchMilByRegions(baseUrl: string, label: string): Promise<Flight[]> {
  const root = baseUrl.replace(/\/$/, '');
  const REGION_BATCH = 4;
  const REGION_DELAY_MS = 300;
  const all: Flight[] = [];

  for (let i = 0; i < MIL_REGIONS.length; i += REGION_BATCH) {
    const batch = MIL_REGIONS.slice(i, i + REGION_BATCH);
    const results = await Promise.allSettled(
      batch.map(async (region) => {
        const url = `${root}/point/${region.lat}/${region.lon}/${region.radiusNm}`;
        try {
          const res = await fetchWithTimeout(url, { headers: UA, cache: 'no-store' });
          if (!res.ok) return [];
          // Filter ALL results through military classifier
          return normalizeAdsbxFilterMil(
            await readJson<{ ac?: AdsbxAircraft[] }>(res, `${label}/${region.name}`)
          );
        } catch {
          return [];
        }
      })
    );
    for (const r of results) {
      if (r.status === 'fulfilled') all.push(...r.value);
    }
    if (i + REGION_BATCH < MIL_REGIONS.length) {
      await new Promise((resolve) => setTimeout(resolve, REGION_DELAY_MS));
    }
  }
  return all;
}

// ── GET handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const url = new URL(request.url);
  const live = url.searchParams.get('live') === '1';
  const phase = url.searchParams.get('phase'); // '1', '2', '3', or null (all)
  const now = Date.now();

  // ── Dedicated endpoints (Phase 1) ─────────────────────────────────────────
  const dedicatedSources: Array<{ name: string; fn: () => Promise<Flight[]> }> = [
    { name: 'mil-dedicated', fn: fetchMilDedicated },
    { name: 'aplive-mil', fn: fetchMilDedicatedAirplanesLive },
    { name: 'adsblol-ladd', fn: () => fetchLadd(ADSBLOL_BASE, 'adsblol-ladd') },
    { name: 'aplive-ladd', fn: () => fetchLadd(AIRPLANESLIVE_BASE, 'aplive-ladd') },
    { name: 'adsblol-pia', fn: () => fetchPia(ADSBLOL_BASE, 'adsblol-pia') },
    { name: 'aplive-pia', fn: () => fetchPia(AIRPLANESLIVE_BASE, 'aplive-pia') },
  ];

  // ── Type + squawk queries (Phase 2) ───────────────────────────────────────
  const typeSources: Array<{ name: string; fn: () => Promise<Flight[]> }> = [
    { name: 'adsblol-types', fn: () => fetchMilByTypes(ADSBLOL_BASE, 'adsblol-types') },
    { name: 'aplive-types', fn: () => fetchMilByTypes(AIRPLANESLIVE_BASE, 'aplive-types') },
    { name: 'adsblol-squawks', fn: () => fetchMilBySquawks(ADSBLOL_BASE, 'adsblol-sqk') },
    { name: 'aplive-squawks', fn: () => fetchMilBySquawks(AIRPLANESLIVE_BASE, 'aplive-sqk') },
  ];

  // ── Regional scanning (Phase 3) ───────────────────────────────────────────
  const regionSources: Array<{ name: string; fn: () => Promise<Flight[]> }> = [
    { name: 'adsblol-regions', fn: () => fetchMilByRegions(ADSBLOL_BASE, 'adsblol-region') },
    { name: 'aplive-regions', fn: () => fetchMilByRegions(AIRPLANESLIVE_BASE, 'aplive-region') },
  ];

  const runSource = async (s: { name: string; fn: () => Promise<Flight[]> }) => {
    if (sourceBackoff[s.name] && now < sourceBackoff[s.name]) return [] as Flight[];
    try {
      const result = await s.fn();
      console.log(`[api/military] ${s.name}: ${result.length} aircraft`);
      return result;
    } catch (err) {
      console.warn(`[api/military] ${s.name} failed:`, err instanceof Error ? err.message : err);
      sourceBackoff[s.name] = now + BACKOFF_MS;
      return [] as Flight[];
    }
  };

  const collectResults = (settled: PromiseSettledResult<Flight[]>[]): Flight[] => {
    const out: Flight[] = [];
    for (const r of settled) {
      if (r.status === 'fulfilled') out.push(...r.value);
    }
    return out;
  };

  const respond = (data: Flight[]) =>
    NextResponse.json(data, { headers: { 'Cache-Control': 'public, max-age=12' } });

  // ── Phase 1 only ──────────────────────────────────────────────────────────
  if (phase === '1') {
    if (!live && cacheP1 && cacheP1.expires > now) return respond(cacheP1.data);

    const results = await Promise.allSettled(dedicatedSources.map(runSource));
    const deduped = dedupeByIcao(collectResults(results));
    if (deduped.length > 0) {
      cacheP1 = { data: deduped, expires: now + TTL_MS };
      console.log(`[api/military] phase1: ${deduped.length} unique signals`);
      return respond(deduped);
    }
    if (cacheP1?.data?.length) return respond(cacheP1.data);
    return respond(MOCK_MILITARY);
  }

  // ── Phase 2 only ──────────────────────────────────────────────────────────
  if (phase === '2') {
    if (!live && cacheP2 && cacheP2.expires > now) return respond(cacheP2.data);

    const results = await Promise.allSettled(typeSources.map(runSource));
    const deduped = dedupeByIcao(collectResults(results));
    cacheP2 = { data: deduped, expires: now + TTL_MS };
    console.log(`[api/military] phase2: ${deduped.length} unique signals`);
    return respond(deduped);
  }

  // ── Phase 3 only (regional scanning) ──────────────────────────────────────
  if (phase === '3') {
    if (!live && cacheP3 && cacheP3.expires > now) return respond(cacheP3.data);

    const results = await Promise.allSettled(regionSources.map(runSource));
    const deduped = dedupeByIcao(collectResults(results));
    cacheP3 = { data: deduped, expires: now + TTL_MS };
    console.log(`[api/military] phase3 (regional): ${deduped.length} unique signals`);
    return respond(deduped);
  }

  // ── All phases (backward compat) ──────────────────────────────────────────
  if (!live && cacheFull && cacheFull.expires > now) return respond(cacheFull.data);

  const p1 = await Promise.allSettled(dedicatedSources.map(runSource));
  const p2 = await Promise.allSettled(typeSources.map(runSource));
  const p3 = await Promise.allSettled(regionSources.map(runSource));
  const deduped = dedupeByIcao([...collectResults(p1), ...collectResults(p2), ...collectResults(p3)]);

  if (deduped.length > 0) {
    cacheFull = { data: deduped, expires: now + TTL_MS };
    console.log(`[api/military] total: ${deduped.length} unique military signals`);
    return respond(deduped);
  }
  if (cacheFull?.data?.length) {
    console.warn('[api/military] all sources returned 0, serving stale cache');
    return NextResponse.json(cacheFull.data, { headers: { 'Cache-Control': 'no-store' } });
  }
  console.warn('[api/military] all sources failed, serving mock data');
  return NextResponse.json(MOCK_MILITARY, { headers: { 'Cache-Control': 'public, max-age=60' } });
}
