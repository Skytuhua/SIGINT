export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import type { CctvCamera } from "../../../../lib/providers/types";
import { isBlockedHost } from "../../../../lib/server/ssrf";

const OTC_USA_URL =
  "https://raw.githubusercontent.com/AidanWelch/OpenTrafficCamMap/master/cameras/USA.json";

const VALIDATE_TIMEOUT_MS = 4_000;
const VALIDATE_BATCH_SIZE = 10;
const SAMPLE_SIZE = 60; // validate this many cameras per refresh
const TTL_MS = 15 * 60 * 1000; // 15-minute cache

interface OtcCamera {
  description?: string;
  latitude: number;
  longitude: number;
  direction?: string;
  url: string;
  encoding?: string;
  format?: string;
}

type OtcData = Record<string, Record<string, OtcCamera[]>>;

let cache: { data: CctvCamera[]; expires: number } | null = null;

/** Only keep cameras with HTTPS URLs that look like direct image feeds. */
function isLikelyImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;

    const path = parsed.pathname.toLowerCase();
    const host = parsed.hostname.toLowerCase();

    // Direct image file extensions — very likely to work
    if (/\.(jpe?g|png|gif|bmp)$/i.test(path)) return true;

    // Known DOT/traffic camera URL patterns
    if (host.includes("dot.") || host.includes("511") || host.includes("traffic")) return true;
    if (path.includes("camera") || path.includes("snapshot") || path.includes("cctv")) return true;
    if (path.includes("image") || path.includes("photo") || path.includes("still")) return true;
    if (parsed.search.includes("cam") || parsed.search.includes("image")) return true;

    return false;
  } catch {
    return false;
  }
}

/** Validate a camera URL by actually fetching it and checking the response. */
async function validateCamera(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    if (await isBlockedHost(parsed.hostname)) return false;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT_MS);

    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });

    clearTimeout(timeout);

    if (!resp.ok) return false;

    const ct = resp.headers.get("content-type") ?? "";
    // Must be an image content type
    if (!ct.startsWith("image/")) return false;

    // Check body isn't empty (some servers return 200 with 0 bytes)
    const body = await resp.arrayBuffer();
    if (body.byteLength < 1000) return false; // real JPEG is usually > 1KB

    return true;
  } catch {
    return false;
  }
}

/** Shuffle array in place (Fisher-Yates). */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function slugify(state: string, city: string, idx: number): string {
  const s = state.toLowerCase().replace(/\s+/g, "_").slice(0, 16);
  const c = city.toLowerCase().replace(/\s+/g, "_").slice(0, 16);
  return `otc_${s}_${c}_${String(idx).padStart(4, "0")}`;
}

const STATE_TO_REGION: Record<string, "americas"> = {
  alaska: "americas", alabama: "americas", arizona: "americas",
  california: "americas", colorado: "americas", florida: "americas",
  georgia: "americas", hawaii: "americas", illinois: "americas",
  indiana: "americas", iowa: "americas", kentucky: "americas",
  maryland: "americas", massachusetts: "americas", michigan: "americas",
  minnesota: "americas", missouri: "americas", nebraska: "americas",
  nevada: "americas", "new hampshire": "americas", "new jersey": "americas",
  "new york": "americas", "north carolina": "americas", ohio: "americas",
  oregon: "americas", pennsylvania: "americas", tennessee: "americas",
  texas: "americas", utah: "americas", virginia: "americas",
  washington: "americas", wisconsin: "americas",
};

export async function GET() {
  const now = Date.now();
  if (cache && cache.expires > now) {
    return NextResponse.json(cache.data, {
      headers: { "Cache-Control": "public, max-age=120" },
    });
  }

  try {
    // 1. Fetch OTC dataset
    const resp = await fetch(OTC_USA_URL);
    if (!resp.ok) throw new Error(`OTC fetch failed: ${resp.status}`);
    const data: OtcData = await resp.json();

    // 2. Flatten and pre-filter to likely-working cameras
    interface Candidate {
      state: string;
      city: string;
      idx: number;
      cam: OtcCamera;
    }

    const candidates: Candidate[] = [];
    for (const [state, cities] of Object.entries(data)) {
      for (const [city, cams] of Object.entries(cities)) {
        for (let i = 0; i < cams.length; i++) {
          const cam = cams[i];
          if (typeof cam.latitude !== "number" || typeof cam.longitude !== "number" || !cam.url) continue;
          if (!isLikelyImageUrl(cam.url)) continue;
          candidates.push({ state, city, idx: i, cam });
        }
      }
    }

    // 3. Random sample for validation
    shuffle(candidates);
    const sample = candidates.slice(0, SAMPLE_SIZE);

    // 4. Validate in parallel batches
    const validated: CctvCamera[] = [];

    for (let i = 0; i < sample.length; i += VALIDATE_BATCH_SIZE) {
      const batch = sample.slice(i, i + VALIDATE_BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (c) => {
          const ok = await validateCamera(c.cam.url);
          return ok ? c : null;
        }),
      );

      for (const c of results) {
        if (!c) continue;
        validated.push({
          id: slugify(c.state, c.city, c.idx),
          city: c.city,
          state: c.state,
          name: c.cam.description || `${c.city} Camera ${c.idx + 1}`,
          lat: c.cam.latitude,
          lon: c.cam.longitude,
          snapshotUrl: `/api/cctv/insecam/proxy?url=${encodeURIComponent(c.cam.url)}`,
          streamUrl: c.cam.url,
          streamFormat: "JPEG" as const,
          direction: c.cam.direction,
          refreshSeconds: 30,
          region: STATE_TO_REGION[c.state.toLowerCase()] ?? "americas",
        });
      }
    }

    console.log(`[otc] validated ${validated.length}/${sample.length} cameras (${candidates.length} candidates)`);

    cache = { data: validated, expires: now + TTL_MS };

    return NextResponse.json(validated, {
      headers: { "Cache-Control": "public, max-age=120" },
    });
  } catch (err) {
    console.error("[otc] validation failed:", err);

    if (cache) {
      return NextResponse.json(cache.data, {
        headers: { "Cache-Control": "public, max-age=30" },
      });
    }

    return NextResponse.json([], { status: 502 });
  }
}
