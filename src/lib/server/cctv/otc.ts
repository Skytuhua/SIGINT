/**
 * Shared OTC (OpenTrafficCamMap) utilities for fetching, filtering,
 * validating, and converting US traffic cameras.
 */
import type { CctvCamera } from "../../providers/types";
import { withPublicHttpResponse } from "../ssrf";
import { requestDeadline } from "../fetchWithTimeout";

// ─── Types ───────────────────────────────────────────────────────────

export interface OtcCamera {
  description?: string;
  latitude: number;
  longitude: number;
  direction?: string;
  url: string;
  encoding?: string;
  format?: string;
}

export type OtcData = Record<string, Record<string, OtcCamera[]>>;

export interface OtcCandidate {
  state: string;
  city: string;
  idx: number;
  cam: OtcCamera;
}

// ─── Constants ───────────────────────────────────────────────────────

const OTC_USA_URL =
  "https://raw.githubusercontent.com/AidanWelch/OpenTrafficCamMap/master/cameras/USA.json";

const DATASET_TTL_MS = 30 * 60 * 1000; // 30-minute cache for raw dataset
const VALIDATE_TIMEOUT_MS = 2_000;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ─── Dataset cache ───────────────────────────────────────────────────

let datasetCache: { data: OtcData; expires: number } | null = null;

/** Fetch the OTC USA dataset with 30-minute module-level caching. */
export async function fetchOtcDataset(): Promise<OtcData> {
  const now = Date.now();
  if (datasetCache && datasetCache.expires > now) {
    return datasetCache.data;
  }

  const resp = await fetch(OTC_USA_URL);
  if (!resp.ok) throw new Error(`OTC fetch failed: ${resp.status}`);
  const data: OtcData = await resp.json();

  datasetCache = { data, expires: now + DATASET_TTL_MS };
  return data;
}

// ─── Filtering ───────────────────────────────────────────────────────

/** Only keep cameras with HTTPS URLs that look like direct image feeds. */
export function isLikelyImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;

    const path = parsed.pathname.toLowerCase();
    const host = parsed.hostname.toLowerCase();

    if (/\.(jpe?g|png|gif|bmp)$/i.test(path)) return true;

    if (host.includes("dot.") || host.includes("511") || host.includes("traffic")) return true;
    if (path.includes("camera") || path.includes("snapshot") || path.includes("cctv")) return true;
    if (path.includes("image") || path.includes("photo") || path.includes("still")) return true;
    if (parsed.search.includes("cam") || parsed.search.includes("image")) return true;

    return false;
  } catch {
    return false;
  }
}

/** Flatten OTC nested structure and pre-filter to likely-working cameras. */
export function flattenAndFilter(data: OtcData): OtcCandidate[] {
  const candidates: OtcCandidate[] = [];

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

  return candidates;
}

// ─── Validation ──────────────────────────────────────────────────────

/** Validate a camera URL via HEAD request (fast, no body download). */
export async function validateCameraHead(url: string): Promise<boolean> {
  try {
    const signal = requestDeadline(VALIDATE_TIMEOUT_MS);
    const probe = async (method: "HEAD" | "GET") => {
      let currentUrl = url;
      for (let redirects = 0; ; redirects++) {
        signal.throwIfAborted();
        const result = await withPublicHttpResponse(currentUrl, {
          method,
          signal,
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "image/*,*/*;q=0.8",
            ...(method === "GET" ? { Range: "bytes=0-0" } : {}),
          },
        }, async (response): Promise<{ redirect: string } | { status: number; contentType: string }> => {
          if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get("location");
            if (!location || redirects >= 5) throw new Error("camera-redirect-limit");
            return { redirect: new URL(location, currentUrl).toString() };
          }
          return { status: response.status, contentType: response.headers.get("content-type") ?? "" };
        });
        if ("redirect" in result) currentUrl = result.redirect;
        else return result;
      }
    };

    let resp = await probe("HEAD");

    // Some servers reject HEAD — fall back to range GET
    if (resp.status === 405 || resp.status === 501) {
      resp = await probe("GET");
    }

    if (resp.status < 200 || resp.status >= 300) return false;
    return resp.contentType.startsWith("image/");
  } catch {
    return false;
  }
}

// ─── Mapping ─────────────────────────────────────────────────────────

function slugify(state: string, city: string, idx: number): string {
  const s = state.toLowerCase().replace(/\s+/g, "_").slice(0, 16);
  const c = city.toLowerCase().replace(/\s+/g, "_").slice(0, 16);
  return `otc_${s}_${c}_${String(idx).padStart(4, "0")}`;
}

/** Convert a validated OTC candidate into a CctvCamera. */
export function toCctvCamera(c: OtcCandidate): CctvCamera {
  return {
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
    region: "americas",
  };
}

// ─── Utilities ───────────────────────────────────────────────────────

/** Fisher-Yates shuffle (in place). */
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Validate candidates in parallel batches.
 * Returns only candidates whose URLs respond with image content-type.
 */
export async function validateBatch(
  candidates: OtcCandidate[],
  batchSize: number,
): Promise<OtcCandidate[]> {
  const validated: OtcCandidate[] = [];

  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (c) => {
        const ok = await validateCameraHead(c.cam.url);
        return ok ? c : null;
      }),
    );

    for (const c of results) {
      if (c) validated.push(c);
    }
  }

  return validated;
}
