import type { CctvCamera, CctvRegion } from "../../providers/types";
import {
  cachedFetch,
  fetchJsonOrThrow,
  type CachedFetchResult,
  type UpstreamPolicy,
} from "../news/upstream";

const YT_SEARCH_BASE = "https://www.googleapis.com/youtube/v3/search";
const YT_VIDEOS_BASE = "https://www.googleapis.com/youtube/v3/videos";

const LIVECAM_API_POLICY: UpstreamPolicy = {
  key: "youtube-cctv-live",
  ttlMs: 2 * 60_000,
  staleTtlMs: 10 * 60_000,
  timeoutMs: 9_000,
  maxRetries: 1,
  backoffBaseMs: 650,
  circuitFailureThreshold: 3,
  circuitOpenMs: 180_000,
  rateLimit: { capacity: 4, refillPerSec: 2, minIntervalMs: 500 },
};

const SEARCH_QUERIES = [
  "live webcam",
  "24/7 live stream",
  "earth cam live",
  "city live cam",
];

const CHANNEL_LOCATION_OVERRIDES: Record<
  string,
  { city: string; lat: number; lon: number; region: CctvRegion }
> = {
  // EarthCam - known 24/7 webcam provider
  UC3eSRD2gPP4LkUnxLrA0xHg: {
    city: "New York",
    lat: 40.7128,
    lon: -74.006,
    region: "americas",
  },
  // Skyline Webcams and similar - expand as needed
  UCEyX5lg6BL_Hl9rpE6B7Y9w: {
    city: "London",
    lat: 51.5074,
    lon: -0.1278,
    region: "europe",
  },
};

/** Simple city→coords mapping for title/description keyword inference */
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
  { keywords: ["doha"], city: "Doha", lat: 25.2854, lon: 51.531, region: "mideast" },
];

interface YtSearchItem {
  id?: { videoId?: string };
  snippet?: {
    channelId?: string;
    channelTitle?: string;
    title?: string;
    publishedAt?: string;
    thumbnails?: { medium?: { url?: string }; high?: { url?: string } };
  };
}

interface YtSearchResponse {
  items?: YtSearchItem[];
}

interface YtVideosResponse {
  items?: Array<{
    id?: string;
    snippet?: {
      channelId?: string;
      channelTitle?: string;
      title?: string;
      liveBroadcastContent?: string;
      thumbnails?: { medium?: { url?: string }; high?: { url?: string } };
    };
    liveStreamingDetails?: {
      actualStartTime?: string;
      actualEndTime?: string;
      concurrentViewers?: string;
    };
  }>;
}

interface DiscoverResult {
  items: CctvCamera[];
  liveCount: number;
}

function uniqueVideoIds(items: { videoId: string }[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    const id = it.videoId?.trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
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

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export async function discoverYouTubeLiveWebcams(
  apiKey: string | undefined
): Promise<CachedFetchResult<DiscoverResult>> {
  const cacheKey = `live-webcams:${SEARCH_QUERIES.join(",")}`;
  const fallback: DiscoverResult = { items: [], liveCount: 0 };

  if (!apiKey) {
    return {
      data: fallback,
      degraded: true,
      latencyMs: 0,
      cacheHit: "miss",
      error: "YOUTUBE_API_KEY missing",
    };
  }

  return cachedFetch({
    cacheKey,
    policy: LIVECAM_API_POLICY,
    fallbackValue: fallback,
    request: async () => {
      const candidates: Array<{
        videoId: string;
        channelId: string;
        channelName: string;
        title: string;
        thumbnailUrl?: string;
      }> = [];

      for (const q of SEARCH_QUERIES) {
        const url = new URL(YT_SEARCH_BASE);
        url.searchParams.set("part", "snippet");
        url.searchParams.set("type", "video");
        url.searchParams.set("eventType", "live");
        url.searchParams.set("q", q);
        url.searchParams.set("maxResults", "8");
        url.searchParams.set("order", "viewCount");
        url.searchParams.set("key", apiKey);

        try {
          const resp = await fetchJsonOrThrow<YtSearchResponse>(
            url.toString(),
            { headers: { "User-Agent": "WorldView/0.1 (cctv-live-search)" } },
            LIVECAM_API_POLICY.timeoutMs
          );
          for (const item of resp.items ?? []) {
            const videoId = item.id?.videoId?.trim();
            if (!videoId) continue;
            const snippet = item.snippet;
            candidates.push({
              videoId,
              channelId: snippet?.channelId?.trim() || "",
              channelName: snippet?.channelTitle?.trim() || "YouTube",
              title: snippet?.title?.trim() || "Live stream",
              thumbnailUrl: snippet?.thumbnails?.high?.url ?? snippet?.thumbnails?.medium?.url,
            });
          }
        } catch {
          // Continue with other queries
        }
      }

      const uniqueIds = uniqueVideoIds(candidates);
      const videoMeta = new Map<string, NonNullable<YtVideosResponse["items"]>[number]>();

      for (const batch of chunk(uniqueIds, 50)) {
        if (!batch.length) continue;
        const videosUrl = new URL(YT_VIDEOS_BASE);
        videosUrl.searchParams.set("part", "snippet,liveStreamingDetails");
        videosUrl.searchParams.set("id", batch.join(","));
        videosUrl.searchParams.set("key", apiKey);

        try {
          const videosResp = await fetchJsonOrThrow<YtVideosResponse>(
            videosUrl.toString(),
            { headers: { "User-Agent": "WorldView/0.1 (cctv-live-videos)" } },
            LIVECAM_API_POLICY.timeoutMs
          );
          for (const item of videosResp.items ?? []) {
            const id = item.id?.trim();
            if (id) videoMeta.set(id, item);
          }
        } catch {
          // Use search snippet data if videos.list fails
        }
      }

      const byVideoId = new Map<string, (typeof candidates)[number]>();
      for (const c of candidates) {
        if (!byVideoId.has(c.videoId)) byVideoId.set(c.videoId, c);
      }

      const items: CctvCamera[] = [];
      const seen = new Set<string>();

      const videoIdsToProcess =
        videoMeta.size > 0 ? Array.from(videoMeta.keys()) : uniqueIds;

      for (const videoId of videoIdsToProcess) {
        const meta = videoMeta.get(videoId);
        const candidate = byVideoId.get(videoId);

        const liveContent = meta?.snippet?.liveBroadcastContent?.toLowerCase();
        const hasEndTime = !!meta?.liveStreamingDetails?.actualEndTime;
        const isLive =
          meta != null
            ? liveContent === "live" && !hasEndTime
            : true;

        if (!isLive) continue;
        if (seen.has(videoId)) continue;
        seen.add(videoId);

        const c = candidate ?? {
          videoId,
          channelId: meta?.snippet?.channelId ?? "",
          channelName: meta?.snippet?.channelTitle ?? "YouTube",
          title: meta?.snippet?.title ?? "Live stream",
          thumbnailUrl:
            meta?.snippet?.thumbnails?.high?.url ??
            meta?.snippet?.thumbnails?.medium?.url,
        };

        const loc = inferLocation(c.channelId, c.title, c.channelName);

        const snapshotUrl =
          c.thumbnailUrl ??
          meta?.snippet?.thumbnails?.high?.url ??
          meta?.snippet?.thumbnails?.medium?.url ??
          `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

        const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&playsinline=1&rel=0`;

        items.push({
          id: `yt_live_${videoId}`,
          city: loc.city,
          name: c.title,
          lat: loc.lat,
          lon: loc.lon,
          snapshotUrl,
          refreshSeconds: 60,
          streamUrl: embedUrl,
          streamFormat: "YOUTUBE",
          region: loc.region,
        });
      }

      return {
        items: items.slice(0, 24),
        liveCount: items.length,
      };
    },
  });
}
