import { NextResponse } from "next/server";
import { discoverYouTubeLiveStreams } from "../../../../lib/server/news/providers/youtube";
import { STANDARD_LIMITER } from "../../../../lib/server/rateLimitPresets";
import { withRateLimit } from "../../../../lib/server/withRateLimit";

async function handler() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const result = await discoverYouTubeLiveStreams(apiKey);
  const backendDegraded = [
    ...(result.degraded ? ["youtube"] : []),
    ...(result.data.degraded ?? []),
  ];
  const totalItems = result.data.items.length;
  const upstreamError = Boolean(result.error);
  const zeroResults = !upstreamError && totalItems === 0;

  const message = result.data.keyMissing
    ? "YOUTUBE_API_KEY missing. Showing recent uploads from YouTube RSS fallback."
    : result.data.fallbackActive
      ? "YouTube Data API unavailable; showing recent uploads from RSS."
      : upstreamError
        ? "YouTube API request failed. Check quota and API key."
        : zeroResults
          ? "YouTube returned no live or recent videos for configured channels."
          : undefined;

  return NextResponse.json(
    {
      items: result.data.items,
      keyMissing: result.data.keyMissing,
      discoverySource: result.data.discoverySource,
      fallbackActive: result.data.fallbackActive,
      total: totalItems,
      source: "youtube-live",
      degraded: backendDegraded,
      channelsChecked: result.data.channelsChecked,
      liveCount: result.data.liveCount,
      latencyMs: Math.round(result.latencyMs),
      cacheHit: result.cacheHit,
      error: result.error,
      zeroResults,
      upstreamError,
      message,
    },
    { headers: { "Cache-Control": "public, max-age=600" } }
  );
}

export const GET = withRateLimit(STANDARD_LIMITER, handler);
