import { NextResponse } from "next/server";
import { getQuotes } from "../../../../lib/server/news/providers/yahooFinance";
import { STANDARD_LIMITER } from "../../../../lib/server/rateLimitPresets";
import { withRateLimit } from "../../../../lib/server/withRateLimit";

export const dynamic = "force-dynamic";

async function handler(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("symbols") ?? "";
  const symbols = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (symbols.length === 0) {
    return NextResponse.json(
      { error: "Missing 'symbols' parameter" },
      { status: 400 },
    );
  }

  const result = await getQuotes(symbols);
  return NextResponse.json(
    {
      quotes: result.data,
      degraded: result.degraded,
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export const GET = withRateLimit(STANDARD_LIMITER, handler);
