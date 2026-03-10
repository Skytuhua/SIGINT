import { NextResponse } from "next/server";
import { getMovers } from "../../../../lib/server/news/providers/yahooFinance";

export async function GET() {
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
