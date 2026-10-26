import { NextResponse } from "next/server";
import { fetchWikidataEntity } from "../../../../lib/server/news/providers/wikidata";
import { MODERATE_LIMITER } from "../../../../lib/server/rateLimitPresets";
import { withRateLimit } from "../../../../lib/server/withRateLimit";

async function handler(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker") ?? undefined;
  const company = searchParams.get("company") ?? undefined;
  const result = await fetchWikidataEntity({ ticker, company });

  return NextResponse.json(
    {
      entity: result.data,
      source: "wikidata",
      degraded: result.degraded,
      latencyMs: Math.round(result.latencyMs),
      cacheHit: result.cacheHit,
      error: result.error,
    },
    { headers: { "Cache-Control": "public, max-age=86400" } }
  );
}

export const GET = withRateLimit(MODERATE_LIMITER, handler);

