import { NextResponse } from "next/server";
import { getEarningsCalendar } from "../../../../lib/server/news/providers/yahooFinance";
import { STANDARD_LIMITER } from "../../../../lib/server/rateLimitPresets";
import { withRateLimit } from "../../../../lib/server/withRateLimit";

async function handler() {
  const result = await getEarningsCalendar();
  return NextResponse.json(
    {
      upcoming: result.data.upcoming,
      recent: result.data.recent,
      degraded: result.degraded,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export const GET = withRateLimit(STANDARD_LIMITER, handler);
