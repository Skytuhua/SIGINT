export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import type { CctvCamera } from "../../../../lib/providers/types";
import {
  fetchOtcDataset,
  flattenAndFilter,
  shuffle,
  toCctvCamera,
  validateBatch,
} from "../../../../lib/server/cctv/otc";
import { STANDARD_LIMITER } from "../../../../lib/server/rateLimitPresets";
import { withRateLimit } from "../../../../lib/server/withRateLimit";

const SAMPLE_SIZE = 200;
const VALIDATE_BATCH_SIZE = 30;
const TTL_MS = 15 * 60 * 1000; // 15-minute cache

let cache: { data: CctvCamera[]; expires: number } | null = null;

async function handler() {
  const now = Date.now();
  if (cache && cache.expires > now) {
    return NextResponse.json(cache.data, {
      headers: { "Cache-Control": "public, max-age=120" },
    });
  }

  try {
    const data = await fetchOtcDataset();
    const candidates = flattenAndFilter(data);

    // Random sample for validation
    shuffle(candidates);
    const sample = candidates.slice(0, SAMPLE_SIZE);

    const validated = await validateBatch(sample, VALIDATE_BATCH_SIZE);
    const cameras = validated.map(toCctvCamera);

    console.log(`[otc] validated ${cameras.length}/${sample.length} cameras (${candidates.length} candidates)`);

    cache = { data: cameras, expires: now + TTL_MS };

    return NextResponse.json(cameras, {
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

export const GET = withRateLimit(STANDARD_LIMITER, handler);
