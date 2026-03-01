"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { CctvCamera } from "../../../lib/providers/types";

interface CctvFeedViewProps {
  camera: CctvCamera;
  compact?: boolean;
}

function HlsPlayer({ url, compact }: { url: string; compact?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<{ destroy: () => void } | null>(null);
  const [error, setError] = useState(false);

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
          () => setError(true),
        );
        hlsRef.current = hls;
      } catch {
        setError(true);
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
        height: compact ? 160 : 240,
        objectFit: "contain",
        background: "#000",
        borderRadius: 4,
      }}
    />
  );
}

function SnapshotViewer({
  url,
  refreshSeconds,
  compact,
}: {
  url: string;
  refreshSeconds: number;
  compact?: boolean;
}) {
  const [src, setSrc] = useState(url);
  const [error, setError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

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
      onError={() => setError(true)}
      style={{
        width: "100%",
        height: compact ? 160 : 240,
        objectFit: "contain",
        background: "#000",
        borderRadius: 4,
        display: "block",
      }}
    />
  );
}

export default function CctvFeedView({ camera, compact }: CctvFeedViewProps) {
  const format = camera.streamFormat ?? "UNKNOWN";
  const streamUrl = camera.streamUrl ?? camera.snapshotUrl;

  if (format === "M3U8" && streamUrl) {
    return <HlsPlayer url={streamUrl} compact={compact} />;
  }

  if (streamUrl && (format === "JPEG" || format === "IMAGE_STREAM" || camera.snapshotUrl)) {
    const imgUrl = format === "JPEG" || format === "IMAGE_STREAM" ? streamUrl : camera.snapshotUrl;
    return (
      <SnapshotViewer
        url={imgUrl}
        refreshSeconds={camera.refreshSeconds ?? 30}
        compact={compact}
      />
    );
  }

  return (
    <div className="wv-cctv-feed-error">
      No feed available
    </div>
  );
}
