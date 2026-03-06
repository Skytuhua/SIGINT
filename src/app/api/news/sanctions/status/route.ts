import { NextResponse } from "next/server";
import { getSanctionsData, toSanctionsLayerHealth } from "../../../../../lib/server/news/sanctions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { sourceStatus } = await getSanctionsData();
    const aggregated = toSanctionsLayerHealth(sourceStatus);
    return NextResponse.json(
      { sources: sourceStatus, aggregated },
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
