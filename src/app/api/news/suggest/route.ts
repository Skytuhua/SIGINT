import { NextResponse } from "next/server";
import { buildSuggestions } from "../../../../lib/server/news/search";
import { MODERATE_LIMITER } from "../../../../lib/server/rateLimitPresets";
import { withRateLimit } from "../../../../lib/server/withRateLimit";

async function handler(request: Request) {
  const { searchParams } = new URL(request.url);
  const suggestions = await buildSuggestions(searchParams);
  return NextResponse.json(
    { suggestions },
    { headers: { "Cache-Control": "public, max-age=30" } }
  );
}

export const GET = withRateLimit(MODERATE_LIMITER, handler);
