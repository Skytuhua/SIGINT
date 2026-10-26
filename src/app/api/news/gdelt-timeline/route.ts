import { NextResponse } from "next/server";
import { getGdeltTimeline } from "../../../../lib/server/news/providers/gdelt";
import { STANDARD_LIMITER } from "../../../../lib/server/rateLimitPresets";
import { withRateLimit } from "../../../../lib/server/withRateLimit";

async function handler(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "news";
  const timespan = searchParams.get("timespan") ?? "7d";
  const result = await getGdeltTimeline(q, timespan);

  return NextResponse.json(
    {
      timeline: result.data,
      points: result.data,
      total: result.data.length,
      source: "gdelt-timeline",
      degraded: result.degraded,
      latencyMs: Math.round(result.latencyMs),
      cacheHit: result.cacheHit,
      error: result.error,
    },
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
}

export const GET = withRateLimit(STANDARD_LIMITER, handler);
