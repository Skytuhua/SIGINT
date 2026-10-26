import { NextResponse } from "next/server";
import { discoverYouTubeLiveWebcams } from "../../../../lib/server/cctv/youtubeLiveDiscover";
import { STANDARD_LIMITER } from "../../../../lib/server/rateLimitPresets";
import { withRateLimit } from "../../../../lib/server/withRateLimit";

async function handler() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "YOUTUBE_API_KEY not configured" },
      { status: 503 }
    );
  }

  try {
    const result = await discoverYouTubeLiveWebcams(apiKey);
    return NextResponse.json(result.data.items, {
      headers: { "Cache-Control": "public, max-age=120" },
    });
  } catch (err) {
    console.error("[api/cctv/youtube] discovery failed:", err);
    return NextResponse.json([], { status: 502 });
  }
}

export const GET = withRateLimit(STANDARD_LIMITER, handler);
