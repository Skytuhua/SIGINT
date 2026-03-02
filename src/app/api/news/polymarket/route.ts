import { NextResponse } from "next/server";
import { getPolymarketEvents, searchPolymarketByCountry } from "../../../../lib/server/news/providers/polymarket";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country");
  const limit = Math.min(30, Math.max(1, Number(searchParams.get("limit") ?? "10") || 10));
  const tag = searchParams.get("tag") ?? undefined;

  if (country) {
    const result = await searchPolymarketByCountry(country, limit);
    return NextResponse.json(
      { markets: result.data, degraded: result.degraded, latencyMs: result.latencyMs },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  const result = await getPolymarketEvents(limit, tag);
  return NextResponse.json(
    { markets: result.data, degraded: result.degraded, latencyMs: result.latencyMs },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
