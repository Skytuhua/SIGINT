import { NextResponse } from 'next/server';
import type { Earthquake } from '../../../lib/providers/types';

const USGS_URL =
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';
const TTL_MS = 30_000; // 30 seconds — refresh from USGS more often for consistent updates

let cache: { data: Earthquake[]; expires: number } | null = null;

interface UsgsFeature {
  id: string;
  geometry: { coordinates: [number, number, number] };
  properties: {
    mag: number;
    place: string;
    time: number;
    type: string;
    url: string;
  };
}

function normalizeUSGS(raw: { features?: UsgsFeature[] }): Earthquake[] {
  return (raw?.features ?? []).map((f) => ({
    id: f.id,
    mag: f.properties.mag ?? 0,
    place: f.properties.place ?? '',
    time: f.properties.time,
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    depthKm: f.geometry.coordinates[2],
    type: f.properties.type,
    url: f.properties.url,
  }));
}

export async function GET() {
  const now = Date.now();
  if (cache && cache.expires > now) {
    return NextResponse.json(cache.data, {
      headers: { 'Cache-Control': 'private, max-age=0, must-revalidate' },
    });
  }

  try {
    const res = await fetch(USGS_URL, {
      headers: { 'User-Agent': 'WorldView/0.1 (educational/research use)' },
    });
    if (!res.ok) throw new Error(`USGS returned ${res.status}`);

    const raw = await res.json();
    const data = normalizeUSGS(raw);

    cache = { data, expires: now + TTL_MS };
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, max-age=0, must-revalidate' },
    });
  } catch (err) {
    console.error('[api/earthquakes] fetch error:', err);
    if (cache) return NextResponse.json(cache.data);
    return NextResponse.json([], { status: 200 });
  }
}
