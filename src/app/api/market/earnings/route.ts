import { NextResponse } from "next/server";
import { getEarningsCalendar } from "../../../../lib/server/news/providers/yahooFinance";

export async function GET() {
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
