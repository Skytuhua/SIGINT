import { NextResponse } from "next/server";
import { geocodeNominatim } from "../../../../lib/server/news/providers/nominatim";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const result = await geocodeNominatim(q);

  return NextResponse.json(
    {
      result: result.data,
      source: "nominatim",
      degraded: result.degraded,
      latencyMs: Math.round(result.latencyMs),
      cacheHit: result.cacheHit,
      error: result.error,
    },
    { headers: { "Cache-Control": "public, max-age=604800" } }
  );
}

