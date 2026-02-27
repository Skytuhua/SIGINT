import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/utils/rateLimit";

const fallback = {
  elements: [
    { id: 1001, geometry: [{ lat: 35.6587, lon: 139.7005 }, { lat: 35.6603, lon: 139.7051 }] },
    { id: 1002, geometry: [{ lat: 35.6578, lon: 139.6972 }, { lat: 35.661, lon: 139.6991 }] },
    { id: 1003, geometry: [{ lat: 35.6561, lon: 139.703 }, { lat: 35.6632, lon: 139.708 }] },
  ],
};

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "anon";
  if (!checkRateLimit(`overpass:${ip}`, 10, 0.2)) return NextResponse.json({ error: "rate limited" }, { status: 429 });

  try {
    const bbox = req.nextUrl.searchParams.get("bbox") ?? "35.64,139.68,35.71,139.78";
    const query = `[out:json][timeout:25];(way["highway"~"motorway|trunk|primary"](${bbox}););out geom;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) throw new Error(`Overpass ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch {
    return NextResponse.json(fallback, { headers: { "Cache-Control": "public, max-age=300", "x-worldview-fallback": "overpass" } });
  }
}
