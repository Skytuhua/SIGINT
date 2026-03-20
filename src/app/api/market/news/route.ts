import { NextResponse } from "next/server";
import { getMarketNews } from "../../../../lib/server/news/providers/yahooFinance";
import { STANDARD_LIMITER } from "../../../../lib/server/rateLimitPresets";
import { withRateLimit } from "../../../../lib/server/withRateLimit";

async function handler(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    50,
    Math.max(1, Number(searchParams.get("limit") ?? "20") || 20),
  );

  const result = await getMarketNews(limit);
  return NextResponse.json(
    {
      headlines: result.data,
      degraded: result.degraded,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export const GET = withRateLimit(STANDARD_LIMITER, handler);
