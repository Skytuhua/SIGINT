export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { searchInsecamByCity } from "../../../../../lib/server/cctv/insecam/scraper";
import { MODERATE_LIMITER } from "../../../../../lib/server/rateLimitPresets";
import { withRateLimit } from "../../../../../lib/server/withRateLimit";

async function handler(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json([], { status: 200 });
  }

  try {
    const cameras = await searchInsecamByCity(q);
    return NextResponse.json(cameras, {
      headers: { "Cache-Control": "public, max-age=30" },
    });
  } catch (err) {
    console.error("[insecam/search] failed:", err);
    return NextResponse.json([], { status: 502 });
  }
}

export const GET = withRateLimit(MODERATE_LIMITER, handler);
