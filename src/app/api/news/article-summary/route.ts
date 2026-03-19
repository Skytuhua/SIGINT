import { NextResponse } from "next/server";
import { getArticleSummary } from "../../../../lib/server/news/providers/articleSummary";
import { createRateLimiter, getClientIp, rateLimitGuard } from "../../../../lib/server/rateLimit";

const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 20 });

export async function GET(request: Request) {
  const blocked = rateLimitGuard(limiter(getClientIp(request)));
  if (blocked) return blocked;

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

