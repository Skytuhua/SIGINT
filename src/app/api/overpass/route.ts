import { NextResponse } from 'next/server';
import type { RoadSegment } from '../../../lib/providers/types';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const TTL_MS = 5 * 60_000; // 5 minutes

// NYC bounding box: (south, west, north, east)
const OVERPASS_QUERY = `
[out:json][timeout:25];
(
  way["highway"~"motorway|trunk|primary|secondary"](40.5,-74.3,40.9,-73.7);
);
out geom;
`.trim();

let cache: { data: RoadSegment[]; expires: number } | null = null;

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

export async function GET() {
  const now = Date.now();
  if (cache && cache.expires > now) {
    return NextResponse.json(cache.data, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  }

  try {
    // Overpass requires POST with form-encoded body
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'SIGINT/0.1 (educational/research use)',
      },
      body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
    });

    if (!res.ok) throw new Error(`Overpass returned ${res.status}`);

    const raw = await res.json();
    const data = normalizeOverpass(raw);

    cache = { data, expires: now + TTL_MS };
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch (err) {
    console.error('[api/overpass] fetch error:', err);
    if (cache) return NextResponse.json(cache.data);
    return NextResponse.json([], { status: 200 });
  }
}
