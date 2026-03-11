import { XMLParser } from "fast-xml-parser";
import { featureFlags } from "../../../../config/featureFlags";
import { NEWS_VIDEO_CHANNELS } from "../../../../config/newsConfig";
import { WEBCAM_VIDEO_CHANNELS } from "../../../../config/webcamConfig";
import type { YouTubeLive } from "../../../news/types";
import { cachedFetch, fetchJsonOrThrow, type CachedFetchResult, type UpstreamPolicy } from "../upstream";
import {
  fetchChannelRss,
  enrichWithLiveStatus,
  resolveUsername,
  youtubeThumbnailUrl,
  RSS_HYBRID_POLICY,
  type EnrichedVideo,
} from "../../invidious/client";

/** Resolved channel with channelId (required for API calls). */
interface ResolvedChannel {
  channelId: string;
  label: string;
}

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
    contentDetails?: {
      duration?: string;
      regionRestriction?: {
        allowed?: string[];
        blocked?: string[];
      };
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

/** Maximum age for a "recent" (non-live) video to be surfaced. */
const RECENT_MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours

/** Minimum video duration in seconds — anything shorter (Shorts / Reels) is excluded. */
const MIN_VIDEO_DURATION_SEC = 90;

/** Parse an ISO 8601 duration (e.g. "PT1H2M30S") to total seconds. */
function parseDurationSec(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return undefined;
  return (parseInt(m[1] || "0", 10)) * 3600
       + (parseInt(m[2] || "0", 10)) * 60
       + (parseInt(m[3] || "0", 10));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

/** Return true if the item should be included. Live streams always pass; recent items must be within RECENT_MAX_AGE_MS. */
function isRecent(item: YouTubeLive): boolean {
  if (item.status === "live") return true;
  const ts = Date.parse(item.publishedAt ?? "");
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= RECENT_MAX_AGE_MS;
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
  return [...NEWS_VIDEO_CHANNELS].sort((a, b) => b.priority - a.priority).slice(0, 50);
}

async function discoverFromDataApi(
  apiKey: string,
  channels: ResolvedChannel[]
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
        { headers: { "User-Agent": "SIGINT/0.1 (news-video-data-api)" } },
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
        playlistUrl.searchParams.set("maxResults", "5");
        playlistUrl.searchParams.set("key", apiKey);

        try {
          const playlistResp = await fetchJsonOrThrow<YtPlaylistItemsResponse>(
            playlistUrl.toString(),
            { headers: { "User-Agent": "SIGINT/0.1 (news-video-data-api)" } },
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
        videosUrl.searchParams.set("part", "snippet,contentDetails,liveStreamingDetails");
        videosUrl.searchParams.set("id", batch.join(","));
        videosUrl.searchParams.set("key", apiKey);
        try {
          const videosResp = await fetchJsonOrThrow<YtVideosResponse>(
            videosUrl.toString(),
            { headers: { "User-Agent": "SIGINT/0.1 (news-video-data-api)" } },
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

      const allItems: YouTubeLive[] = [];
      for (const candidate of candidates) {
        const meta = videoMetaById.get(candidate.videoId);
        const snippet = meta?.snippet;
        const liveMeta = meta?.liveStreamingDetails;
        const broadcastStatus = snippet?.liveBroadcastContent?.toLowerCase();
        const isLive = broadcastStatus === "live" && !liveMeta?.actualEndTime;

        // Skip upcoming broadcasts — not watchable yet
        if (broadcastStatus === "upcoming") continue;
        // Skip finished livestream replays (has actualEndTime → it's a VOD replay)
        if (!isLive && liveMeta?.actualEndTime) continue;
        // Skip Shorts / Reels (< 90 s) — only for non-live videos
        const duration = parseDurationSec(meta?.contentDetails?.duration);
        if (!isLive && duration !== undefined && duration < MIN_VIDEO_DURATION_SEC) continue;
        // Skip geo-restricted videos (blocked in US)
        const restriction = meta?.contentDetails?.regionRestriction;
        if (restriction) {
          if (restriction.allowed && !restriction.allowed.includes("US")) continue;
          if (restriction.blocked?.includes("US")) continue;
        }

        const channelId = snippet?.channelId?.trim() || candidate.channelId;
        const channelName =
          channelLabelById.get(channelId) ||
          candidate.channelName ||
          snippet?.channelTitle?.trim() ||
          channelId;
        const publishedAt = snippet?.publishedAt || candidate.publishedAt;

        allItems.push({
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
        });
      }

      const items = dedupeAndSort(allItems).filter(isRecent);
      return {
        items,
        channelsChecked: channels.length,
        liveCount: items.filter((item) => item.status === "live").length,
        degraded: uniqueStrings(degradedChannels),
      };
    },
  });
}

// ─── RSS + minimal API hybrid discovery (~99% quota reduction) ──────────────

function enrichedVideoToYouTubeLive(video: EnrichedVideo): YouTubeLive {
  const isLive = video.liveNow;
  return {
    id: `${isLive ? "live" : "recent"}-${video.videoId}`,
    videoId: video.videoId,
    channelId: video.channelId,
    channelName: video.channelName,
    title: video.title || "YouTube stream",
    thumbnailUrl: video.thumbnailUrl || youtubeThumbnailUrl(video.videoId, "mqdefault"),
    publishedAt: video.publishedAt,
    startedAt: isLive ? (video.actualStartTime || video.publishedAt) : undefined,
    viewerCount: isLive ? video.viewerCount : undefined,
    status: isLive ? "live" : "recent",
    sourceUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
  };
}

async function discoverFromRssHybrid(
  channels: ResolvedChannel[],
  apiKey: string | undefined
): Promise<CachedFetchResult<YouTubeDiscoveryData>> {
  const cacheKey = `rss-hybrid:${channels.map((c) => c.channelId).join(",")}`;

  return cachedFetch({
    cacheKey,
    policy: RSS_HYBRID_POLICY,
    fallbackValue: {
      items: [],
      channelsChecked: channels.length,
      liveCount: 0,
      degraded: [],
    },
    request: async () => {
      const degradedChannels: string[] = [];

      // Step 1: Fetch RSS feeds in parallel (free, no quota)
      const rssResults = await Promise.all(
        channels.map(async (channel) => {
          try {
            return await fetchChannelRss(channel.channelId, channel.label, 5);
          } catch {
            degradedChannels.push(channel.label);
            return [];
          }
        })
      );

      const allRssVideos = rssResults.flat();

      // Step 2: Enrich with live status via videos.list (1 unit per 50 videos)
      const enriched = await enrichWithLiveStatus(allRssVideos, apiKey);

      // Step 3: Filter and convert
      const allItems: YouTubeLive[] = enriched
        .filter((v) => {
          // Skip Shorts (< 90s) unless live
          if (!v.liveNow && v.lengthSeconds > 0 && v.lengthSeconds < MIN_VIDEO_DURATION_SEC) return false;
          // Skip finished livestream replays
          if (!v.liveNow && v.actualEndTime) return false;
          // Skip geo-restricted videos (blocked in US)
          if (v.regionBlocked) return false;
          return true;
        })
        .map(enrichedVideoToYouTubeLive);

      const items = dedupeAndSort(allItems).filter(isRecent);

      return {
        items,
        channelsChecked: channels.length,
        liveCount: items.filter((item) => item.status === "live").length,
        degraded: uniqueStrings(degradedChannels),
      };
    },
  });
}

async function fetchRssChannelItems(channel: ResolvedChannel): Promise<YouTubeLive[]> {
  const rssUrl = `${YT_RSS_BASE}?channel_id=${encodeURIComponent(channel.channelId)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RSS_FALLBACK_POLICY.timeoutMs);
  try {
    const response = await fetch(rssUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "SIGINT/0.1 (news-video-rss)",
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
    const entries = toArray(feed?.entry as Record<string, unknown> | Record<string, unknown>[] | undefined).slice(0, 5);
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
  channels: ResolvedChannel[]
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
      const items = dedupeAndSort(allItems).filter(isRecent);
      return {
        items,
        channelsChecked: channels.length,
        liveCount: 0,
        degraded: uniqueStrings(degradedChannels),
      };
    },
  });
}

/** Resolve WebcamChannel[] to ResolvedChannel[]. Resolves forUsername via YouTube API (1 unit each). */
async function resolveWebcamChannels(apiKey: string | undefined): Promise<ResolvedChannel[]> {
  const resolved: ResolvedChannel[] = [];
  for (const ch of WEBCAM_VIDEO_CHANNELS) {
    if (ch.channelId) {
      resolved.push({ channelId: ch.channelId, label: ch.label });
      continue;
    }
    if (ch.forUsername) {
      try {
        const id = await resolveUsername(ch.forUsername, apiKey);
        if (id) resolved.push({ channelId: id, label: ch.label });
      } catch {
        /* skip unresolved */
      }
    }
  }
  return resolved.sort((a, b) => {
    const pa = WEBCAM_VIDEO_CHANNELS.find((c) => c.label === a.label)?.priority ?? 0;
    const pb = WEBCAM_VIDEO_CHANNELS.find((c) => c.label === b.label)?.priority ?? 0;
    return pb - pa;
  });
}

/** Discover live streams from webcam channels (EarthCam, SkylineWebcams, Explore.org, etc.). */
export async function discoverYouTubeWebcamStreams(
  apiKey: string | undefined
): Promise<CachedFetchResult<YouTubeLiveResult>> {
  // When YouTube API is disabled, skip username resolution and use RSS fallback
  if (featureFlags.disableYouTubeApi) {
    const channels: ResolvedChannel[] = WEBCAM_VIDEO_CHANNELS
      .filter((ch) => ch.channelId)
      .map((ch) => ({ channelId: ch.channelId!, label: ch.label }));
    const rssResult = await discoverFromRss(channels);
    return {
      data: {
        ...rssResult.data,
        keyMissing: false,
        discoverySource: "youtube-rss",
        fallbackActive: true,
      },
      degraded: false,
      latencyMs: rssResult.latencyMs,
      cacheHit: rssResult.cacheHit,
      error: rssResult.error,
    };
  }

  const channels = await resolveWebcamChannels(apiKey);
  if (channels.length === 0) {
    return {
      data: {
        items: [],
        channelsChecked: 0,
        liveCount: 0,
        degraded: ["No webcam channels resolved"],
        keyMissing: !apiKey,
        discoverySource: "youtube-rss",
        fallbackActive: true,
      },
      degraded: true,
      latencyMs: 0,
      cacheHit: "miss",
      error: null,
    };
  }

  // Primary: RSS hybrid (RSS feeds + minimal videos.list for live enrichment)
  const hybridResult = await discoverFromRssHybrid(channels, apiKey);
  return {
    data: {
      ...hybridResult.data,
      keyMissing: !apiKey,
      discoverySource: apiKey ? "youtube-data-api" : "youtube-rss",
      fallbackActive: hybridResult.degraded || false,
    },
    degraded: hybridResult.degraded,
    latencyMs: hybridResult.latencyMs,
    cacheHit: hybridResult.cacheHit,
    error: hybridResult.error,
  };
}

export async function discoverYouTubeLiveStreams(
  apiKey: string | undefined
): Promise<CachedFetchResult<YouTubeLiveResult>> {
  const channels = sortedChannels();

  // When YouTube API is disabled, go straight to pure RSS fallback
  if (featureFlags.disableYouTubeApi) {
    const rssResult = await discoverFromRss(channels);
    return {
      data: {
        ...rssResult.data,
        keyMissing: false,
        discoverySource: "youtube-rss",
        fallbackActive: true,
      },
      degraded: false,
      latencyMs: rssResult.latencyMs,
      cacheHit: rssResult.cacheHit,
      error: rssResult.error,
    };
  }

  // Primary: RSS hybrid (RSS feeds for video IDs + minimal videos.list for live status)
  // Cost: ~5-10 quota units instead of hundreds. RSS is free, videos.list = 1 unit per 50 vids.
  const hybridResult = await discoverFromRssHybrid(channels, apiKey);
  if (!hybridResult.degraded && !hybridResult.error) {
    return {
      data: {
        ...hybridResult.data,
        keyMissing: !apiKey,
        discoverySource: apiKey ? "youtube-data-api" : "youtube-rss",
        fallbackActive: false,
      },
      degraded: hybridResult.degraded,
      latencyMs: hybridResult.latencyMs,
      cacheHit: hybridResult.cacheHit,
      error: hybridResult.error,
    };
  }

  // Fallback: pure RSS (no live detection but still shows recent uploads)
  const rssResult = await discoverFromRss(channels);
  return {
    data: {
      ...rssResult.data,
      degraded: uniqueStrings([...hybridResult.data.degraded, ...rssResult.data.degraded]),
      keyMissing: !apiKey,
      discoverySource: "youtube-rss",
      fallbackActive: true,
    },
    degraded: true,
    latencyMs: hybridResult.latencyMs + rssResult.latencyMs,
    cacheHit: rssResult.cacheHit,
    error: rssResult.error ?? hybridResult.error,
  };
}
