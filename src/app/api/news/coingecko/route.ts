import { NextResponse } from "next/server";
import { getCoinGeckoMarkets, getCoinGeckoTrending } from "../../../../lib/server/news/providers/coingecko";
import { STANDARD_LIMITER } from "../../../../lib/server/rateLimitPresets";
import { withRateLimit } from "../../../../lib/server/withRateLimit";

async function handler(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") ?? "markets";

  if (mode === "trending") {
    const result = await getCoinGeckoTrending();
    return NextResponse.json(
      { trending: result.data, degraded: result.degraded, latencyMs: result.latencyMs },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? "20") || 20));
  const result = await getCoinGeckoMarkets(limit);
  return NextResponse.json(
    { markets: result.data, degraded: result.degraded, latencyMs: result.latencyMs },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export const GET = withRateLimit(STANDARD_LIMITER, handler);
