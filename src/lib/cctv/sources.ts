import type { CctvCamera, CctvStreamFormat } from "../providers/types";

const OTC_USA_URL =
  "https://raw.githubusercontent.com/AidanWelch/OpenTrafficCamMap/master/cameras/USA.json";

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

function inferStreamFormat(
  format?: string,
  url?: string,
): CctvStreamFormat {
  if (format === "M3U8" || url?.endsWith(".m3u8")) return "M3U8";
  if (format === "IMAGE_STREAM") return "IMAGE_STREAM";
  if (
    format === "JPEG" ||
    url?.endsWith(".jpg") ||
    url?.endsWith(".jpeg") ||
    url?.endsWith(".png")
  )
    return "JPEG";
  return "UNKNOWN";
}

function slugify(state: string, city: string, idx: number): string {
  const s = state.toLowerCase().replace(/\s+/g, "_").slice(0, 16);
  const c = city.toLowerCase().replace(/\s+/g, "_").slice(0, 16);
  return `otc_${s}_${c}_${String(idx).padStart(4, "0")}`;
}

function flattenOtcData(data: OtcData): CctvCamera[] {
  const cameras: CctvCamera[] = [];
  for (const [state, cities] of Object.entries(data)) {
    for (const [city, cams] of Object.entries(cities)) {
      for (let i = 0; i < cams.length; i++) {
        const cam = cams[i];
        if (
          typeof cam.latitude !== "number" ||
          typeof cam.longitude !== "number" ||
          !cam.url
        )
          continue;

        const fmt = inferStreamFormat(cam.format, cam.url);
        const isImage = fmt === "JPEG" || fmt === "IMAGE_STREAM";

        cameras.push({
          id: slugify(state, city, i),
          city,
          state,
          name: cam.description || `${city} Camera ${i + 1}`,
          lat: cam.latitude,
          lon: cam.longitude,
          snapshotUrl: isImage ? cam.url : "",
          streamUrl: cam.url,
          streamFormat: fmt,
          direction: cam.direction,
          refreshSeconds: isImage ? 30 : 60,
          region: "americas",
        });
      }
    }
  }
  return cameras;
}

async function fetchOtcCameras(): Promise<CctvCamera[]> {
  const resp = await fetch(OTC_USA_URL);
  if (!resp.ok) throw new Error(`OTC fetch failed: ${resp.status}`);
  const data: OtcData = await resp.json();
  return flattenOtcData(data);
}

async function fetchInsecamCameras(): Promise<CctvCamera[]> {
  const resp = await fetch("/api/cctv/insecam");
  if (!resp.ok) return [];
  const data: CctvCamera[] = await resp.json();
  return data;
}

/**
 * Fetch cameras from OpenTrafficCamMap + Insecam.org scraping.
 * YouTube fallback has been removed — Insecam is the sole live camera source.
 */
export async function fetchAllCctvCameras(): Promise<CctvCamera[]> {
  const [otcCams, insecamCams] = await Promise.all([
    fetchOtcCameras().catch(() => [] as CctvCamera[]),
    fetchInsecamCameras().catch(() => [] as CctvCamera[]),
  ]);

  const byId = new Map<string, CctvCamera>();
  for (const cam of otcCams) byId.set(cam.id, cam);
  for (const cam of insecamCams) byId.set(cam.id, cam);

  return Array.from(byId.values());
}
