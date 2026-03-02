import { XMLParser } from "fast-xml-parser";
import { NEWS_VIDEO_CHANNELS } from "../../../../config/newsConfig";
import type { YouTubeLive } from "../../../news/types";
import { cachedFetch, fetchJsonOrThrow, type CachedFetchResult, type UpstreamPolicy } from "../upstream";

const YT_CHANNELS_BASE = "https://www.googleapis.com/youtube/v3/channels";
const YT_PLAYLIST_ITEMS_BASE = "https://www.googleapis.com/youtube/v3/playlistItems";
const YT_VIDEOS_BASE = "https://www.googleapis.com/youtube/v3/videos";
const YT_RSS_BASE = "https://www.youtube.com/feeds/videos.xml";

const DATA_API_POLICY: UpstreamPolicy = {
  key: "youtube-data-api",
  ttlMs: 10 * 60_000,
  staleTtlMs: 60 * 60_000,
  timeoutMs: 9_000,
  maxRetries: 1,
  backoffBaseMs: 650,
  circuitFailureThreshold: 3,
  circuitOpenMs: 180_000,
  rateLimit: { capacity: 2, refillPerSec: 2, minIntervalMs: 420 },
};

const RSS_FALLBACK_POLICY: UpstreamPolicy = {
  key: "youtube-rss-fallback",
  ttlMs: 15 * 60_000,
  staleTtlMs: 120 * 60_000,
  timeoutMs: 9_000,
  maxRetries: 1,
  backoffBaseMs: 450,
  circuitFailureThreshold: 3,
  circuitOpenMs: 180_000,
  rateLimit: { capacity: 4, refillPerSec: 3, minIntervalMs: 220 },
};

const XML = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  parseTagValue: false,
  processEntities: true,
});

interface YouTubeDiscoveryData {
  items: YouTubeLive[];
  channelsChecked: number;
  liveCount: number;
  degraded: string[];
}

export interface YouTubeLiveResult extends YouTubeDiscoveryData {
  keyMissing: boolean;
  discoverySource: "youtube-data-api" | "youtube-rss";
  fallbackActive: boolean;
}

interface YtChannelsResponse {
  items?: Array<{
    id?: string;
    contentDetails?: {
      relatedPlaylists?: {
        uploads?: string;
      };
    };
  }>;
}

interface YtPlaylistItemsResponse {
  items?: Array<{
    contentDetails?: {
      videoId?: string;
      videoPublishedAt?: string;
    };
    snippet?: {
      channelId?: string;
      channelTitle?: string;
      title?: string;
      publishedAt?: string;
      thumbnails?: { medium?: { url?: string } };
    };
  }>;
}

interface YtVideosResponse {
  items?: Array<{
    id?: string;
    snippet?: {
      channelId?: string;
      channelTitle?: string;
      title?: string;
      publishedAt?: string;
      liveBroadcastContent?: string;
      thumbnails?: { medium?: { url?: string } };
    };
    liveStreamingDetails?: {
      actualStartTime?: string;
      actualEndTime?: string;
      scheduledStartTime?: string;
      concurrentViewers?: string;
    };
  }>;
}

interface CandidateVideo {
  videoId: string;
  channelId: string;
  channelName: string;
  title: string;
  publishedAt?: string;
  thumbnailUrl?: string;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function readText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  if (typeof record["#text"] === "string") return record["#text"].trim();
  if (typeof record["__cdata"] === "string") return record["__cdata"].trim();
  if (typeof record["@_href"] === "string") return record["@_href"].trim();
  if (typeof record["@_url"] === "string") return record["@_url"].trim();
  if (typeof record["url"] === "string") return record["url"].trim();
  return "";
}

function parseViewerCount(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function pickRssThumbnail(entry: Record<string, unknown>): string | undefined {
  const mediaGroup = entry["media:group"] as Record<string, unknown> | undefined;
  if (!mediaGroup || typeof mediaGroup !== "object") return undefined;
  const thumb = mediaGroup["media:thumbnail"];
  if (!thumb) return undefined;
  if (Array.isArray(thumb)) {
    for (const row of thumb) {
      const url = readText(row);
      if (url) return url;
      if (row && typeof row === "object") {
        const record = row as Record<string, unknown>;
        const attrUrl = typeof record["@_url"] === "string" ? record["@_url"].trim() : "";
        if (attrUrl) return attrUrl;
      }
    }
    return undefined;
  }
  const simple = readText(thumb);
  if (simple) return simple;
  if (thumb && typeof thumb === "object") {
    const record = thumb as Record<string, unknown>;
    const attrUrl = typeof record["@_url"] === "string" ? record["@_url"].trim() : "";
    if (attrUrl) return attrUrl;
  }
  return undefined;
}

function dedupeAndSort(items: YouTubeLive[]): YouTubeLive[] {
  const deduped = new Map<string, YouTubeLive>();
  for (const item of items) {
    const key = item.videoId.toLowerCase();
    const prev = deduped.get(key);
    if (!prev) {
      deduped.set(key, item);
      continue;
    }

    if (prev.status !== "live" && item.status === "live") {
      deduped.set(key, item);
      continue;
    }

    if (prev.status === item.status) {
      const prevTs = Date.parse(prev.publishedAt ?? "");
      const nextTs = Date.parse(item.publishedAt ?? "");
      if (Number.isFinite(nextTs) && (!Number.isFinite(prevTs) || nextTs > prevTs)) {
        deduped.set(key, item);
      }
    }
  }
  return Array.from(deduped.values()).sort((a, b) => {
    if (a.status !== b.status) return a.status === "live" ? -1 : 1;
    const aDate = Date.parse(a.publishedAt ?? "");
    const bDate = Date.parse(b.publishedAt ?? "");
    if (Number.isFinite(aDate) && Number.isFinite(bDate)) return bDate - aDate;
    return 0;
  });
}

function sortedChannels() {
  return [...NEWS_VIDEO_CHANNELS].sort((a, b) => b.priority - a.priority).slice(0, 14);
}

async function discoverFromDataApi(
  apiKey: string,
  channels: Array<(typeof NEWS_VIDEO_CHANNELS)[number]>
): Promise<CachedFetchResult<YouTubeDiscoveryData>> {
  const cacheKey = `channels:${channels.map((c) => c.channelId).join(",")}`;
  const channelLabelById = new Map(channels.map((c) => [c.channelId, c.label]));

  return cachedFetch({
    cacheKey,
    policy: DATA_API_POLICY,
    fallbackValue: {
      items: [],
      channelsChecked: channels.length,
      liveCount: 0,
      degraded: [],
    },
    request: async () => {
      const degradedChannels: string[] = [];
      const channelIds = channels.map((c) => c.channelId);

      const channelsUrl = new URL(YT_CHANNELS_BASE);
      channelsUrl.searchParams.set("part", "contentDetails");
      channelsUrl.searchParams.set("id", channelIds.join(","));
      channelsUrl.searchParams.set("key", apiKey);

      const channelsResp = await fetchJsonOrThrow<YtChannelsResponse>(
        channelsUrl.toString(),
        { headers: { "User-Agent": "WorldView/0.1 (news-video-data-api)" } },
        DATA_API_POLICY.timeoutMs
      );

      const uploadsByChannel = new Map<string, string>();
      for (const item of channelsResp.items ?? []) {
        const channelId = item.id?.trim();
        const uploadsId = item.contentDetails?.relatedPlaylists?.uploads?.trim();
        if (channelId && uploadsId) uploadsByChannel.set(channelId, uploadsId);
      }

      const candidates: CandidateVideo[] = [];
      for (const channel of channels) {
        const uploadsId = uploadsByChannel.get(channel.channelId);
        if (!uploadsId) {
          degradedChannels.push(channel.label);
          continue;
        }
        const playlistUrl = new URL(YT_PLAYLIST_ITEMS_BASE);
        playlistUrl.searchParams.set("part", "snippet,contentDetails");
        playlistUrl.searchParams.set("playlistId", uploadsId);
        playlistUrl.searchParams.set("maxResults", "3");
        playlistUrl.searchParams.set("key", apiKey);

        try {
          const playlistResp = await fetchJsonOrThrow<YtPlaylistItemsResponse>(
            playlistUrl.toString(),
            { headers: { "User-Agent": "WorldView/0.1 (news-video-data-api)" } },
            DATA_API_POLICY.timeoutMs
          );
          for (const row of playlistResp.items ?? []) {
            const videoId = row.contentDetails?.videoId?.trim();
            if (!videoId) continue;
            const snippet = row.snippet;
            const resolvedChannelId = snippet?.channelId?.trim() || channel.channelId;
            const label =
              channelLabelById.get(resolvedChannelId) ||
              channelLabelById.get(channel.channelId) ||
              snippet?.channelTitle?.trim() ||
              resolvedChannelId;
            candidates.push({
              videoId,
              channelId: resolvedChannelId,
              channelName: label,
              title: snippet?.title?.trim() || "YouTube stream",
              publishedAt: row.contentDetails?.videoPublishedAt || snippet?.publishedAt,
              thumbnailUrl: snippet?.thumbnails?.medium?.url,
            });
          }
        } catch {
          degradedChannels.push(channel.label);
        }
      }

      const uniqueVideoIds = uniqueStrings(candidates.map((v) => v.videoId));
      const videoMetaById = new Map<string, NonNullable<YtVideosResponse["items"]>[number]>();
      let metadataFailed = false;

      for (const batch of chunk(uniqueVideoIds, 50)) {
        if (!batch.length) continue;
        const videosUrl = new URL(YT_VIDEOS_BASE);
        videosUrl.searchParams.set("part", "snippet,liveStreamingDetails");
        videosUrl.searchParams.set("id", batch.join(","));
        videosUrl.searchParams.set("key", apiKey);
        try {
          const videosResp = await fetchJsonOrThrow<YtVideosResponse>(
            videosUrl.toString(),
            { headers: { "User-Agent": "WorldView/0.1 (news-video-data-api)" } },
            DATA_API_POLICY.timeoutMs
          );
          for (const item of videosResp.items ?? []) {
            const id = item.id?.trim();
            if (id) videoMetaById.set(id, item);
          }
        } catch {
          metadataFailed = true;
        }
      }
      if (metadataFailed) degradedChannels.push("Video metadata");

      const allItems: YouTubeLive[] = candidates.map((candidate) => {
        const meta = videoMetaById.get(candidate.videoId);
        const snippet = meta?.snippet;
        const liveMeta = meta?.liveStreamingDetails;
        const channelId = snippet?.channelId?.trim() || candidate.channelId;
        const channelName =
          channelLabelById.get(channelId) ||
          candidate.channelName ||
          snippet?.channelTitle?.trim() ||
          channelId;
        const publishedAt = snippet?.publishedAt || candidate.publishedAt;
        const isLive = snippet?.liveBroadcastContent?.toLowerCase() === "live" && !liveMeta?.actualEndTime;

        return {
          id: `${isLive ? "live" : "recent"}-${candidate.videoId}`,
          videoId: candidate.videoId,
          channelId,
          channelName,
          title: snippet?.title?.trim() || candidate.title || "YouTube stream",
          thumbnailUrl: snippet?.thumbnails?.medium?.url || candidate.thumbnailUrl,
          publishedAt,
          startedAt: isLive
            ? liveMeta?.actualStartTime || liveMeta?.scheduledStartTime || publishedAt
            : undefined,
          viewerCount: parseViewerCount(liveMeta?.concurrentViewers),
          status: isLive ? "live" : "recent",
          sourceUrl: `https://www.youtube.com/watch?v=${candidate.videoId}`,
        };
      });

      const items = dedupeAndSort(allItems);
      return {
        items,
        channelsChecked: channels.length,
        liveCount: items.filter((item) => item.status === "live").length,
        degraded: uniqueStrings(degradedChannels),
      };
    },
  });
}

async function fetchRssChannelItems(channel: (typeof NEWS_VIDEO_CHANNELS)[number]): Promise<YouTubeLive[]> {
  const rssUrl = `${YT_RSS_BASE}?channel_id=${encodeURIComponent(channel.channelId)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RSS_FALLBACK_POLICY.timeoutMs);
  try {
    const response = await fetch(rssUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "WorldView/0.1 (news-video-rss)",
        Accept: "application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`youtube-rss:${channel.channelId}:${response.status}`);
    }
    const xmlText = await response.text();
    const parsed = XML.parse(xmlText) as Record<string, unknown>;
    const feed = parsed.feed as Record<string, unknown> | undefined;
    const entries = toArray(feed?.entry as Record<string, unknown> | Record<string, unknown>[] | undefined).slice(0, 3);
    const items: YouTubeLive[] = [];
    for (const entry of entries) {
      const videoId = readText(entry["yt:videoId"]);
      if (!videoId) continue;
      const title = readText(entry.title) || "YouTube upload";
      const publishedAt = readText(entry.published) || readText(entry.updated) || undefined;
      const thumbnailUrl = pickRssThumbnail(entry);
      items.push({
        id: `recent-${videoId}`,
        videoId,
        channelId: channel.channelId,
        channelName: channel.label,
        title,
        thumbnailUrl,
        publishedAt,
        status: "recent",
        sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
      });
    }
    return items;
  } finally {
    clearTimeout(timer);
  }
}

async function discoverFromRss(
  channels: Array<(typeof NEWS_VIDEO_CHANNELS)[number]>
): Promise<CachedFetchResult<YouTubeDiscoveryData>> {
  const cacheKey = `channels:${channels.map((c) => c.channelId).join(",")}`;
  return cachedFetch({
    cacheKey,
    policy: RSS_FALLBACK_POLICY,
    fallbackValue: {
      items: [],
      channelsChecked: channels.length,
      liveCount: 0,
      degraded: [],
    },
    request: async () => {
      const degradedChannels: string[] = [];
      const allItems: YouTubeLive[] = [];
      const results = await Promise.all(
        channels.map(async (channel) => {
          try {
            return await fetchRssChannelItems(channel);
          } catch {
            degradedChannels.push(channel.label);
            return [];
          }
        })
      );
      for (const list of results) allItems.push(...list);
      const items = dedupeAndSort(allItems);
      return {
        items,
        channelsChecked: channels.length,
        liveCount: 0,
        degraded: uniqueStrings(degradedChannels),
      };
    },
  });
}

export async function discoverYouTubeLiveStreams(
  apiKey: string | undefined
): Promise<CachedFetchResult<YouTubeLiveResult>> {
  const channels = sortedChannels();
  if (!apiKey) {
    const rssResult = await discoverFromRss(channels);
    return {
      data: {
        ...rssResult.data,
        keyMissing: true,
        discoverySource: "youtube-rss",
        fallbackActive: true,
      },
      degraded: rssResult.degraded,
      latencyMs: rssResult.latencyMs,
      cacheHit: rssResult.cacheHit,
      error: rssResult.error,
    };
  }

  const dataResult = await discoverFromDataApi(apiKey, channels);
  if (dataResult.degraded || dataResult.error) {
    const rssResult = await discoverFromRss(channels);
    if (rssResult.data.items.length > 0 || !dataResult.data.items.length) {
      return {
        data: {
          ...rssResult.data,
          degraded: uniqueStrings([...dataResult.data.degraded, ...rssResult.data.degraded]),
          keyMissing: false,
          discoverySource: "youtube-rss",
          fallbackActive: true,
        },
        degraded: dataResult.degraded || rssResult.degraded,
        latencyMs: dataResult.latencyMs + rssResult.latencyMs,
        cacheHit: rssResult.cacheHit,
        error: rssResult.error ?? dataResult.error,
      };
    }
  }

  return {
    data: {
      ...dataResult.data,
      keyMissing: false,
      discoverySource: "youtube-data-api",
      fallbackActive: false,
    },
    degraded: dataResult.degraded,
    latencyMs: dataResult.latencyMs,
    cacheHit: dataResult.cacheHit,
    error: dataResult.error,
  };
}
