import type { CctvCamera, CctvRegion } from "../../providers/types";
import {
  cachedFetch,
  type CachedFetchResult,
} from "../news/upstream";
import {
  fetchChannelRss,
  enrichWithLiveStatus,
  CCTV_HYBRID_POLICY,
  youtubeThumbnailUrl,
} from "../invidious/client";

/**
 * Curated webcam channel IDs for CCTV discovery.
 * Instead of expensive search.list (100 units each × 4 queries = 400 units),
 * we use RSS feeds from known webcam channels + a single videos.list call
 * for live status enrichment (~2-3 quota units total).
 */
const WEBCAM_CHANNELS = [
  { channelId: "UC3eSRD2gPP4LkUnxLrA0xHg", label: "EarthCam" },
  { channelId: "UCEyX5lg6BL_Hl9rpE6B7Y9w", label: "Skyline Webcams" },
  { channelId: "UC8NnosPOvXnm0O1u5YnLQiw", label: "Explore Birds Bats Bees" },
  { channelId: "UCrtIIVfi-5tMlVXdMDzOMUA", label: "StreamTime LIVE" },
  { channelId: "UCt_tBSfWMBRKk7HEpDrTC3A", label: "I Love You Venice" },
  { channelId: "UCgdHSFcXvkN6O3NXvIF0yTg", label: "PTZtv" },
  { channelId: "UCNcMBKL3YOe0OmBVDMtJMfA", label: "Virtual Railfan" },
  { channelId: "UCXMMK44THkMrk-1xlK0WBSg", label: "Abbey Road Studios" },
];

const CHANNEL_LOCATION_OVERRIDES: Record<
  string,
  { city: string; lat: number; lon: number; region: CctvRegion }
> = {
  UC3eSRD2gPP4LkUnxLrA0xHg: { city: "New York", lat: 40.7128, lon: -74.006, region: "americas" },
  UCEyX5lg6BL_Hl9rpE6B7Y9w: { city: "London", lat: 51.5074, lon: -0.1278, region: "europe" },
  UCt_tBSfWMBRKk7HEpDrTC3A: { city: "Venice", lat: 45.4408, lon: 12.3155, region: "europe" },
  UCXMMK44THkMrk1xlK0WBSg: { city: "London", lat: 51.5320, lon: -0.1779, region: "europe" },
};

const CITY_KEYWORDS: Array<{
  keywords: string[];
  city: string;
  lat: number;
  lon: number;
  region: CctvRegion;
}> = [
  { keywords: ["new york", "times square", "nyc", "manhattan"], city: "New York", lat: 40.7128, lon: -74.006, region: "americas" },
  { keywords: ["london", "uk"], city: "London", lat: 51.5074, lon: -0.1278, region: "europe" },
  { keywords: ["dubai", "marina"], city: "Dubai", lat: 25.0803, lon: 55.1403, region: "mideast" },
  { keywords: ["tokyo", "shibuya"], city: "Tokyo", lat: 35.6595, lon: 139.7005, region: "asia" },
  { keywords: ["paris"], city: "Paris", lat: 48.8566, lon: 2.3522, region: "europe" },
  { keywords: ["berlin"], city: "Berlin", lat: 52.52, lon: 13.405, region: "europe" },
  { keywords: ["sydney", "harbour"], city: "Sydney", lat: -33.8523, lon: 151.2108, region: "asia" },
  { keywords: ["hong kong"], city: "Hong Kong", lat: 22.2783, lon: 114.1747, region: "asia" },
  { keywords: ["singapore", "marina bay"], city: "Singapore", lat: 1.2833, lon: 103.8607, region: "asia" },
  { keywords: ["seoul"], city: "Seoul", lat: 37.5665, lon: 126.978, region: "asia" },
  { keywords: ["rio", "copacabana"], city: "Rio de Janeiro", lat: -22.9711, lon: -43.1822, region: "americas" },
  { keywords: ["san francisco", "sf"], city: "San Francisco", lat: 37.7943, lon: -122.3994, region: "americas" },
  { keywords: ["los angeles", "la"], city: "Los Angeles", lat: 34.0522, lon: -118.2437, region: "americas" },
  { keywords: ["miami", "miami beach"], city: "Miami", lat: 25.7617, lon: -80.1918, region: "americas" },
  { keywords: ["venice"], city: "Venice", lat: 45.4408, lon: 12.3155, region: "europe" },
  { keywords: ["doha"], city: "Doha", lat: 25.2854, lon: 51.531, region: "mideast" },
  { keywords: ["train", "railroad", "railfan"], city: "Global", lat: 39.8283, lon: -98.5795, region: "americas" },
];

interface DiscoverResult {
  items: CctvCamera[];
  liveCount: number;
}

function inferLocation(
  channelId: string,
  title: string,
  channelTitle: string
): { city: string; lat: number; lon: number; region: CctvRegion } {
  const override = CHANNEL_LOCATION_OVERRIDES[channelId];
  if (override) return override;

  const text = `${title} ${channelTitle}`.toLowerCase();
  for (const { keywords, city, lat, lon, region } of CITY_KEYWORDS) {
    if (keywords.some((k) => text.includes(k))) {
      return { city, lat, lon, region };
    }
  }
  return { city: "Global", lat: 0, lon: 0, region: "americas" };
}

export async function discoverYouTubeLiveWebcams(
  apiKey?: string | undefined
): Promise<CachedFetchResult<DiscoverResult>> {
  const cacheKey = `rss-hybrid-webcams:${WEBCAM_CHANNELS.map((c) => c.channelId).join(",")}`;
  const fallback: DiscoverResult = { items: [], liveCount: 0 };

  return cachedFetch({
    cacheKey,
    policy: CCTV_HYBRID_POLICY,
    fallbackValue: fallback,
    request: async () => {
      // Step 1: Fetch RSS feeds from all webcam channels (free, no quota)
      const rssResults = await Promise.all(
        WEBCAM_CHANNELS.map(async (ch) => {
          try {
            return await fetchChannelRss(ch.channelId, ch.label, 5);
          } catch {
            return [];
          }
        })
      );
      const allRssVideos = rssResults.flat();

      // Step 2: Enrich with live status (1 unit per 50 videos)
      const enriched = await enrichWithLiveStatus(allRssVideos, apiKey);

      // Step 3: Filter to live-only and convert to CctvCamera
      const seen = new Set<string>();
      const items: CctvCamera[] = [];

      for (const video of enriched) {
        if (!video.liveNow) continue;
        if (seen.has(video.videoId)) continue;
        seen.add(video.videoId);

        const loc = inferLocation(video.channelId, video.title, video.channelName);

        items.push({
          id: `yt_live_${video.videoId}`,
          city: loc.city,
          name: video.title,
          lat: loc.lat,
          lon: loc.lon,
          snapshotUrl: video.thumbnailUrl || youtubeThumbnailUrl(video.videoId, "hqdefault"),
          refreshSeconds: 60,
          streamUrl: `https://www.youtube.com/embed/${video.videoId}?autoplay=1&mute=1&playsinline=1&rel=0`,
          streamFormat: "YOUTUBE",
          region: loc.region,
        });
      }

      // If no live streams found with API enrichment, include recent videos as fallback
      if (items.length === 0) {
        for (const video of enriched.slice(0, 12)) {
          if (seen.has(video.videoId)) continue;
          seen.add(video.videoId);

          const loc = inferLocation(video.channelId, video.title, video.channelName);
          items.push({
            id: `yt_live_${video.videoId}`,
            city: loc.city,
            name: video.title,
            lat: loc.lat,
            lon: loc.lon,
            snapshotUrl: video.thumbnailUrl || youtubeThumbnailUrl(video.videoId, "hqdefault"),
            refreshSeconds: 60,
            streamUrl: `https://www.youtube.com/embed/${video.videoId}?autoplay=1&mute=1&playsinline=1&rel=0`,
            streamFormat: "YOUTUBE",
            region: loc.region,
          });
        }
      }

      return {
        items: items.slice(0, 24),
        liveCount: items.filter((_, i) => i < items.length && enriched[i]?.liveNow).length,
      };
    },
  });
}
