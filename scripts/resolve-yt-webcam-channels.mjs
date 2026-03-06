#!/usr/bin/env node
/**
 * Resolves YouTube channel IDs from usernames. Run with:
 *   YOUTUBE_API_KEY=xxx node scripts/resolve-yt-webcam-channels.mjs
 * Outputs channel IDs for use in webcamConfig.
 */
const API_KEY = process.env.YOUTUBE_API_KEY;
const USERNAMES = ["earthcam", "SkylineWebcams"];

if (!API_KEY) {
  console.error("Set YOUTUBE_API_KEY env var");
  process.exit(1);
}

for (const username of USERNAMES) {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=id,snippet&forUsername=${encodeURIComponent(username)}&key=${API_KEY}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    const item = data.items?.[0];
    if (item) {
      console.log(`${username}: ${item.id} (${item.snippet?.title ?? "?"})`);
    } else {
      console.log(`${username}: NOT FOUND`);
    }
  } catch (e) {
    console.error(`${username}: ${e.message}`);
  }
}
