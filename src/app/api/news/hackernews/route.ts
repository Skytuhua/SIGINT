import { NextResponse } from "next/server";
import { getHackerNewsTop } from "../../../../lib/server/news/providers/hackernews";
import { STANDARD_LIMITER } from "../../../../lib/server/rateLimitPresets";
import { withRateLimit } from "../../../../lib/server/withRateLimit";

async function handler(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? "30") || 30));

  const result = await getHackerNewsTop(limit);
  return NextResponse.json(
    { items: result.data, degraded: result.degraded, latencyMs: result.latencyMs },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export const GET = withRateLimit(STANDARD_LIMITER, handler);
