import { NextResponse } from "next/server";
import { scrapeInsecamCameras } from "../../../../lib/server/cctv/insecam/scraper";
import type { CctvCamera } from "../../../../lib/providers/types";

const TTL_MS = 10 * 60 * 1000; // 10 minutes
let cache: { data: CctvCamera[]; expires: number } | null = null;

export async function GET() {
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
