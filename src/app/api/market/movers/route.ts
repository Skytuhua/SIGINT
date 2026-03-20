import { NextResponse } from "next/server";
import { getMovers } from "../../../../lib/server/news/providers/yahooFinance";
import { STANDARD_LIMITER } from "../../../../lib/server/rateLimitPresets";
import { withRateLimit } from "../../../../lib/server/withRateLimit";

async function handler() {
  const result = await getMovers();
  return NextResponse.json(
    {
      gainers: result.data.gainers,
      losers: result.data.losers,
      degraded: result.degraded,
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export const GET = withRateLimit(STANDARD_LIMITER, handler);
