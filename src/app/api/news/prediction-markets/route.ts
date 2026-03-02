import { NextResponse } from "next/server";
import { getPolymarketEvents } from "../../../../lib/server/news/providers/polymarket";

export async function GET(request: Request) {
  const cacheHeaders = {
    "Cache-Control": "public, max-age=30, stale-while-revalidate=120",
  };
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  const limit = Math.min(50, Math.max(1, Number(limitParam ?? "20") || 20));

  const result = await getPolymarketEvents(limit);

  return NextResponse.json(
    {
      data: result.data,
      degraded: result.degraded,
      latencyMs: result.latencyMs,
      cacheHit: result.cacheHit,
    },
    { headers: cacheHeaders },
  );
}
