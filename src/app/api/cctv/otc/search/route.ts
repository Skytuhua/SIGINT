export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import type { CctvCamera } from "../../../../../lib/providers/types";
import {
  fetchOtcDataset,
  flattenAndFilter,
  toCctvCamera,
  validateBatch,
} from "../../../../../lib/server/cctv/otc";
import { MODERATE_LIMITER } from "../../../../../lib/server/rateLimitPresets";
import { withRateLimit } from "../../../../../lib/server/withRateLimit";

const MAX_VALIDATE = 30; // validate up to this many matches
const VALIDATE_BATCH_SIZE = 30; // all in one parallel batch
const QUERY_CACHE_TTL_MS = 5 * 60 * 1000; // 5-minute per-query cache
const MAX_CACHE_ENTRIES = 100;

const queryCache = new Map<string, { data: CctvCamera[]; expires: number }>();

function evictOldest() {
  if (queryCache.size <= MAX_CACHE_ENTRIES) return;
  // Delete the first (oldest) entry
  const firstKey = queryCache.keys().next().value;
  if (firstKey !== undefined) queryCache.delete(firstKey);
}

async function handler(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
  if (q.length < 2) {
    return NextResponse.json([], { status: 200 });
  }

  // Check per-query cache
  const now = Date.now();
  const cached = queryCache.get(q);
  if (cached && cached.expires > now) {
    return NextResponse.json(cached.data, {
      headers: { "Cache-Control": "public, max-age=30" },
    });
  }

  try {
    const data = await fetchOtcDataset();
    const allCandidates = flattenAndFilter(data);

    // Filter by query matching city, state, or description
    const matches = allCandidates.filter((c) => {
      const city = c.city.toLowerCase();
      const state = c.state.toLowerCase();
      const desc = (c.cam.description ?? "").toLowerCase();
      return city.includes(q) || state.includes(q) || desc.includes(q);
    });

    // Take up to MAX_VALIDATE matches and validate them
    const toValidate = matches.slice(0, MAX_VALIDATE);
    const validated = await validateBatch(toValidate, VALIDATE_BATCH_SIZE);
    const cameras = validated.map(toCctvCamera);

    console.log(`[otc/search] → ${matches.length} matches, ${cameras.length} validated`);

    // Cache result
    evictOldest();
    queryCache.set(q, { data: cameras, expires: now + QUERY_CACHE_TTL_MS });

    return NextResponse.json(cameras, {
      headers: { "Cache-Control": "public, max-age=30" },
    });
  } catch (err) {
    console.error("[otc/search] failed:", err);
    return NextResponse.json([], { status: 502 });
  }
}

export const GET = withRateLimit(MODERATE_LIMITER, handler);
