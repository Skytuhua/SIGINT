import { NextResponse } from "next/server";
import type { SpaceWeatherAlert } from "../../../lib/providers/types";
import { normalizeSwpcItems } from "../../../lib/runtime/ops/spaceWeatherNormalizer";
import type { SwpcRawItem } from "../../../lib/runtime/ops/types";
import { STANDARD_LIMITER } from "../../../lib/server/rateLimitPresets";
import { withRateLimit } from "../../../lib/server/withRateLimit";

export const dynamic = "force-dynamic";

const SWPC_URL = "https://services.swpc.noaa.gov/products/alerts.json";
const FRESH_TTL_MS = 2 * 60_000;
const STALE_TTL_MS = 60 * 60_000;
const FETCH_TIMEOUT_MS = 20_000;

interface CachedSpaceWeatherFeed {
  source: "spaceWeather";
  items: SpaceWeatherAlert[];
  fetchedAt: number;
  expiresAt: number;
  staleUntil: number;
  etag: string | null;
  lastModified: string | null;
  lastSuccessAt: number | null;
  errorCode: string | null;
}

interface SpaceWeatherRouteResponse {
  source: "spaceWeather";
  items: SpaceWeatherAlert[];
  fetchedAt: number;
  status: "live" | "cached" | "degraded" | "unavailable";
  etag: string | null;
  lastModified: string | null;
  errorCode: string | null;
}

let cache: CachedSpaceWeatherFeed | null = null;

function getFreshCache(): CachedSpaceWeatherFeed | null {
  if (!cache) return null;
  return cache.expiresAt > Date.now() ? cache : null;
}

function getStaleCache(): CachedSpaceWeatherFeed | null {
  if (!cache) return null;
  return cache.staleUntil > Date.now() ? cache : null;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

function toResponse(payload: SpaceWeatherRouteResponse): NextResponse<SpaceWeatherRouteResponse> {
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-SIGINT-Feed-Status": payload.status,
    },
  });
}

async function handler(): Promise<NextResponse<SpaceWeatherRouteResponse>> {
  const fresh = getFreshCache();
  if (fresh) {
    return toResponse({
      source: "spaceWeather",
      items: fresh.items,
      fetchedAt: fresh.fetchedAt,
      status: "cached",
      etag: fresh.etag,
      lastModified: fresh.lastModified,
      errorCode: null,
    });
  }

  const headers: HeadersInit = {
    "User-Agent": "SIGINT/0.1 (ops-ingestion)",
  };
  if (cache?.etag) headers["If-None-Match"] = cache.etag;
  if (cache?.lastModified) headers["If-Modified-Since"] = cache.lastModified;

  try {
    const response = await fetchWithTimeout(SWPC_URL, { headers });
    const now = Date.now();

    if (response.status === 304 && cache) {
      cache = {
        ...cache,
        fetchedAt: now,
        expiresAt: now + FRESH_TTL_MS,
        staleUntil: now + STALE_TTL_MS,
        lastSuccessAt: now,
        errorCode: null,
      };
      return toResponse({
        source: "spaceWeather",
        items: cache.items,
        fetchedAt: cache.fetchedAt,
        status: "live",
        etag: cache.etag,
        lastModified: cache.lastModified,
        errorCode: null,
      });
    }

    if (!response.ok) {
      throw new Error(`space_weather_http_${response.status}`);
    }

    const raw = (await response.json()) as SwpcRawItem[];
    const nextItems = normalizeSwpcItems(Array.isArray(raw) ? raw : []);
    const nextEtag = response.headers.get("etag");
    const nextLastModified = response.headers.get("last-modified");

    cache = {
      source: "spaceWeather",
      items: nextItems,
      fetchedAt: now,
      expiresAt: now + FRESH_TTL_MS,
      staleUntil: now + STALE_TTL_MS,
      etag: nextEtag,
      lastModified: nextLastModified,
      lastSuccessAt: now,
      errorCode: null,
    };

    return toResponse({
      source: "spaceWeather",
      items: nextItems,
      fetchedAt: now,
      status: "live",
      etag: nextEtag,
      lastModified: nextLastModified,
      errorCode: null,
    });
  } catch (error) {
    const stale = getStaleCache();
    const errorCode =
      error instanceof Error ? error.message : "space_weather_fetch_failed";

    if (stale) {
      cache = {
        ...stale,
        fetchedAt: Date.now(),
        errorCode,
      };
      return toResponse({
        source: "spaceWeather",
        items: stale.items,
        fetchedAt: stale.fetchedAt,
        status: "degraded",
        etag: stale.etag,
        lastModified: stale.lastModified,
        errorCode,
      });
    }

    return toResponse({
      source: "spaceWeather",
      items: [],
      fetchedAt: Date.now(),
      status: "unavailable",
      etag: null,
      lastModified: null,
      errorCode,
    });
  }
}

export const GET = withRateLimit(STANDARD_LIMITER, handler);
