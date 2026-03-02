import { NextResponse } from "next/server";
import { computeAcledInstabilityScore, getAcledCountryEvents } from "../../../../lib/server/news/providers/acled";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country");
  if (!country) {
    return NextResponse.json({ error: "Missing country parameter" }, { status: 400 });
  }

  const days = Math.min(90, Math.max(7, Number(searchParams.get("days") ?? "30") || 30));
  const result = await getAcledCountryEvents(country, days);
  const instabilityScore = computeAcledInstabilityScore(result.data);

  return NextResponse.json(
    {
      summary: {
        ...result.data,
        events: result.data.events.slice(0, 50),
      },
      instabilityScore,
      degraded: result.degraded,
      latencyMs: result.latencyMs,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
