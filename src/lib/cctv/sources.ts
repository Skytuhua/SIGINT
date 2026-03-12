import type { CctvCamera } from "../providers/types";

/**
 * Fetch pre-validated OTC traffic cameras from our server-side endpoint.
 * The endpoint validates cameras by actually fetching their images,
 * so we only get cameras that are confirmed to serve real JPEG data.
 */
async function fetchOtcCameras(): Promise<CctvCamera[]> {
  const resp = await fetch("/api/cctv/otc");
  if (!resp.ok) return [];
  const data: CctvCamera[] = await resp.json();
  return data;
}

async function fetchInsecamCameras(): Promise<CctvCamera[]> {
  const resp = await fetch("/api/cctv/insecam");
  if (!resp.ok) return [];
  const data: CctvCamera[] = await resp.json();
  return data;
}

/**
 * Fetch cameras from validated OTC traffic cams + Insecam.org scraping.
 * Both sources are server-side validated before being returned.
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
