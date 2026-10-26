import { NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";
import type { DisasterAlert } from "../../../lib/providers/types";
import { normalizeGdacsItems } from "../../../lib/runtime/ops/gdacsNormalizer";
import type { GdacsRawItem } from "../../../lib/runtime/ops/types";
import { STANDARD_LIMITER } from "../../../lib/server/rateLimitPresets";
import { withRateLimit } from "../../../lib/server/withRateLimit";

export const dynamic = "force-dynamic";

const GDACS_URL = "https://www.gdacs.org/xml/rss_24h.xml";
const FRESH_TTL_MS = 6 * 60_000;
const STALE_TTL_MS = 60 * 60_000;
const FETCH_TIMEOUT_MS = 20_000;

interface CachedGdacsFeed {
  source: "gdacs";
  items: DisasterAlert[];
  fetchedAt: number;
  expiresAt: number;
  staleUntil: number;
  etag: string | null;
  lastModified: string | null;
  lastSuccessAt: number | null;
  errorCode: string | null;
}

interface GdacsRouteResponse {
  source: "gdacs";
  items: DisasterAlert[];
  fetchedAt: number;
  status: "live" | "cached" | "degraded" | "unavailable";
  etag: string | null;
  lastModified: string | null;
  errorCode: string | null;
}

let cache: CachedGdacsFeed | null = null;

function getFreshCache(): CachedGdacsFeed | null {
  if (!cache) return null;
  return cache.expiresAt > Date.now() ? cache : null;
}

function getStaleCache(): CachedGdacsFeed | null {
  if (!cache) return null;
  return cache.staleUntil > Date.now() ? cache : null;
}

function toRawItems(xml: string): GdacsRawItem[] {
  const parser = new XMLParser({
    ignoreAttributes: true,
    trimValues: true,
  });
  const parsed = parser.parse(xml) as {
    rss?: {
      channel?: {
        item?: GdacsRawItem | GdacsRawItem[];
      };
    };
  };
  const itemsNode = parsed?.rss?.channel?.item;
  const rows = Array.isArray(itemsNode) ? itemsNode : itemsNode ? [itemsNode] : [];
  return rows.map((item) => {
    const geoPoint = (item["geo:Point"] ?? {}) as { "geo:lat"?: unknown; "geo:long"?: unknown };
    const lat = item["geo:lat"] ?? geoPoint["geo:lat"];
    const lon = item["geo:long"] ?? geoPoint["geo:long"];
    return {
      ...item,
      "geo:lat": typeof lat === "string" || typeof lat === "number" ? lat : undefined,
      "geo:long": typeof lon === "string" || typeof lon === "number" ? lon : undefined,
    };
  });
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

function toResponse(payload: GdacsRouteResponse): NextResponse<GdacsRouteResponse> {
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-SIGINT-Feed-Status": payload.status,
    },
  });
}

async function handler(): Promise<NextResponse<GdacsRouteResponse>> {
  const fresh = getFreshCache();
  if (fresh) {
    return toResponse({
      source: "gdacs",
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
    const response = await fetchWithTimeout(GDACS_URL, { headers });
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
        source: "gdacs",
        items: cache.items,
        fetchedAt: cache.fetchedAt,
        status: "live",
        etag: cache.etag,
        lastModified: cache.lastModified,
        errorCode: null,
      });
    }

    if (!response.ok) {
      throw new Error(`gdacs_http_${response.status}`);
    }

    const text = await response.text();
    const rawItems = toRawItems(text);
    const nextItems = normalizeGdacsItems(rawItems);
    const nextEtag = response.headers.get("etag");
    const nextLastModified = response.headers.get("last-modified");

    cache = {
      source: "gdacs",
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
      source: "gdacs",
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
      error instanceof Error ? error.message : "gdacs_fetch_failed";
    if (stale) {
      cache = {
        ...stale,
        fetchedAt: Date.now(),
        errorCode,
      };
      return toResponse({
        source: "gdacs",
        items: stale.items,
        fetchedAt: stale.fetchedAt,
        status: "degraded",
        etag: stale.etag,
        lastModified: stale.lastModified,
        errorCode,
      });
    }

    return toResponse({
      source: "gdacs",
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
