"use client";

import { useMemo } from "react";
import { NEWS_VIDEO_CHANNELS } from "../../config/newsConfig";
import type { VideoPanelCategory } from "../../lib/news/types";
import type { YouTubeLive } from "../../lib/news/types";
import Panel from "../dashboard/panel/Panel";
import PanelBody from "../dashboard/panel/PanelBody";
import PanelControls from "../dashboard/panel/PanelControls";
import PanelFooter from "../dashboard/panel/PanelFooter";
import PanelHeader from "../dashboard/panel/PanelHeader";

interface LiveVideoPanelProps {
  panelId: string;
  title: string;
  subtitle: string;
  category: VideoPanelCategory;
  liveStreams: YouTubeLive[];
  panelState: {
    selectedVideoId: string | null;
    selectedChannelFilter: string | null;
    manualUrl: string;
  };
  setPanelState: (partial: { selectedVideoId?: string | null; selectedChannelFilter?: string | null; manualUrl?: string }) => void;
  lockHeaderProps: { locked: boolean; onToggleLock: () => void };
  onRefresh: () => void;
  loading: boolean;
  videoKeyMissing: boolean;
  discoverySource: "youtube-data-api" | "youtube-rss";
  fallbackActive: boolean;
  backendHealth: string;
  liveCount: number;
  totalCount: number;
}

const CATEGORY_CHANNEL_IDS = new Map<VideoPanelCategory, Set<string>>();
for (const ch of NEWS_VIDEO_CHANNELS) {
  const cats = ch.categories ?? ["general"];
  for (const cat of cats) {
    if (!CATEGORY_CHANNEL_IDS.has(cat)) CATEGORY_CHANNEL_IDS.set(cat, new Set());
    CATEGORY_CHANNEL_IDS.get(cat)!.add(ch.channelId);
  }
}

export default function LiveVideoPanel({
  panelId,
  title,
  subtitle,
  category,
  liveStreams,
  panelState,
  setPanelState,
  lockHeaderProps,
  onRefresh,
  loading,
  videoKeyMissing,
  discoverySource,
  fallbackActive,
  backendHealth,
  liveCount,
  totalCount,
}: LiveVideoPanelProps) {
  const channelIds = CATEGORY_CHANNEL_IDS.get(category) ?? new Set<string>();

  const filteredStreams = useMemo(() => {
    return liveStreams.filter((s) => channelIds.has(s.channelId));
  }, [liveStreams, channelIds]);

  const byChannel = useMemo(() => {
    const map = new Map<string, { channelId: string; channelName: string; liveCount: number; recentCount: number }>();
    for (const item of filteredStreams) {
      const prev = map.get(item.channelId) ?? {
        channelId: item.channelId,
        channelName: item.channelName,
        liveCount: 0,
        recentCount: 0,
      };
      if (item.status === "live") prev.liveCount += 1;
      else prev.recentCount += 1;
      map.set(item.channelId, prev);
    }
    return Array.from(map.values()).sort((a, b) => {
      const aW = a.liveCount * 100 + a.recentCount;
      const bW = b.liveCount * 100 + b.recentCount;
      return bW - aW || a.channelName.localeCompare(b.channelName);
    });
  }, [filteredStreams]);

  const channelFiltered = useMemo(() => {
    const hasSelectedChannel =
      !!panelState.selectedChannelFilter &&
      byChannel.some((entry) => entry.channelId === panelState.selectedChannelFilter);
    if (!hasSelectedChannel) return filteredStreams;
    return filteredStreams.filter((s) => s.channelId === panelState.selectedChannelFilter);
  }, [byChannel, filteredStreams, panelState.selectedChannelFilter]);

  const tabItems = useMemo(() => {
    const ordered = [...channelFiltered].sort((a, b) => {
      if (a.status !== b.status) return a.status === "live" ? -1 : 1;
      const aViewers = a.viewerCount ?? -1;
      const bViewers = b.viewerCount ?? -1;
      if (a.status === "live" && b.status === "live" && aViewers !== bViewers) return bViewers - aViewers;
      const aTs = Date.parse(a.publishedAt ?? "");
      const bTs = Date.parse(b.publishedAt ?? "");
      if (Number.isFinite(aTs) && Number.isFinite(bTs)) return bTs - aTs;
      return 0;
    });
    const seenVideoIds = new Set<string>();
    const byCh = new Map<string, YouTubeLive>();
    for (const s of ordered) {
      const videoKey = s.videoId.toLowerCase();
      if (seenVideoIds.has(videoKey)) continue;
      seenVideoIds.add(videoKey);
      if (!byCh.has(s.channelId)) byCh.set(s.channelId, s);
    }
    return Array.from(byCh.values()).slice(0, 12);
  }, [channelFiltered]);

  const manualVideoId = parseVideoId(panelState.manualUrl);
  const selectedVideoInCategory =
    !!panelState.selectedVideoId &&
    filteredStreams.some((stream) => stream.videoId === panelState.selectedVideoId);
  const displayVideoId =
    manualVideoId ??
    (selectedVideoInCategory ? panelState.selectedVideoId : tabItems[0]?.videoId ?? null);

  return (
    <Panel panelId={panelId} workspace="news">
      <PanelHeader
        title={title}
        subtitle={subtitle}
        {...lockHeaderProps}
        controls={<PanelControls onRefresh={onRefresh} loading={loading} refreshText="LIVE" />}
      />
      <PanelBody className="wv-news-video-body">
        {displayVideoId ? (
          <iframe
            className="wv-news-video-frame"
            src={`https://www.youtube.com/embed/${displayVideoId}?autoplay=1&mute=1&playsinline=1&rel=0`}
            title={`${title} - Live stream`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="wv-news-empty">
            {videoKeyMissing
              ? "YOUTUBE_API_KEY missing. Showing RSS uploads when available, or paste a YouTube URL below."
              : fallbackActive
                ? "YouTube Data API unavailable. Showing RSS uploads when available, or paste a URL."
                : totalCount > 0
                ? "No streams matched this category. Try a different Source or paste a URL."
                : "No YouTube streams discovered yet. Check API key or paste a YouTube URL to play manually."}
          </div>
        )}
        <div className="wv-news-video-controls-row">
          <div className="wv-news-video-channel-filter">
            <label htmlFor={`${panelId}-channel-filter`}>Source</label>
            <select
              id={`${panelId}-channel-filter`}
              value={panelState.selectedChannelFilter ?? ""}
              onChange={(e) =>
                setPanelState({
                  selectedChannelFilter: e.target.value || null,
                  // When the source changes, clear any previous selection so the panel
                  // immediately snaps to the top stream for the newly chosen source.
                  selectedVideoId: null,
                })
              }
            >
              <option value="">All sources</option>
              {byChannel.map((ch) => (
                <option key={ch.channelId} value={ch.channelId}>
                  {ch.channelName} ({ch.liveCount ? `LIVE ${ch.liveCount}` : `RECENT ${ch.recentCount}`})
                </option>
              ))}
            </select>
          </div>
          <div className="wv-news-video-manual">
            <input
              value={panelState.manualUrl}
              placeholder="Paste YouTube URL or ID"
              onChange={(e) => setPanelState({ manualUrl: e.target.value })}
            />
          </div>
        </div>
        <div className="wv-news-video-tabs" role="tablist" aria-label={`${title} sources`}>
          {tabItems.map((stream) => (
            <button
              key={`${stream.channelId}-${stream.videoId}`}
              type="button"
              role="tab"
              aria-selected={displayVideoId === stream.videoId}
              className={displayVideoId === stream.videoId ? "is-active" : ""}
              onClick={() => setPanelState({ selectedVideoId: stream.videoId, manualUrl: "" })}
            >
              <span>{stream.channelName}</span>
              <span className={`wv-tab-state ${stream.status === "live" ? "is-live" : "is-recent"}`}>
                {stream.status === "live" ? "LIVE" : "RECENT"}
              </span>
            </button>
          ))}
          {!tabItems.length ? (
            <div className="wv-news-empty">No streams for this category.</div>
          ) : null}
        </div>
      </PanelBody>
      <PanelFooter
        source="YOUTUBE"
        updatedAt={Date.now()}
        health={videoKeyMissing || fallbackActive || backendHealth === "degraded" ? "stale" : "ok"}
        message={
          videoKeyMissing
            ? "YOUTUBE_API_KEY missing. Using RSS fallback."
            : fallbackActive
              ? `API unavailable. Showing recent uploads from ${discoverySource === "youtube-rss" ? "RSS" : "fallback"}.`
              : `${liveCount} live / ${totalCount} total (${filteredStreams.length} in category)`
        }
      />
    </Panel>
  );
}

function parseVideoId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.replace("/", "").trim();
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (url.hostname.includes("youtube.com")) {
      const id = url.searchParams.get("v")?.trim();
      if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return id;
    }
  } catch {
    return null;
  }
  return null;
}
