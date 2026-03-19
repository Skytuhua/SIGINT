import { NextRequest, NextResponse } from 'next/server';
import type { RoadSegment } from '../../../lib/providers/types';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const TTL_MS = 5 * 60_000; // 5 minutes
const FETCH_TIMEOUT_MS = 25_000;

// Default: NYC bounding box (south, west, north, east)
const DEFAULT_SOUTH = 40.5;
const DEFAULT_WEST = -74.3;
const DEFAULT_NORTH = 40.9;
const DEFAULT_EAST = -73.7;

function buildQuery(south: number, west: number, north: number, east: number): string {
  return `[out:json][timeout:25];
(
  way["highway"~"motorway|trunk|primary|secondary"](${south},${west},${north},${east});
);
out geom;`;
}

function clampCoord(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

let cache: { data: RoadSegment[]; expires: number; key: string } | null = null;

interface OverpassElement {
  type: string;
  id: number;
  tags?: { highway?: string };
  geometry?: { lat: number; lon: number }[];
}

function normalizeOverpass(raw: { elements?: OverpassElement[] }): RoadSegment[] {
  return (raw?.elements ?? [])
    .filter((el) => el.type === 'way' && el.geometry && el.geometry.length >= 2)
    .map((el) => ({
      id: String(el.id),
      type: el.tags?.highway ?? 'road',
      coords: (el.geometry ?? []).map((pt) => [pt.lon, pt.lat] as [number, number]),
    }));
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const south = clampCoord(Number(params.get('south')) || DEFAULT_SOUTH, -90, 90);
  const west = clampCoord(Number(params.get('west')) || DEFAULT_WEST, -180, 180);
  const north = clampCoord(Number(params.get('north')) || DEFAULT_NORTH, -90, 90);
  const east = clampCoord(Number(params.get('east')) || DEFAULT_EAST, -180, 180);

  const cacheKey = `${south},${west},${north},${east}`;
  const now = Date.now();

  if (cache && cache.key === cacheKey && cache.expires > now) {
    return NextResponse.json(cache.data, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  }

  try {
    const query = buildQuery(south, west, north, east);
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'SIGINT/0.1 (educational/research use)',
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) throw new Error(`Overpass returned ${res.status}`);

    const raw = await res.json();
    const data = normalizeOverpass(raw);

    cache = { data, expires: now + TTL_MS, key: cacheKey };
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch (err) {
    console.error('[api/overpass] fetch error:', err);
    if (cache && cache.key === cacheKey) return NextResponse.json(cache.data);
    return NextResponse.json([], { status: 200 });
  }
}
