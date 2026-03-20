import { NextResponse } from "next/server";
import { executeNewsSearch } from "../../../../lib/server/news/search";
import { MODERATE_LIMITER } from "../../../../lib/server/rateLimitPresets";
import { withRateLimit } from "../../../../lib/server/withRateLimit";

async function handler(request: Request) {
  const { searchParams } = new URL(request.url);
  const result = await executeNewsSearch(searchParams);

  const cacheControl = "public, max-age=5, s-maxage=15, stale-while-revalidate=30";
  const serverTiming = Object.entries(result.backendLatency ?? {})
    .filter(([, dur]) => typeof dur === "number" && Number.isFinite(dur) && dur >= 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 12)
    .map(([name, dur]) => `${name};dur=${Math.round(dur)}`);

  const headers: Record<string, string> = {
    "Cache-Control": cacheControl,
  };
  if (serverTiming.length) {
    headers["Server-Timing"] = serverTiming.join(", ");
    headers["Timing-Allow-Origin"] = "*";
  }

  return NextResponse.json(
    {
      items: result.items,
      markers: result.markers,
      facets: result.facets,
      total: result.total,
      degraded: result.degraded,
      backendLatency: result.backendLatency,
      backendHealth: result.backendHealth,
      sourceHealth: result.sourceHealth,
      emptyReason: result.emptyReason,
      fallbackApplied: result.fallbackApplied,
      activeConstraints: result.activeConstraints,
      queryEcho: result.queryEcho,
      timeline: result.timeline,
    },
    { headers }
  );
}

export const GET = withRateLimit(MODERATE_LIMITER, handler);
