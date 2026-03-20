export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { scrapeInsecamCameras } from "../../../../lib/server/cctv/insecam/scraper";
import type { CctvCamera } from "../../../../lib/providers/types";
import { STANDARD_LIMITER } from "../../../../lib/server/rateLimitPresets";
import { withRateLimit } from "../../../../lib/server/withRateLimit";

const TTL_MS = 10 * 60 * 1000; // 10 minutes
let cache: { data: CctvCamera[]; expires: number } | null = null;

async function handler() {
  const now = Date.now();
  if (cache && cache.expires > now) {
    return NextResponse.json(cache.data, {
      headers: { "Cache-Control": "public, max-age=120" },
    });
  }

  try {
    const cameras = await scrapeInsecamCameras();
    cache = { data: cameras, expires: now + TTL_MS };

    return NextResponse.json(cameras, {
      headers: { "Cache-Control": "public, max-age=120" },
    });
  } catch (err) {
    console.error("[insecam] scrape failed:", err);

    // Return stale cache if available
    if (cache) {
      return NextResponse.json(cache.data, {
        headers: { "Cache-Control": "public, max-age=30" },
      });
    }

    return NextResponse.json([], { status: 502 });
  }
}

export const GET = withRateLimit(STANDARD_LIMITER, handler);
