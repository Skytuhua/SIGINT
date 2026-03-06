import { NextResponse } from "next/server";
import { getArmsEmbargoZonesLayer, toEmbargoLayerHealth } from "../../../../../../lib/server/news/armsEmbargo";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await getArmsEmbargoZonesLayer();
    const aggregated = toEmbargoLayerHealth(result.sourceStatus);
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
