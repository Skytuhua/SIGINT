import { NextResponse } from "next/server";
import { getCountryInfo, getGovernanceIndicators } from "../../../../lib/server/news/providers/worldbank";
import { STANDARD_LIMITER } from "../../../../lib/server/rateLimitPresets";
import { withRateLimit } from "../../../../lib/server/withRateLimit";

async function handler(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country");
  if (!country || country.length !== 2) {
    return NextResponse.json({ error: "Missing or invalid country ISO2 code" }, { status: 400 });
  }

  const [governance, info] = await Promise.all([
    getGovernanceIndicators(country),
    getCountryInfo(country),
  ]);

  return NextResponse.json(
    {
      governance: governance.data,
      countryInfo: info.data,
      degraded: governance.degraded || info.degraded,
      latencyMs: governance.latencyMs + info.latencyMs,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export const GET = withRateLimit(STANDARD_LIMITER, handler);
