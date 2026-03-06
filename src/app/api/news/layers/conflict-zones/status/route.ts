import { NextResponse } from "next/server";
import { getConflictZonesLayer } from "../../../../../../lib/server/news/conflictZones";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const origin = new URL(request.url).origin;
    const requestUrl = `${origin}/api/news/layers/conflict-zones?timeWindow=7d&mode=strict`;
    const result = await getConflictZonesLayer({ origin, requestUrl });
    return NextResponse.json(
      {
        lastRefreshedAt: result.lastRefreshedAt,
        sources: result.sourceStatus,
        timeWindow: "7d",
        mode: "strict",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        lastRefreshedAt: null,
        sources: {
          gdeltEvents: "unavailable" as const,
          gdeltGeo: "unavailable" as const,
          ucdpGed: "unavailable" as const,
        },
        timeWindow: "7d",
        mode: "strict",
        error: String(error),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }
}
