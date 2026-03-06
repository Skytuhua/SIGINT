import { NextResponse } from "next/server";
import { getNuclearSitesLayer, toLayerHealthFromSources } from "../../../../../../lib/server/news/nuclearSites";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await getNuclearSitesLayer();
    const aggregated = toLayerHealthFromSources(result.sourceStatus);
    return NextResponse.json(
      {
        sources: result.sourceStatus,
        aggregated,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        sources: {},
        aggregated: {
          status: "unavailable",
          lastSuccessAt: null,
          lastError: String(error),
          nextRetryAt: null,
          consecutiveFailures: 0,
        },
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }
}

