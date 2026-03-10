/**
 * YouTube RSS + minimal API client — drastically reduces quota usage.
 *
 * Strategy:
 * 1. Use free YouTube RSS feeds to discover recent video IDs from channels
 * 2. Batch all video IDs into a single videos.list call (1 quota unit per 50 videos)
 *    to check live status, duration, etc.
 *
 * Quota impact: ~5-10 units per discovery cycle instead of 400+ with search.list.
 * The 10,000 units/day free tier becomes more than sufficient.
 */

import { XMLParser } from "fast-xml-parser";
import { fetchJsonOrThrow, type UpstreamPolicy } from "../news/upstream";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RssVideo {
  videoId: string;
  title: string;
  channelId: string;
  channelName: string;
  publishedAt?: string;
  thumbnailUrl?: string;
}

export interface EnrichedVideo extends RssVideo {
  liveNow: boolean;
  lengthSeconds: number;
  viewerCount?: number;
  actualStartTime?: string;
  actualEndTime?: string;
}

// ─── Policy ───────────────────────────────────────────────────────────────────

/** Policy for the RSS+API hybrid approach */
export const RSS_HYBRID_POLICY: UpstreamPolicy = {
  key: "youtube-rss-hybrid",
  ttlMs: 10 * 60_000,
  staleTtlMs: 60 * 60_000,
  timeoutMs: 9_000,
  maxRetries: 1,
  backoffBaseMs: 500,
  circuitFailureThreshold: 3,
  circuitOpenMs: 180_000,
  rateLimit: { capacity: 6, refillPerSec: 3, minIntervalMs: 200 },
};

/** Policy for the CCTV RSS+API hybrid (shorter TTL for live webcams) */
export const CCTV_HYBRID_POLICY: UpstreamPolicy = {
  key: "youtube-cctv-hybrid",
  ttlMs: 5 * 60_000,
  staleTtlMs: 15 * 60_000,
  timeoutMs: 9_000,
  maxRetries: 1,
  backoffBaseMs: 500,
  circuitFailureThreshold: 3,
  circuitOpenMs: 180_000,
  rateLimit: { capacity: 4, refillPerSec: 2, minIntervalMs: 300 },
};

// ─── RSS feed parsing ─────────────────────────────────────────────────────────

const YT_RSS_BASE = "https://www.youtube.com/feeds/videos.xml";

const XML = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  parseTagValue: false,
  processEntities: true,
});

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
  if (typeof record["@_url"] === "string") return record["@_url"].trim();
  return "";
}

function pickThumbnail(entry: Record<string, unknown>): string | undefined {
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
    return typeof record["@_url"] === "string" ? record["@_url"].trim() : undefined;
  }
  return undefined;
}

/**
 * Fetch recent video IDs from a channel's RSS feed (free, no quota).
 */
export async function fetchChannelRss(
  channelId: string,
  channelLabel: string,
  limit = 5,
  timeoutMs = 9_000
): Promise<RssVideo[]> {
  const rssUrl = `${YT_RSS_BASE}?channel_id=${encodeURIComponent(channelId)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(rssUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "WorldView/0.1 (youtube-rss-hybrid)",
        Accept: "application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`RSS ${channelId}: ${response.status}`);
    const xmlText = await response.text();
    const parsed = XML.parse(xmlText) as Record<string, unknown>;
    const feed = parsed.feed as Record<string, unknown> | undefined;
    const entries = toArray(
      feed?.entry as Record<string, unknown> | Record<string, unknown>[] | undefined
    ).slice(0, limit);

    const items: RssVideo[] = [];
    for (const entry of entries) {
      const videoId = readText(entry["yt:videoId"]);
      if (!videoId) continue;
      items.push({
        videoId,
        title: readText(entry.title) || "YouTube upload",
        channelId,
        channelName: channelLabel,
        publishedAt: readText(entry.published) || readText(entry.updated) || undefined,
        thumbnailUrl: pickThumbnail(entry),
      });
    }
    return items;
  } finally {
    clearTimeout(timer);
  }
}

// ─── YouTube videos.list (minimal quota) ──────────────────────────────────────

const YT_VIDEOS_BASE = "https://www.googleapis.com/youtube/v3/videos";

interface YtVideoItem {
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
  };
  liveStreamingDetails?: {
    actualStartTime?: string;
    actualEndTime?: string;
    scheduledStartTime?: string;
    concurrentViewers?: string;
  };
}

interface YtVideosResponse {
  items?: YtVideoItem[];
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Enrich RSS-discovered videos with live status via YouTube videos.list.
 * Cost: 1 quota unit per 50 videos. For 50 channels × 5 videos = 250 IDs = 5 units.
 *
 * If no API key is provided, returns videos without live enrichment (all marked as "recent").
 */
export async function enrichWithLiveStatus(
  rssVideos: RssVideo[],
  apiKey: string | undefined
): Promise<EnrichedVideo[]> {
  if (!apiKey || rssVideos.length === 0) {
    // No API key — return all as non-live
    return rssVideos.map((v) => ({
      ...v,
      liveNow: false,
      lengthSeconds: 0,
      viewerCount: undefined,
      actualStartTime: undefined,
      actualEndTime: undefined,
    }));
  }

  const uniqueIds = Array.from(new Set(rssVideos.map((v) => v.videoId)));
  const metaById = new Map<string, YtVideoItem>();

  // Batch into groups of 50 (1 quota unit each)
  for (const batch of chunk(uniqueIds, 50)) {
    const url = new URL(YT_VIDEOS_BASE);
    url.searchParams.set("part", "snippet,contentDetails,liveStreamingDetails");
    url.searchParams.set("id", batch.join(","));
    url.searchParams.set("key", apiKey);

    try {
      const resp = await fetchJsonOrThrow<YtVideosResponse>(
        url.toString(),
        { headers: { "User-Agent": "WorldView/0.1 (rss-hybrid-enrich)" } },
        9_000
      );
      for (const item of resp.items ?? []) {
        const id = item.id?.trim();
        if (id) metaById.set(id, item);
      }
    } catch (err) {
      console.error("[rss-hybrid] videos.list batch failed:", err instanceof Error ? err.message : String(err));
      // Continue — partial enrichment is better than none
    }
  }

  return rssVideos.map((rssVideo) => {
    const meta = metaById.get(rssVideo.videoId);
    if (!meta) {
      return {
        ...rssVideo,
        liveNow: false,
        lengthSeconds: 0,
      };
    }

    const broadcast = meta.snippet?.liveBroadcastContent?.toLowerCase();
    const liveMeta = meta.liveStreamingDetails;
    const liveNow = broadcast === "live" && !liveMeta?.actualEndTime;

    return {
      ...rssVideo,
      // Use API title/thumbnail if available (richer than RSS)
      title: meta.snippet?.title?.trim() || rssVideo.title,
      thumbnailUrl: meta.snippet?.thumbnails?.medium?.url || rssVideo.thumbnailUrl,
      liveNow,
      lengthSeconds: parseDurationSec(meta.contentDetails?.duration) ?? 0,
      viewerCount: liveMeta?.concurrentViewers
        ? Number(liveMeta.concurrentViewers) || undefined
        : undefined,
      actualStartTime: liveMeta?.actualStartTime,
      actualEndTime: liveMeta?.actualEndTime,
    };
  });
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Parse an ISO 8601 duration (e.g. "PT1H2M30S") to total seconds. */
function parseDurationSec(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return undefined;
  return (
    parseInt(m[1] || "0", 10) * 3600 +
    parseInt(m[2] || "0", 10) * 60 +
    parseInt(m[3] || "0", 10)
  );
}

/**
 * Get a YouTube CDN thumbnail URL (no API needed).
 */
export function youtubeThumbnailUrl(
  videoId: string,
  quality: "default" | "mqdefault" | "hqdefault" | "maxresdefault" = "mqdefault"
): string {
  return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
}

/**
 * Resolve a YouTube username to a channel ID via YouTube API.
 * Cost: 1 quota unit.
 */
export async function resolveUsername(
  username: string,
  apiKey: string | undefined
): Promise<string | null> {
  if (!apiKey) return null;
  try {
    const url = `https://www.googleapis.com/youtube/v3/channels?part=id&forUsername=${encodeURIComponent(username)}&key=${apiKey}`;
    const resp = await fetchJsonOrThrow<{ items?: Array<{ id?: string }> }>(
      url,
      { headers: { "User-Agent": "WorldView/0.1 (resolve-username)" } },
      5_000
    );
    return resp.items?.[0]?.id?.trim() ?? null;
  } catch {
    return null;
  }
}
