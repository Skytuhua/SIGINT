import { NextResponse } from "next/server";
import { getArticleSummary } from "../../../../lib/server/news/providers/articleSummary";
import { STRICT_LIMITER } from "../../../../lib/server/rateLimitPresets";
import { withRateLimit } from "../../../../lib/server/withRateLimit";

async function handler(request: Request) {
  const cacheHeaders = {
    "Cache-Control": "private, max-age=45, stale-while-revalidate=120",
  };
  const { searchParams } = new URL(request.url);
  const url = (searchParams.get("url") ?? "").trim();
  const headline = (searchParams.get("headline") ?? "").trim();
  const source = (searchParams.get("source") ?? "").trim();
  const backend = (searchParams.get("backend") ?? "").trim();

  if (!url) {
    return NextResponse.json(
      {
        summary: null,
        engine: "none",
        degraded: false,
        cacheHit: "miss",
        latencyMs: 0,
        sourceUrl: "",
        unavailableReason: "invalid_url",
        error: "Missing required query param: url",
      },
      { headers: cacheHeaders }
    );
  }

  const result = await getArticleSummary({
    url,
    headline: headline || undefined,
    source: source || undefined,
    backend: backend || undefined,
  });

  return NextResponse.json(
    result,
    { headers: cacheHeaders }
  );
}

export const GET = withRateLimit(STRICT_LIMITER, handler);

