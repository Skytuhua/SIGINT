import { NextResponse } from "next/server";
import { executeNewsSearch } from "../../../../lib/server/news/search";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const result = await executeNewsSearch(searchParams);

  return NextResponse.json(
    {
      items: result.items,
      markers: result.markers,
      facets: result.facets,
      total: result.total,
      degraded: result.degraded,
      backendLatency: result.backendLatency,
      backendHealth: result.backendHealth,
      emptyReason: result.emptyReason,
      fallbackApplied: result.fallbackApplied,
      activeConstraints: result.activeConstraints,
      queryEcho: result.queryEcho,
      timeline: result.timeline,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
