import { NextResponse } from "next/server";
import { ensureUcdpLoaded, getUcdpMeta } from "../../../../../../lib/server/ucdp/ucdpGedStore";
import { STANDARD_LIMITER } from "../../../../../../lib/server/rateLimitPresets";
import { withRateLimit } from "../../../../../../lib/server/withRateLimit";

export const dynamic = "force-dynamic";

async function handler() {
  try {
    await ensureUcdpLoaded();
  } catch {
    // will reflect as degraded / unavailable via meta.status
  }
  const meta = getUcdpMeta();
  return NextResponse.json(meta, {
    headers: { "Cache-Control": "no-store" },
  });
}

export const GET = withRateLimit(STANDARD_LIMITER, handler);
