// CCTV / Live Webcams configuration — curated YouTube channels and search terms.
// This file is safe to import client-side (no secrets).

export interface WebcamChannel {
  channelId: string;
  label: string;
  region: "americas" | "europe" | "asia" | "mideast";
}

/** Curated YouTube channels known to host 24/7 city/skyline webcam streams. Fallback when search returns few results. */
export const WEBCAM_VIDEO_CHANNELS: WebcamChannel[] = [
  // Add channel IDs for EarthCam, SkylineWebcams, etc. when available.
];

/** Search queries for discovering live webcam streams via YouTube search.list (eventType=live). */
export const WEBCAM_SEARCH_QUERIES = [
  "city live webcam",
  "skyline live",
  "24/7 live cam",
  "beach live cam",
  "Times Square live",
  "Dubai live",
  "Tokyo live cam",
  "London live webcam",
];
