import { NextResponse } from "next/server";
import { getGdeltArticles } from "../../../../lib/server/news/providers/gdelt";
import type { NewsCategory } from "../../../../lib/news/types";
import { STANDARD_LIMITER } from "../../../../lib/server/rateLimitPresets";
import { withRateLimit } from "../../../../lib/server/withRateLimit";

async function handler(request: Request) {
  const { searchParams } = new URL(request.url);
  const result = await getGdeltArticles({
    q: searchParams.get("q") ?? "",
    cat: (searchParams.get("cat") ?? undefined) as NewsCategory | undefined,
    country: searchParams.get("country") ?? undefined,
    domain: searchParams.get("domain") ?? undefined,
    timespan: searchParams.get("timespan") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    lang: searchParams.get("lang") ?? undefined,
    maxrecords: Number(searchParams.get("maxrecords") ?? "75"),
  });

  return NextResponse.json(
    {
      articles: result.data,
      total: result.data.length,
      source: "gdelt-doc",
      degraded: result.degraded,
      latencyMs: Math.round(result.latencyMs),
      cacheHit: result.cacheHit,
      error: result.error,
    },
    { headers: { "Cache-Control": "public, max-age=180" } }
  );
}

export const GET = withRateLimit(STANDARD_LIMITER, handler);

