import { NextRequest, NextResponse } from "next/server";
import { normalizeUsgs } from "@/lib/providers/normalizers";
import { checkRateLimit } from "@/lib/utils/rateLimit";

let cache: { data: unknown[]; expires: number } | null = null;

const fallback = [
  { id: "mock-eq-01", magnitude: 3.2, time: Date.now(), lat: 35.68, lon: 139.75, depthKm: 14, place: "Tokyo demo" },
  { id: "mock-eq-02", magnitude: 2.6, time: Date.now(), lat: 47.60, lon: -122.33, depthKm: 9, place: "Seattle demo" },
];

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "anon";
  if (!checkRateLimit(`usgs:${ip}`)) return NextResponse.json({ error: "rate limited" }, { status: 429 });
  if (cache && cache.expires > Date.now()) return NextResponse.json(cache.data, { headers: { "Cache-Control": "public, max-age=60" } });

  try {
    const res = await fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson", { next: { revalidate: 60 } });
    if (!res.ok) throw new Error(`USGS ${res.status}`);
    const data = normalizeUsgs(await res.json());
    cache = { data, expires: Date.now() + 60_000 };
    return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch {
    return NextResponse.json(fallback, { headers: { "Cache-Control": "public, max-age=60", "x-worldview-fallback": "earthquakes" } });
  }
}
