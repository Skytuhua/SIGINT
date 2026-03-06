"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { CctvCamera } from "../../../lib/providers/types";

interface CctvFeedViewProps {
  camera: CctvCamera;
  compact?: boolean;
  /** Fill the parent container 100% — for mosaic wall cells */
  mosaic?: boolean;
  onSnapshotError?: (cameraId: string) => void;
  onStreamError?: (cameraId: string) => void;
}

function getYoutubeIdFromUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.pathname.startsWith("/embed/")) {
      const parts = u.pathname.split("/");
      return parts[2] || null;
    }
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.slice(1).split("/")[0];
      return id || null;
    }
    const v = u.searchParams.get("v");
    return v || null;
  } catch {
    return null;
  }
}

function YoutubePlayer({
  iframeSrc,
  compact,
  mosaic,
  fallbackSnapshotUrl,
  onError,
}: {
  iframeSrc: string;
  compact?: boolean;
  mosaic?: boolean;
  fallbackSnapshotUrl?: string;
  onError?: () => void;
}) {
  const [error, setError] = useState(false);
  const height = mosaic ? "100%" : compact ? 220 : 320;

  if (error && fallbackSnapshotUrl) {
    return (
      <img
        src={fallbackSnapshotUrl}
        alt="Video thumbnail"
        style={{
          width: "100%",
          height,
          objectFit: "cover",
          background: "#000",
          borderRadius: mosaic ? 0 : 4,
          display: "block",
        }}
      />
    );
  }

  if (error) {
    return (
      <div className="wv-cctv-feed-error" style={{ height }}>
        <div className="wv-cctv-feed-error-icon" aria-hidden>!</div>
        <span>This live stream recording is not available.</span>
      </div>
    );
  }

  return (
    <iframe
      className="wv-cctv-feed-video"
      src={iframeSrc}
      title="YouTube video"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      style={{
        width: "100%",
        height,
        borderRadius: mosaic ? 0 : 4,
        border: "none",
        background: "#000",
        display: "block",
      }}
      onError={() => {
        setError(true);
        onError?.();
      }}
    />
  );
}

function HlsPlayer({
  url,
  compact,
  mosaic,
  onError,
}: {
  url: string;
  compact?: boolean;
  mosaic?: boolean;
  onError?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<{ destroy: () => void } | null>(null);
  const [error, setError] = useState(false);
  const notifiedRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: { destroy: () => void } | null = null;

    const init = async () => {
      try {
        const Hls = (await import("hls.js")).default;
        if (!Hls.isSupported()) {
          video.src = url;
          return;
        }
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          maxBufferLength: 10,
          maxMaxBufferLength: 20,
        });
        (hls as unknown as { loadSource: (u: string) => void }).loadSource(url);
        (hls as unknown as { attachMedia: (v: HTMLVideoElement) => void }).attachMedia(video);
        (hls as unknown as { on: (e: string, cb: () => void) => void }).on(
          "hlsManifestParsed" as string,
          () => { video.play().catch(() => {}); },
        );
        (hls as unknown as { on: (e: string, cb: () => void) => void }).on(
          "hlsError" as string,
          () => {
            setError(true);
            if (!notifiedRef.current) {
              notifiedRef.current = true;
              onError?.();
            }
          },
        );
        hlsRef.current = hls;
      } catch {
        setError(true);
        if (!notifiedRef.current) {
          notifiedRef.current = true;
          onError?.();
        }
      }
    };

    void init();

    return () => {
      hls?.destroy();
      hlsRef.current = null;
    };
  }, [url]);

  if (error) {
    return (
      <div className="wv-cctv-feed-error">
        Stream unavailable
      </div>
    );
  }

  const height = mosaic ? "100%" : compact ? 220 : 320;
  return (
    <video
      ref={videoRef}
      className="wv-cctv-feed-video"
      muted
      autoPlay
      playsInline
      controls
      style={{
        width: "100%",
        height,
        objectFit: "contain",
        background: "#000",
        borderRadius: mosaic ? 0 : 4,
      }}
    />
  );
}

function SnapshotViewer({
  url,
  refreshSeconds,
  compact,
  onError,
}: {
  url: string;
  refreshSeconds: number;
  compact?: boolean;
  onError?: () => void;
}) {
  const [src, setSrc] = useState(url);
  const [error, setError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const notifiedRef = useRef(false);

  const refresh = useCallback(() => {
    const sep = url.includes("?") ? "&" : "?";
    setSrc(`${url}${sep}_t=${Date.now()}`);
  }, [url]);

  useEffect(() => {
    refresh();
    timerRef.current = setInterval(refresh, refreshSeconds * 1000);
    return () => clearInterval(timerRef.current);
  }, [refresh, refreshSeconds]);

  if (error) {
    return (
      <div className="wv-cctv-feed-error">
        Snapshot unavailable
      </div>
    );
  }

  return (
    <img
      src={src}
      alt="CCTV snapshot"
      onError={() => {
        setError(true);
        if (!notifiedRef.current) {
          notifiedRef.current = true;
          onError?.();
        }
      }}
      style={{
        width: "100%",
        height: compact ? 220 : 320,
        objectFit: "contain",
        background: "#000",
        borderRadius: 4,
        display: "block",
      }}
    />
  );
}

export default function CctvFeedView({
  camera,
  compact,
  mosaic,
  onSnapshotError,
  onStreamError,
}: CctvFeedViewProps) {
  const format = camera.streamFormat ?? "UNKNOWN";
  const streamUrl = camera.streamUrl ?? camera.snapshotUrl;

  if (format === "YOUTUBE" && streamUrl) {
    // If it's already an embed URL, use it directly; otherwise extract the video ID and construct embed URL
    let iframeSrc = streamUrl;
    if (!streamUrl.includes("/embed/")) {
      const videoId = getYoutubeIdFromUrl(streamUrl);
      if (videoId) {
        iframeSrc = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&playsinline=1&rel=0`;
      }
    }
    return (
      <YoutubePlayer
        iframeSrc={iframeSrc}
        compact={compact}
        mosaic={mosaic}
        fallbackSnapshotUrl={camera.snapshotUrl || undefined}
        onError={() => onStreamError?.(camera.id)}
      />
    );
  }

  if (format === "M3U8" && streamUrl) {
    return (
      <HlsPlayer
        url={streamUrl}
        compact={compact}
        mosaic={mosaic}
        onError={() => onStreamError?.(camera.id)}
      />
    );
  }

  if (
    (streamUrl || camera.snapshotUrl) &&
    (format === "JPEG" || format === "IMAGE_STREAM" || camera.snapshotUrl)
  ) {
    const imgUrl =
      format === "JPEG" || format === "IMAGE_STREAM"
        ? streamUrl!
        : camera.snapshotUrl ?? streamUrl!;
    return (
      <SnapshotViewer
        url={imgUrl}
        refreshSeconds={camera.refreshSeconds ?? 30}
        compact={compact}
        onError={() => onSnapshotError?.(camera.id)}
      />
    );
  }

  return (
    <div className="wv-cctv-feed-error">
      No feed available
    </div>
  );
}
