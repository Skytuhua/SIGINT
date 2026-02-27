import { NextRequest, NextResponse } from "next/server";
import { normalizeOpenSky } from "@/lib/providers/normalizers";
import { checkRateLimit } from "@/lib/utils/rateLimit";

let cache: { data: unknown[]; expires: number } | null = null;

const fallback = [
  { icao24: "mock01", callsign: "WV100", lat: 35.68, lon: 139.76, altitudeM: 10200, velocityMS: 230, headingDeg: 88, onGround: false },
  { icao24: "mock02", callsign: "WV210", lat: 34.05, lon: -118.24, altitudeM: 9400, velocityMS: 210, headingDeg: 42, onGround: false },
];

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "anon";
  if (!checkRateLimit(`opensky:${ip}`)) return NextResponse.json({ error: "rate limited" }, { status: 429 });
  if (cache && cache.expires > Date.now()) return NextResponse.json(cache.data, { headers: { "Cache-Control": "public, max-age=10" } });

  try {
    const user = process.env.OPENSKY_USERNAME;
    const pass = process.env.OPENSKY_PASSWORD;
    const headers = user && pass ? { Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` } : undefined;
    const res = await fetch("https://opensky-network.org/api/states/all", { headers, next: { revalidate: 10 } });
    if (!res.ok) throw new Error(`OpenSky ${res.status}`);
    const json = await res.json();
    const data = normalizeOpenSky(json);
    cache = { data, expires: Date.now() + 10_000 };
    return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=10" } });
  } catch {
    return NextResponse.json(fallback, { headers: { "Cache-Control": "public, max-age=10", "x-worldview-fallback": "opensky" } });
  }
}
