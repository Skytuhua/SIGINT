import { NextResponse } from "next/server";
import { getGdeltGeo } from "../../../../lib/server/news/providers/gdelt";
import { STANDARD_LIMITER } from "../../../../lib/server/rateLimitPresets";
import { withRateLimit } from "../../../../lib/server/withRateLimit";

async function handler(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = (searchParams.get("mode") ?? "pointdata") as "pointdata" | "country" | "adm1";
  const result = await getGdeltGeo({
    q: searchParams.get("q") ?? "",
    timespan: searchParams.get("timespan") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    mode,
    maxrecords: Number(searchParams.get("maxrecords") ?? "100"),
  });

  return NextResponse.json(
    {
      mode,
      points: result.data.points,
      aggregates: result.data.aggregates,
      total: mode === "pointdata" ? result.data.points.length : result.data.aggregates.length,
      source: "gdelt-geo",
      degraded: result.degraded,
      latencyMs: Math.round(result.latencyMs),
      cacheHit: result.cacheHit,
      error: result.error,
    },
    { headers: { "Cache-Control": "public, max-age=240" } }
  );
}

export const GET = withRateLimit(STANDARD_LIMITER, handler);

