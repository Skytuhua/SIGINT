import { NextRequest, NextResponse } from "next/server";
import { getStreamStore } from "../../../../../lib/server/news/stream/store";
import { startScheduler } from "../../../../../lib/server/news/stream/scheduler";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  startScheduler();

  const q = request.nextUrl.searchParams.get("q") ?? "";
  const since = request.nextUrl.searchParams.get("since");
  const sinceMs = since ? Number(since) : undefined;

  if (!q) {
    return NextResponse.json({ items: [], total: 0 });
  }

  const store = getStreamStore();
  const results = store.searchRecent(q, sinceMs);

  return NextResponse.json({
    items: results.slice(0, 200),
    total: results.length,
  });
}
