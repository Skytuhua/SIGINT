import { NextResponse } from "next/server";
import { STRICT_LIMITER } from "../../../../lib/server/rateLimitPresets";
import { withRateLimit } from "../../../../lib/server/withRateLimit";
import { getGdeltContext } from "../../../../lib/server/news/providers/gdelt";

async function handler(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (!q) {
    return NextResponse.json({ articles: [], total: 0, source: "gdelt-context" });
  }

  const result = await getGdeltContext(q);
  return NextResponse.json(
    {
      articles: result.data,
      total: result.data.length,
      source: "gdelt-context",
      degraded: result.degraded,
      latencyMs: Math.round(result.latencyMs),
      cacheHit: result.cacheHit,
      error: result.error,
    },
    { headers: { "Cache-Control": "public, max-age=600" } }
  );
}

export const GET = withRateLimit(STRICT_LIMITER, handler);

