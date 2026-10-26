import type { CctvCamera } from "../providers/types";
import { fetchJsonWithPolicy } from "../runtime/fetchJson";

interface CameraFetchOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Fetch pre-validated OTC traffic cameras from our server-side endpoint.
 * The endpoint validates cameras by actually fetching their images,
 * so we only get cameras that are confirmed to serve real JPEG data.
 */
async function fetchCameraSource(url: string, options: CameraFetchOptions): Promise<CctvCamera[]> {
  return fetchJsonWithPolicy<CctvCamera[]>(url, {
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? 8_000,
    retries: 0,
    negativeTtlMs: 0,
  });
}

/**
 * Fetch cameras from validated OTC traffic cams + Insecam.org scraping.
 * Both sources are server-side validated before being returned.
 */
export async function fetchAllCctvCameras(options: CameraFetchOptions = {}): Promise<CctvCamera[]> {
  const results = await Promise.allSettled([
    fetchCameraSource("/api/cctv/otc", options),
    fetchCameraSource("/api/cctv/insecam", options),
  ]);
  options.signal?.throwIfAborted();
  if (results.every((result) => result.status === "rejected")) {
    throw new Error("All camera sources failed");
  }

  const byId = new Map<string, CctvCamera>();
  for (const result of results) {
    if (result.status === "fulfilled") {
      for (const cam of result.value) byId.set(cam.id, cam);
    }
  }

  return Array.from(byId.values());
}
