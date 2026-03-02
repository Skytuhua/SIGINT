import { NextResponse } from "next/server";
import { NEWS_VIDEO_CHANNELS } from "../../../../config/newsConfig";
import type { CctvCamera, CctvRegion } from "../../../../lib/providers/types";
import { discoverYouTubeLiveStreams } from "../../../../lib/server/news/providers/youtube";

const CHANNEL_LOCATION_OVERRIDES: Record<
  string,
  { city: string; state?: string; lat: number; lon: number; region: CctvRegion }
> = {
  // Business / finance hubs
  UCVTomc35agH1SM6kCKzwW_g: {
    // Bloomberg TV
    city: "New York",
    state: "NY",
    lat: 40.7128,
    lon: -74.006,
    region: "americas",
  },
  "UCtn-u5YH-y5R2Cob8vvpKLg": {
    // Reuters
    city: "London",
    state: "UK",
    lat: 51.5074,
    lon: -0.1278,
    region: "europe",
  },
  UCvJJ_dzjViJCoLf5uKUTwoA: {
    // CNBC TV18
    city: "Mumbai",
    state: "IN",
    lat: 19.076,
    lon: 72.8777,
    region: "asia",
  },
  // General news
  UCIALMKvObZNtJ6AmdCLP7Lg: {
    // AP News
    city: "New York",
    state: "NY",
    lat: 40.7128,
    lon: -74.006,
    region: "americas",
  },
  UCBi2mrWuNuyYy4gbM6fU18Q: {
    // ABC News
    city: "Washington DC",
    state: "DC",
    lat: 38.9072,
    lon: -77.0369,
    region: "americas",
  },
  UCeY0bbntWzzVIaj2z3QigXg: {
    // NBC News
    city: "New York",
    state: "NY",
    lat: 40.7128,
    lon: -74.006,
    region: "americas",
  },
  "UCupvZG-5ko_eiXAupbDfxWw": {
    // CNN
    city: "Atlanta",
    state: "GA",
    lat: 33.749,
    lon: -84.388,
    region: "americas",
  },
  "UC16niRr50-MSBwiO3YDb3RA": {
    // Sky News
    city: "London",
    state: "UK",
    lat: 51.5074,
    lon: -0.1278,
    region: "europe",
  },
  "UCNye-wNBqNL5ZzHSJj3l8Bg": {
    // DW News
    city: "Berlin",
    state: "DE",
    lat: 52.52,
    lon: 13.405,
    region: "europe",
  },
  UCHKkHPkL0IePiQMNcFwIpzQ: {
    // France 24 EN
    city: "Paris",
    state: "FR",
    lat: 48.8566,
    lon: 2.3522,
    region: "europe",
  },
  UCWX3yGbODI3HLiRPFcYIBGg: {
    // Al Jazeera EN
    city: "Doha",
    state: "QA",
    lat: 25.2854,
    lon: 51.531,
    region: "mideast",
  },
  UCaXkIU1QidjPwiAYu6GcHjg: {
    // WION
    city: "New Delhi",
    state: "IN",
    lat: 28.6139,
    lon: 77.209,
    region: "asia",
  },
};

function mapRegionToLocation(region: string | undefined): {
  city: string;
  lat: number;
  lon: number;
  region: CctvRegion;
} {
  if (!region) {
    return { city: "Global", lat: 0, lon: 0, region: "americas" };
  }
  const lower = region.toLowerCase();
  if (lower === "us" || lower === "na" || lower === "latam" || lower === "global") {
    return { city: "New York", lat: 40.7128, lon: -74.006, region: "americas" };
  }
  if (lower === "uk" || lower === "eu" || lower === "europe") {
    return { city: "London", lat: 51.5074, lon: -0.1278, region: "europe" };
  }
  if (lower === "asia" || lower === "apac") {
    return { city: "Singapore", lat: 1.3521, lon: 103.8198, region: "asia" };
  }
  if (lower === "mena" || lower === "middle_east") {
    return { city: "Dubai", lat: 25.2048, lon: 55.2708, region: "mideast" };
  }
  return { city: "Global", lat: 0, lon: 0, region: "americas" };
}

function inferChannelLocation(channelId: string, fallbackCity: string): {
  city: string;
  state?: string;
  lat: number;
  lon: number;
  region: CctvRegion;
} {
  const override = CHANNEL_LOCATION_OVERRIDES[channelId];
  if (override) return override;

  const config = NEWS_VIDEO_CHANNELS.find((ch) => ch.channelId === channelId);
  const base = mapRegionToLocation(config?.region);
  return { ...base, city: fallbackCity || base.city };
}

export async function GET() {
  // #region agent log
  fetch("http://127.0.0.1:7928/ingest/3da76906-48e1-4cba-af71-0b7fc1ab7982", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "5d3f37",
    },
    body: JSON.stringify({
      sessionId: "5d3f37",
      runId: "post-fix-build",
      hypothesisId: "H-syntax",
      location: "src/app/api/cctv/youtube/route.ts:GET",
      message: "GET route invoked after syntax fix",
      data: {},
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  const apiKey = process.env.YOUTUBE_API_KEY;
  const result = await discoverYouTubeLiveStreams(apiKey);

  const liveItems = result.data.items.filter((item) => item.status === "live");
  const sourceItems = liveItems.length ? liveItems : result.data.items.slice(0, 16);

  const cameras: CctvCamera[] = sourceItems.map((item) => {
    const loc = inferChannelLocation(item.channelId, item.channelName);
    const snapshotUrl =
      item.thumbnailUrl || `https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg`;

    return {
      id: `yt_live_${item.videoId}`,
      city: loc.city,
      name: item.title || `${item.channelName} Live`,
      lat: loc.lat,
      lon: loc.lon,
      snapshotUrl,
      refreshSeconds: 60,
      streamUrl: item.sourceUrl,
      streamFormat: "YOUTUBE",
      state: loc.state,
      region: loc.region,
    };
  });

  return NextResponse.json(cameras, {
    headers: {
      "Cache-Control": "public, max-age=120",
    },
  });
}

