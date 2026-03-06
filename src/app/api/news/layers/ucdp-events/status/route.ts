import { NextResponse } from "next/server";
import { ensureUcdpLoaded, getUcdpMeta } from "../../../../../../lib/server/ucdp/ucdpGedStore";

export const dynamic = "force-dynamic";

export async function GET() {
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
