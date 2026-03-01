import { NextResponse } from "next/server";
import { discoverYouTubeLiveStreams } from "../../../../lib/server/news/providers/youtube";

export async function GET() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const result = await discoverYouTubeLiveStreams(apiKey);
  const backendDegraded = [
    ...(result.degraded ? ["youtube"] : []),
    ...(result.data.degraded ?? []),
  ];

  return NextResponse.json(
    {
      items: result.data.items,
      keyMissing: result.data.keyMissing,
      total: result.data.items.length,
      source: "youtube-live",
      degraded: backendDegraded,
      channelsChecked: result.data.channelsChecked,
      liveCount: result.data.liveCount,
      latencyMs: Math.round(result.latencyMs),
      cacheHit: result.cacheHit,
      error: result.error,
      message: result.data.keyMissing
        ? "Set YOUTUBE_API_KEY in .env.local to enable automatic live discovery."
        : undefined,
    },
    { headers: { "Cache-Control": "public, max-age=120" } }
  );
}
