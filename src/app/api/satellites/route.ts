import { NextResponse } from 'next/server';
import type { Satellite } from '../../../lib/providers/types';
import { STANDARD_LIMITER } from '../../../lib/server/rateLimitPresets';
import { withRateLimit } from '../../../lib/server/withRateLimit';

const SATELLITE_FEED_URLS = [
  'https://db.satnogs.org/api/tle/?format=json',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle',
  'https://www.celestrak.com/NORAD/elements/active.txt',
  'https://www.amsat.org/tle/current/nasabare.txt',
];
const TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_TLES = 2000;

let cache: { data: Satellite[]; expires: number } | null = null;

const FALLBACK_TLES: Satellite[] = [
  {
    name: 'ISS (ZARYA)',
    noradId: '25544',
    tle1: '1 25544U 98067A   24166.51839120  .00016717  00000+0  30382-3 0  9995',
    tle2: '2 25544  51.6392 180.7690 0003682  78.6863  39.3982 15.50081674454808',
  },
  {
    name: 'HST',
    noradId: '20580',
    tle1: '1 20580U 90037B   24166.24364096  .00000893  00000+0  49760-4 0  9992',
    tle2: '2 20580  28.4691 265.3066 0002880  75.3670 284.7520 15.09174900501617',
  },
  {
    name: 'NOAA 19',
    noradId: '33591',
    tle1: '1 33591U 09005A   24165.91305118  .00000077  00000+0  74366-4 0  9999',
    tle2: '2 33591  99.1959 190.1204 0014568 146.5824 213.6309 14.12414542806414',
  },
  {
    name: 'STARLINK-1007',
    noradId: '44713',
    tle1: '1 44713U 19074A   24166.43885003  .00000753  00000+0  66601-4 0  9998',
    tle2: '2 44713  53.0539 204.7439 0001268  79.1881 280.9261 15.06389412255228',
  },
  {
    name: 'GPS BIIR-2  (PRN 13)',
    noradId: '24876',
    tle1: '1 24876U 97035A   24165.83285865 -.00000063  00000+0  00000+0 0  9994',
    tle2: '2 24876  55.8837  16.4553 0140806  43.7640 317.4120  2.00568000196973',
  },
  {
    name: 'GALILEO 5 (IOV FM1)',
    noradId: '37846',
    tle1: '1 37846U 11060A   24166.16446154 -.00000053  00000+0  00000+0 0  9990',
    tle2: '2 37846  57.1096  95.7238 0001365  88.7519 271.3483  1.70474801 78621',
  },
  {
    name: 'GOES 16',
    noradId: '41866',
    tle1: '1 41866U 16071A   24165.81501157  .00000029  00000+0  00000+0 0  9997',
    tle2: '2 41866   0.0180 109.4475 0000926 100.0852 266.2692  1.00271976 27433',
  },
  {
    name: 'SES-14',
    noradId: '43013',
    tle1: '1 43013U 17073A   24166.21625816 -.00000294  00000+0  00000+0 0  9998',
    tle2: '2 43013   0.0189 117.0872 0002392 111.3341 261.4667  1.00271309 23534',
  },
];

function parseTLEs(text: string): Satellite[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const results: Satellite[] = [];
  let i = 0;

  while (i < lines.length - 1 && results.length < MAX_TLES) {
    const line0 = lines[i];
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];

    // 3-line TLE block: NAME / L1 / L2
    if (line1?.startsWith('1 ') && line2?.startsWith('2 ')) {
      const tle1 = line1;
      const tle2 = line2;
      const noradId = tle2.substring(2, 7).trim();
      const name = line0.replace(/^0\s+/, '').replace(/^\d+\s*/, '').trim() || `SAT-${noradId}`;

      results.push({ name, tle1, tle2, noradId });
      i += 3;
      continue;
    }

    // 2-line TLE block: L1 / L2 (no explicit name line)
    if (line0.startsWith('1 ') && line1.startsWith('2 ')) {
      const tle1 = line0;
      const tle2 = line1;
      const noradId = tle2.substring(2, 7).trim();
      const name = `SAT-${noradId}`;

      results.push({ name, tle1, tle2, noradId });
      i += 2;
      continue;
    }

    // Fallback: advance by one line and try again
    i += 1;
  }

  return results;
}

function parseSatnogsJson(text: string): Satellite[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }

  const items = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { results?: unknown[] }).results)
      ? (parsed as { results: unknown[] }).results
      : [];

  const satellites: Satellite[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const tle1 = typeof record.tle1 === 'string' ? record.tle1.trim() : '';
    const tle2 = typeof record.tle2 === 'string' ? record.tle2.trim() : '';
    if (!tle1.startsWith('1 ') || !tle2.startsWith('2 ')) continue;

    const noradRaw =
      typeof record.norad_cat_id === 'number'
        ? String(record.norad_cat_id)
        : typeof record.norad_cat_id === 'string'
          ? record.norad_cat_id
          : tle2.substring(2, 7).trim();

    const tle0 = typeof record.tle0 === 'string' ? record.tle0 : '';
    const name =
      tle0.replace(/^0\s+/, '').trim() ||
      `SAT-${noradRaw}`;

    satellites.push({
      name,
      noradId: noradRaw,
      tle1,
      tle2,
    });

    if (satellites.length >= MAX_TLES) break;
  }

  return satellites;
}

function uniqueByNorad(items: Satellite[]): Satellite[] {
  return Array.from(new Map(items.map((item) => [item.noradId, item])).values());
}

function fallbackSatellites(): Satellite[] {
  return uniqueByNorad(FALLBACK_TLES).slice(0, MAX_TLES);
}

async function fetchFromUpstreams(): Promise<Satellite[]> {
  for (const url of SATELLITE_FEED_URLS) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'SIGINT/0.1 (educational/research use)' },
      });

      if (!res.ok) {
        throw new Error(`${url} returned ${res.status}`);
      }

      const text = await res.text();
      const looksLikeJson = text.trim().startsWith('[') || text.trim().startsWith('{');
      const parsed = looksLikeJson ? parseSatnogsJson(text) : parseTLEs(text);
      if (parsed.length > 0) {
        return uniqueByNorad(parsed).slice(0, MAX_TLES);
      }
    } catch (err) {
      console.warn('[api/satellites] upstream failed:', err);
    }
  }

  return [];
}

async function handler() {
  const now = Date.now();
  if (cache && cache.expires > now) {
    return NextResponse.json(cache.data, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  }

  try {
    const upstream = await fetchFromUpstreams();
    const data = upstream.length ? upstream : fallbackSatellites();

    cache = { data, expires: now + TTL_MS };
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch (err) {
    console.error('[api/satellites] fetch error:', err);
    if (cache) {
      return NextResponse.json(cache.data);
    }
    const data = fallbackSatellites();
    cache = { data, expires: now + TTL_MS };
    return NextResponse.json(data, { status: 200 });
  }
}

export const GET = withRateLimit(STANDARD_LIMITER, handler);
