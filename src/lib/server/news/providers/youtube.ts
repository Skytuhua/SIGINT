import { NEWS_VIDEO_CHANNELS } from "../../../../config/newsConfig";
import type { YouTubeLive } from "../../../news/types";
import { cachedFetch, fetchJsonOrThrow, type CachedFetchResult, type UpstreamPolicy } from "../upstream";

const YT_SEARCH_BASE = "https://www.googleapis.com/youtube/v3/search";

const POLICY: UpstreamPolicy = {
  key: "youtube-live",
  ttlMs: 2 * 60_000,
  staleTtlMs: 10 * 60_000,
  timeoutMs: 8_000,
  maxRetries: 1,
  backoffBaseMs: 550,
  circuitFailureThreshold: 3,
  circuitOpenMs: 120_000,
  rateLimit: { capacity: 3, refillPerSec: 3, minIntervalMs: 280 },
};

interface YtSearchResponse {
  items?: Array<{
    id?: { videoId?: string };
    snippet?: {
      channelId?: string;
      channelTitle?: string;
      title?: string;
      thumbnails?: { medium?: { url: string } };
      publishedAt?: string;
    };
  }>;
}

export interface YouTubeLiveResult {
  items: YouTubeLive[];
  channelsChecked: number;
  liveCount: number;
  degraded: string[];
  keyMissing: boolean;
}

async function fetchChannelVideos(args: {
  apiKey: string;
  channelId: string;
  maxResults: number;
  eventType?: "live";
  order?: "date";
}): Promise<YouTubeLive[]> {
  const url = new URL(YT_SEARCH_BASE);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("channelId", args.channelId);
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", String(args.maxResults));
  if (args.eventType) {
    url.searchParams.set("eventType", args.eventType);
  }
  if (args.order) {
    url.searchParams.set("order", args.order);
  }
  url.searchParams.set("key", args.apiKey);

  const json = await fetchJsonOrThrow<YtSearchResponse>(
    url.toString(),
    { headers: { "User-Agent": "WorldView/0.1 (research)" } },
    POLICY.timeoutMs
  );

  const videos: YouTubeLive[] = [];
  for (const item of json.items ?? []) {
    const videoId = item.id?.videoId?.trim();
    if (!videoId) continue;
    const channelId = item.snippet?.channelId?.trim() || args.channelId;
    const channelName = item.snippet?.channelTitle?.trim() || channelId;
    const title = item.snippet?.title?.trim() || "Live stream";
    const publishedAt = item.snippet?.publishedAt;
    const isLive = args.eventType === "live";
    videos.push({
      id: `${isLive ? "live" : "recent"}-${videoId}`,
      videoId,
      channelId,
      channelName,
      title,
      thumbnailUrl: item.snippet?.thumbnails?.medium?.url,
      publishedAt,
      startedAt: isLive ? publishedAt : undefined,
      status: isLive ? "live" : "recent",
      sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
    });
  }
  return videos;
}

export async function discoverYouTubeLiveStreams(
  apiKey: string | undefined
): Promise<CachedFetchResult<YouTubeLiveResult>> {
  if (!apiKey) {
    return {
      data: { items: [], channelsChecked: 0, liveCount: 0, degraded: [], keyMissing: true },
      degraded: false,
      latencyMs: 0,
      cacheHit: "miss",
    };
  }

  const sortedChannels = [...NEWS_VIDEO_CHANNELS].sort((a, b) => b.priority - a.priority).slice(0, 14);
  const cacheKey = `channels:${sortedChannels.map((c) => c.channelId).join(",")}`;
  return cachedFetch({
    cacheKey,
    policy: POLICY,
    fallbackValue: { items: [], channelsChecked: 0, liveCount: 0, degraded: [], keyMissing: false },
    request: async () => {
      const degradedChannels: string[] = [];
      const allItems: YouTubeLive[] = [];
      let liveCount = 0;

      for (const channel of sortedChannels) {
        try {
          const liveItems = await fetchChannelVideos({
            apiKey,
            channelId: channel.channelId,
            maxResults: 3,
            eventType: "live",
          });
          const normalizedLive = liveItems.map((item) => ({ ...item, channelName: channel.label }));
          if (normalizedLive.length) {
            allItems.push(...normalizedLive);
            liveCount += normalizedLive.length;
            continue;
          }

          const recentItems = await fetchChannelVideos({
            apiKey,
            channelId: channel.channelId,
            maxResults: 1,
            order: "date",
          });
          if (recentItems.length) {
            allItems.push({ ...recentItems[0], channelName: channel.label, status: "recent" });
          }
        } catch {
          degradedChannels.push(channel.label);
        }
      }

      const deduped = new Map<string, YouTubeLive>();
      for (const item of allItems) {
        const key = `${item.status}:${item.videoId}`.toLowerCase();
        if (!deduped.has(key)) {
          deduped.set(key, item);
        }
      }

      const items = Array.from(deduped.values()).sort((a, b) => {
        if (a.status !== b.status) {
          return a.status === "live" ? -1 : 1;
        }
        const aDate = Date.parse(a.publishedAt ?? "");
        const bDate = Date.parse(b.publishedAt ?? "");
        if (Number.isFinite(aDate) && Number.isFinite(bDate)) {
          return bDate - aDate;
        }
        return 0;
      });

      return {
        items,
        channelsChecked: sortedChannels.length,
        liveCount,
        degraded: degradedChannels,
        keyMissing: false,
      };
    },
  });
}
