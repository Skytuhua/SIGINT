import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const FETCH_TIMEOUT = 10_000;

type TrackPoint = [number, number, number]; // [lon, lat, altM]

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// 閳光偓閳光偓閳光偓 ADSBx-style trace (airplanes.live / adsb.lol) 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓
// trace[i] = [timestamp, lat, lon, alt_baro_ft_or_"ground", baro_rate_fpm, gs_kts, track_deg, ...]

function normalizeAdsbTrace(data: { trace?: unknown[] }): TrackPoint[] {
  if (!Array.isArray(data.trace)) return [];
  return data.trace
    .filter((p): p is unknown[] => Array.isArray(p) && p.length >= 4)
    .map((p): TrackPoint => {
      const lat = Number(p[1]);
      const lon = Number(p[2]);
      const altRaw = p[3];
      const altM = typeof altRaw === 'number' && isFinite(altRaw) ? altRaw * 0.3048 : 0;
      return [lon, lat, altM];
    })
    .filter(([lon, lat]) => isFinite(lon) && isFinite(lat));
}

async function fetchAdsbTrace(base: string, icao: string): Promise<TrackPoint[]> {
  const res = await fetchWithTimeout(`${base}/trace/${icao}`, {
    headers: { 'User-Agent': 'WorldView/0.1 (educational/research use)' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`ADSB trace ${base} returned ${res.status}`);
  return normalizeAdsbTrace(await res.json() as { trace?: unknown[] });
}

// 閳光偓閳光偓閳光偓 OpenSky track 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓
// waypoints[i] = [time, lat, lon, baro_altitude_m, true_track_deg, on_ground]

async function fetchOpenSkyTrack(icao: string): Promise<TrackPoint[]> {
  const username = process.env.OPENSKY_USERNAME;
  const password = process.env.OPENSKY_PASSWORD;
  const headers: Record<string, string> = {
    'User-Agent': 'WorldView/0.1 (educational/research use)',
  };
  if (username && password) {
    headers['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }

  const res = await fetchWithTimeout(
    `https://opensky-network.org/api/tracks/all?icao24=${icao}&time=0`,
    { headers, cache: 'no-store' }
  );
  if (!res.ok) throw new Error(`OpenSky track returned ${res.status}`);

  const data = await res.json() as { waypoints?: unknown[] };
  if (!Array.isArray(data.waypoints) || data.waypoints.length === 0) return [];

  return data.waypoints
    .filter((w): w is unknown[] => Array.isArray(w) && w.length >= 4)
    .map((w): TrackPoint => {
      const lat = Number(w[1]);
      const lon = Number(w[2]);
      // OpenSky altitude is already in metres
      const altM = typeof w[3] === 'number' && isFinite(w[3]) ? w[3] : 0;
      return [lon, lat, altM];
    })
    .filter(([lon, lat]) => isFinite(lon) && isFinite(lat));
}

// 閳光偓閳光偓閳光偓 Route handler 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const icao = searchParams.get('icao')?.toLowerCase().trim();

  if (!icao || !/^[0-9a-f]{6}$/i.test(icao)) {
    return NextResponse.json({ error: 'Valid 6-hex ICAO required' }, { status: 400 });
  }

  const sources: Array<() => Promise<TrackPoint[]>> = [
    () => fetchAdsbTrace('https://api.airplanes.live/v2', icao),
    () => fetchAdsbTrace('https://api.adsb.lol/v2', icao),
    () => fetchOpenSkyTrack(icao),
  ];

  for (const source of sources) {
    try {
      const track = await source();
      if (track.length >= 2) {
        console.log(`[api/track] ${icao} 閳?${track.length} points`);
        return NextResponse.json(track, { headers: { 'Cache-Control': 'no-store' } });
      }
    } catch (err) {
      console.warn('[api/track]', err instanceof Error ? err.message : err);
    }
  }

  // No historical data available 閳?return empty so the caller can still show live path
  return NextResponse.json([], { headers: { 'Cache-Control': 'no-store' } });
}
