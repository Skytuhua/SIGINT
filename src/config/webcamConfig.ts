// Webcam / live cam channel config for the Live Webcams panel.
// Uses actual YouTube webcam channels (EarthCam, SkylineWebcams, Explore.org, etc.)
// instead of news channels. Safe to import client-side (no secrets).

export interface WebcamChannel {
  /** Known channel ID (UC...). Use when available. */
  channelId?: string;
  /** Legacy username for runtime resolution via YouTube API when channelId is missing. */
  forUsername?: string;
  label: string;
  priority: number;
  /** Maps to CctvRegion: americas | europe | asia | mideast */
  region: "americas" | "europe" | "asia" | "mideast";
}

export const WEBCAM_VIDEO_CHANNELS: WebcamChannel[] = [
  // Resolved channel IDs
  {
    channelId: "UC8NnosPOvXnm0O1u5YnLQiw",
    label: "Explore Birds Bats Bees",
    priority: 90,
    region: "americas",
  },
  {
    channelId: "UCrtIIVfi-5tMlVXdMDzOMUA",
    label: "StreamTime LIVE",
    priority: 85,
    region: "americas",
  },
  // Resolved at runtime via forUsername when YOUTUBE_API_KEY is set
  {
    forUsername: "earthcam",
    label: "EarthCam",
    priority: 95,
    region: "americas",
  },
  {
    forUsername: "SkylineWebcams",
    label: "SkylineWebcams",
    priority: 88,
    region: "europe",
  },
];
