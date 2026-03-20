// CCTV / Live Webcams configuration — curated YouTube channels and search terms.
// This file is safe to import client-side (no secrets).

// Consolidated — single source of truth lives in webcamConfig.ts
export type { WebcamChannel } from "./webcamConfig";
export { WEBCAM_VIDEO_CHANNELS } from "./webcamConfig";

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
