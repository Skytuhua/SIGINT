import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/utils/rateLimit";

let cache: { data: string; expires: number } | null = null;

const fallbackTle = `ISS (ZARYA)\n1 25544U 98067A   25067.53784722  .00011473  00000+0  20882-3 0  9995\n2 25544  51.6412  17.9031 0005597 106.3872 280.3717 15.50697825440146\nNOAA 19\n1 33591U 09005A   25067.48713739  .00000063  00000+0  62343-4 0  9994\n2 33591  99.1936 120.4512 0013959 118.4079 241.8538 14.12415267827359\n`;

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "anon";
  if (!checkRateLimit(`tle:${ip}`)) return NextResponse.json({ error: "rate limited" }, { status: 429 });
  if (cache && cache.expires > Date.now()) return NextResponse.json({ tle: cache.data }, { headers: { "Cache-Control": "public, max-age=120" } });

  try {
    const res = await fetch("https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle", { next: { revalidate: 120 } });
    if (!res.ok) throw new Error(`CelesTrak ${res.status}`);
    const tle = await res.text();
    cache = { data: tle, expires: Date.now() + 120_000 };
    return NextResponse.json({ tle }, { headers: { "Cache-Control": "public, max-age=120" } });
  } catch {
    return NextResponse.json({ tle: fallbackTle }, { headers: { "Cache-Control": "public, max-age=120", "x-worldview-fallback": "satellites" } });
  }
}
