import type { CctvCamera, CctvRegion } from "../../providers/types";
import { WEBCAM_SEARCH_QUERIES, WEBCAM_VIDEO_CHANNELS } from "../../../config/cctvConfig";
import {
  cachedFetch,
  fetchJsonOrThrow,
  type CachedFetchResult,
  type UpstreamPolicy,
} from "../news/upstream";

const YT_SEARCH_BASE = "https://www.googleapis.com/youtube/v3/search";
const YT_VIDEOS_BASE = "https://www.googleapis.com/youtube/v3/videos";
const YT_CHANNELS_BASE = "https://www.googleapis.com/youtube/v3/channels";
const YT_PLAYLIST_ITEMS_BASE = "https://www.googleapis.com/youtube/v3/playlistItems";
const YT_RSS_BASE = "https://www.youtube.com/feeds/videos.xml";

const SEARCH_API_POLICY: UpstreamPolicy = {
  key: "youtube-webcam-search",
  ttlMs: 5 * 60_000, // 5 min fresh, reduce API usage
  staleTtlMs: 15 * 60_000,
  timeoutMs: 12_000,
  maxRetries: 1,
  backoffBaseMs: 650,
  circuitFailureThreshold: 3,
  circuitOpenMs: 180_000,
  rateLimit: { capacity: 6, refillPerSec: 1, minIntervalMs: 500 },
};

const RSS_FALLBACK_POLICY: UpstreamPolicy = {
  key: "youtube-webcam-rss",
  ttlMs: 15 * 60_000,
  staleTtlMs: 120 * 60_000,
  timeoutMs: 9_000,
  maxRetries: 1,
  backoffBaseMs: 450,
  circuitFailureThreshold: 3,
  circuitOpenMs: 180_000,
  rateLimit: { capacity: 4, refillPerSec: 3, minIntervalMs: 220 },
};

interface YtSearchResponse {
  items?: Array<{
    id?: { videoId?: string };
    snippet?: {
      channelId?: string;
      channelTitle?: string;
      title?: string;
      publishedAt?: string;
      thumbnails?: { medium?: { url?: string }; high?: { url?: string } };
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
      thumbnails?: { medium?: { url?: string }; high?: { url?: string } };
    };
    liveStreamingDetails?: {
      actualStartTime?: string;
      actualEndTime?: string;
      concurrentViewers?: string;
    };
  }>;
}

interface YtChannelsResponse {
  items?: Array<{
    id?: string;
    contentDetails?: {
      relatedPlaylists?: { uploads?: string };
    };
  }>;
}

interface YtPlaylistItemsResponse {
  items?: Array<{
    contentDetails?: { videoId?: string };
    snippet?: {
      channelId?: string;
      channelTitle?: string;
      title?: string;
      thumbnails?: { medium?: { url?: string } };
    };
  }>;
}

export interface YouTubeWebcamResult {
  cameras: CctvCamera[];
  liveCount: number;
  discoverySource: "search" | "channels" | "rss";
  keyMissing?: boolean;
}

const CHANNEL_LOCATION_OVERRIDES: Record<
  string,
  { city: string; state?: string; lat: number; lon: number; region: CctvRegion }
> = {
  // Webcam / city-cam providers — expand as channels are added
};

const TITLE_CITY_PATTERNS: Array<{ pattern: RegExp; city: string; lat: number; lon: number; region: CctvRegion }> = [
  { pattern: /times\s*square|new\s*york|nyc|manhattan/i, city: "New York", lat: 40.758, lon: -73.9855, region: "americas" },
  { pattern: /london/i, city: "London", lat: 51.5074, lon: -0.1278, region: "europe" },
  { pattern: /dubai/i, city: "Dubai", lat: 25.0803, lon: 55.1403, region: "mideast" },
  { pattern: /tokyo|shibuya/i, city: "Tokyo", lat: 35.6595, lon: 139.7005, region: "asia" },
  { pattern: /seoul/i, city: "Seoul", lat: 37.5665, lon: 126.978, region: "asia" },
  { pattern: /singapore|marina\s*bay/i, city: "Singapore", lat: 1.2833, lon: 103.8607, region: "asia" },
  { pattern: /hong\s*kong/i, city: "Hong Kong", lat: 22.2783, lon: 114.1747, region: "asia" },
  { pattern: /sydney/i, city: "Sydney", lat: -33.8523, lon: 151.2108, region: "asia" },
  { pattern: /rio|copacabana/i, city: "Rio de Janeiro", lat: -22.9711, lon: -43.1822, region: "americas" },
  { pattern: /san\s*francisco|sf\s*skyline/i, city: "San Francisco", lat: 37.7943, lon: -122.3994, region: "americas" },
  { pattern: /paris/i, city: "Paris", lat: 48.8566, lon: 2.3522, region: "europe" },
  { pattern: /berlin/i, city: "Berlin", lat: 52.52, lon: 13.405, region: "europe" },
  { pattern: /amsterdam/i, city: "Amsterdam", lat: 52.3676, lon: 4.9041, region: "europe" },
  { pattern: /beach|ocean/i, city: "Coast", lat: 0, lon: 0, region: "americas" },
];

function inferLocation(title: string, channelTitle: string, channelId: string): {
  city: string;
  lat: number;
  lon: number;
  region: CctvRegion;
} {
  const override = CHANNEL_LOCATION_OVERRIDES[channelId];
  if (override) return override;

  const text = `${title} ${channelTitle}`.toLowerCase();
  for (const { pattern, city, lat, lon, region } of TITLE_CITY_PATTERNS) {
    if (pattern.test(text)) return { city, lat, lon, region };
  }

  return { city: channelTitle || "Live", lat: 0, lon: 0, region: "americas" };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

interface CandidateVideo {
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  thumbnailUrl?: string;
}

function uniqueByVideoId<T extends { videoId: string }>(videos: T[]): T[] {
  const seen = new Set<string>();
  return videos.filter((v) => {
    const id = v.videoId?.toLowerCase();
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

async function searchLiveWebcams(apiKey: string): Promise<CctvCamera[]> {
  const allCandidates: CandidateVideo[] = [];

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const queries = WEBCAM_SEARCH_QUERIES.slice(0, 6);
  for (let i = 0; i < queries.length; i++) {
    if (i > 0) await sleep(350); // space out API calls to avoid rate limits
    const q = queries[i];
    const url = new URL(YT_SEARCH_BASE);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("q", q);
    url.searchParams.set("type", "video");
    url.searchParams.set("eventType", "live");
    url.searchParams.set("maxResults", "5");
    url.searchParams.set("order", "viewCount");
    url.searchParams.set("key", apiKey);

    try {
      const resp = await fetchJsonOrThrow<YtSearchResponse>(
        url.toString(),
        { headers: { "User-Agent": "WorldView/0.1 (cctv-webcam-search)" } },
        SEARCH_API_POLICY.timeoutMs
      );

      for (const item of resp.items ?? []) {
        const videoId = item.id?.videoId?.trim();
        const snippet = item.snippet;
        if (!videoId || !snippet) continue;
        allCandidates.push({
          videoId,
          channelId: snippet.channelId?.trim() ?? "",
          channelTitle: snippet.channelTitle?.trim() ?? "",
          title: snippet.title?.trim() ?? "Live",
          thumbnailUrl: snippet.thumbnails?.high?.url ?? snippet.thumbnails?.medium?.url,
        });
      }
    } catch {
      // Skip failed query, continue with others
    }
  }

  const deduped = uniqueByVideoId(allCandidates);
  if (deduped.length === 0) return [];

  const videoIds = deduped.map((c) => c.videoId);
  const metaById = new Map<string, CandidateVideo & { isLive?: boolean }>();

  for (const batch of chunk(videoIds, 50)) {
    const videosUrl = new URL(YT_VIDEOS_BASE);
    videosUrl.searchParams.set("part", "snippet,liveStreamingDetails");
    videosUrl.searchParams.set("id", batch.join(","));
    videosUrl.searchParams.set("key", apiKey);

    try {
      const resp = await fetchJsonOrThrow<YtVideosResponse>(
        videosUrl.toString(),
        { headers: { "User-Agent": "WorldView/0.1 (cctv-webcam-videos)" } },
        SEARCH_API_POLICY.timeoutMs
      );

      for (const v of resp.items ?? []) {
        const id = v.id?.trim();
        if (!id) continue;
        const snippet = v.snippet;
        const liveDetails = v.liveStreamingDetails;
        const isLive =
          snippet?.liveBroadcastContent?.toLowerCase() === "live" &&
          !liveDetails?.actualEndTime;

        const cand = deduped.find((c) => c.videoId === id);
        if (cand) {
          metaById.set(id, { ...cand, isLive });
        }
      }
    } catch {
      // Use raw candidates without live filter
      for (const c of deduped) {
        metaById.set(c.videoId, { ...c, isLive: true });
      }
    }
  }

  const cameras: CctvCamera[] = [];
  for (const cand of deduped) {
    const meta = metaById.get(cand.videoId) ?? cand;
    const loc = inferLocation(meta.title, meta.channelTitle, meta.channelId);
    cameras.push({
      id: `yt_live_${meta.videoId}`,
      city: loc.city,
      name: meta.title || `${meta.channelTitle} Live`,
      lat: loc.lat,
      lon: loc.lon,
      snapshotUrl: meta.thumbnailUrl ?? `https://img.youtube.com/vi/${meta.videoId}/hqdefault.jpg`,
      refreshSeconds: 60,
      streamUrl: `https://www.youtube.com/embed/${meta.videoId}?autoplay=1&mute=1&playsinline=1&rel=0`,
      streamFormat: "YOUTUBE",
      region: loc.region,
    });
  }

  return cameras;
}

async function discoverFromChannels(apiKey: string): Promise<CctvCamera[]> {
  if (WEBCAM_VIDEO_CHANNELS.length === 0) return [];

  const channelIds = WEBCAM_VIDEO_CHANNELS.map((c) => c.channelId);
  const channelLabelById = new Map(WEBCAM_VIDEO_CHANNELS.map((c) => [c.channelId, c.label]));
  const regionByChannel = new Map(WEBCAM_VIDEO_CHANNELS.map((c) => [c.channelId, c.region]));

  const channelsUrl = new URL(YT_CHANNELS_BASE);
  channelsUrl.searchParams.set("part", "contentDetails");
  channelsUrl.searchParams.set("id", channelIds.join(","));
  channelsUrl.searchParams.set("key", apiKey);

  const channelsResp = await fetchJsonOrThrow<YtChannelsResponse>(
    channelsUrl.toString(),
    { headers: { "User-Agent": "WorldView/0.1 (cctv-webcam-channels)" } },
    SEARCH_API_POLICY.timeoutMs
  );

  const uploadsByChannel = new Map<string, string>();
  for (const item of channelsResp.items ?? []) {
    const cid = item.id?.trim();
    const uploadsId = item.contentDetails?.relatedPlaylists?.uploads?.trim();
    if (cid && uploadsId) uploadsByChannel.set(cid, uploadsId);
  }

  const candidates: Array<{
    videoId: string;
    channelId: string;
    channelTitle: string;
    title: string;
    thumbnailUrl?: string;
  }> = [];

  for (const ch of WEBCAM_VIDEO_CHANNELS) {
    const uploadsId = uploadsByChannel.get(ch.channelId);
    if (!uploadsId) continue;

    const playlistUrl = new URL(YT_PLAYLIST_ITEMS_BASE);
    playlistUrl.searchParams.set("part", "snippet,contentDetails");
    playlistUrl.searchParams.set("playlistId", uploadsId);
    playlistUrl.searchParams.set("maxResults", "3");
    playlistUrl.searchParams.set("key", apiKey);

    try {
      const resp = await fetchJsonOrThrow<YtPlaylistItemsResponse>(
        playlistUrl.toString(),
        { headers: { "User-Agent": "WorldView/0.1 (cctv-webcam-playlist)" } },
        SEARCH_API_POLICY.timeoutMs
      );

      for (const row of resp.items ?? []) {
        const videoId = row.contentDetails?.videoId?.trim();
        if (!videoId) continue;
        const snippet = row.snippet;
        candidates.push({
          videoId,
          channelId: ch.channelId,
          channelTitle: channelLabelById.get(ch.channelId) ?? snippet?.channelTitle ?? ch.label,
          title: snippet?.title?.trim() ?? "Live",
          thumbnailUrl: snippet?.thumbnails?.medium?.url,
        });
      }
    } catch {
      // Skip failed channel
    }
  }

  const deduped = uniqueByVideoId(candidates);
  const regionMap: Record<string, CctvRegion> = {
    americas: "americas",
    europe: "europe",
    asia: "asia",
    mideast: "mideast",
  };

  return deduped.map((c) => {
    const loc = inferLocation(c.title, c.channelTitle, c.channelId);
    const region = regionMap[regionByChannel.get(c.channelId) ?? "americas"] ?? "americas";
    return {
      id: `yt_live_${c.videoId}`,
      city: loc.city,
      name: c.title || `${c.channelTitle} Live`,
      lat: loc.lat,
      lon: loc.lon,
      snapshotUrl: c.thumbnailUrl ?? `https://img.youtube.com/vi/${c.videoId}/hqdefault.jpg`,
      refreshSeconds: 60,
      streamUrl: `https://www.youtube.com/embed/${c.videoId}?autoplay=1&mute=1&playsinline=1&rel=0`,
      streamFormat: "YOUTUBE" as const,
      region,
    };
  });
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
  return "";
}

function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

const XML_PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  parseTagValue: false,
  processEntities: true,
};

async function discoverFromRss(): Promise<CctvCamera[]> {
  const { XMLParser } = await import("fast-xml-parser");
  const XML = new XMLParser(XML_PARSER_OPTIONS);

  const allItems: Array<{
    videoId: string;
    channelId: string;
    channelTitle: string;
    title: string;
    thumbnailUrl?: string;
  }> = [];

  for (const ch of WEBCAM_VIDEO_CHANNELS) {
    const rssUrl = `${YT_RSS_BASE}?channel_id=${encodeURIComponent(ch.channelId)}`;
    try {
      const resp = await fetch(rssUrl, {
        headers: {
          "User-Agent": "WorldView/0.1 (cctv-webcam-rss)",
          Accept: "application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        },
        cache: "no-store",
      });
      if (!resp.ok) continue;

      const xmlText = await resp.text();
      const parsed = XML.parse(xmlText) as Record<string, unknown>;
      const feed = parsed.feed as Record<string, unknown> | undefined;
      const entries = toArray(feed?.entry as Record<string, unknown> | Record<string, unknown>[] | undefined).slice(0, 3);
      for (const entry of entries) {
        const videoId = readText(entry["yt:videoId"]);
        if (!videoId) continue;
        const title = readText(entry.title) || "Live";
        const mediaGroup = entry["media:group"] as Record<string, unknown> | undefined;
        const thumb = mediaGroup?.["media:thumbnail"];
        const thumbnailUrl = thumb ? readText(thumb) || (thumb as Record<string, string>)["@_url"] : undefined;

        allItems.push({
          videoId,
          channelId: ch.channelId,
          channelTitle: ch.label,
          title,
          thumbnailUrl: thumbnailUrl || undefined,
        });
      }
    } catch {
      // Skip failed channel
    }
  }

  const deduped = uniqueByVideoId(allItems);
  return deduped.map((c) => {
    const loc = inferLocation(c.title, c.channelTitle, c.channelId);
    return {
      id: `yt_live_${c.videoId}`,
      city: loc.city,
      name: c.title || `${c.channelTitle} Live`,
      lat: loc.lat,
      lon: loc.lon,
      snapshotUrl: c.thumbnailUrl ?? `https://img.youtube.com/vi/${c.videoId}/hqdefault.jpg`,
      refreshSeconds: 60,
      streamUrl: `https://www.youtube.com/embed/${c.videoId}?autoplay=1&mute=1&playsinline=1&rel=0`,
      streamFormat: "YOUTUBE" as const,
      region: loc.region,
    };
  });
}

export async function discoverYouTubeLiveWebcams(
  apiKey: string | undefined
): Promise<CachedFetchResult<YouTubeWebcamResult>> {
  const cacheKey = `webcams:${apiKey ? "key" : "nokey"}`;

  return cachedFetch({
    cacheKey,
    policy: SEARCH_API_POLICY,
    fallbackValue: {
      cameras: [],
      liveCount: 0,
      discoverySource: "rss",
      keyMissing: !apiKey,
    },
    request: async () => {
      if (!apiKey) {
        const cameras = await discoverFromRss();
        return {
          cameras,
          liveCount: 0,
          discoverySource: "rss",
          keyMissing: true,
        };
      }

      const searchCameras = await searchLiveWebcams(apiKey);

      if (searchCameras.length >= 4) {
        return {
          cameras: searchCameras.slice(0, 24),
          liveCount: searchCameras.length,
          discoverySource: "search",
          keyMissing: false,
        };
      }

      const channelCameras = await discoverFromChannels(apiKey);
      if (channelCameras.length > 0) {
        const combined = [...searchCameras];
        const seen = new Set(searchCameras.map((c) => c.id));
        for (const c of channelCameras) {
          if (!seen.has(c.id)) {
            combined.push(c);
            seen.add(c.id);
          }
        }
        return {
          cameras: combined.slice(0, 24),
          liveCount: combined.length,
          discoverySource: "channels",
          keyMissing: false,
        };
      }

      if (searchCameras.length > 0) {
        return {
          cameras: searchCameras.slice(0, 24),
          liveCount: searchCameras.length,
          discoverySource: "search",
          keyMissing: false,
        };
      }

      const rssCameras = await discoverFromRss();
      return {
        cameras: rssCameras.slice(0, 24),
        liveCount: 0,
        discoverySource: "rss",
        keyMissing: false,
      };
    },
  });
}
