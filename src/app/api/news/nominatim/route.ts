import { NextResponse } from "next/server";
import { geocodeNominatim, reverseGeocodeNominatim } from "../../../../lib/server/news/providers/nominatim";
import { MODERATE_LIMITER } from "../../../../lib/server/rateLimitPresets";
import { withRateLimit } from "../../../../lib/server/withRateLimit";

async function handler(request: Request) {
  const { searchParams } = new URL(request.url);
  const latRaw = searchParams.get("lat");
  const lonRaw = searchParams.get("lon");
  const lat = latRaw == null ? Number.NaN : Number(latRaw);
  const lon = lonRaw == null ? Number.NaN : Number(lonRaw);

  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    const result = await reverseGeocodeNominatim(lat, lon);
    return NextResponse.json(
      {
        mode: "reverse",
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

  const q = searchParams.get("q") ?? "";
  if (!q.trim()) {
    return NextResponse.json(
      {
        mode: "search",
        result: null,
        source: "nominatim",
        degraded: false,
        latencyMs: 0,
        cacheHit: "miss",
        error: "Provide q or lat/lon query params",
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  const result = await geocodeNominatim(q);

  return NextResponse.json(
    {
      mode: "search",
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

export const GET = withRateLimit(MODERATE_LIMITER, handler);
