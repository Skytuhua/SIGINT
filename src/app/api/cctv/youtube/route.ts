import { NextResponse } from "next/server";
import { discoverYouTubeLiveWebcams } from "../../../../lib/server/cctv/youtubeLiveDiscover";

export async function GET() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const result = await discoverYouTubeLiveWebcams(apiKey);

  return NextResponse.json(result.data.items, {
    headers: {
      "Cache-Control": "public, max-age=120",
    },
  });
}

