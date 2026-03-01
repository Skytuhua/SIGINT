import { NextResponse } from "next/server";
import {
  fetchSecCompanyFilings,
  fetchSecTickerMap,
  searchSecFilings,
} from "../../../../lib/server/news/providers/sec";
import type { SecFiling } from "../../../../lib/news/types";
import type { CachedFetchResult } from "../../../../lib/server/news/upstream";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker")?.toUpperCase();
  const cik = searchParams.get("cik") ?? "";
  const q = searchParams.get("q") ?? "";
  const form = searchParams.get("form") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  let result: CachedFetchResult<SecFiling[]> = {
    data: [],
    degraded: false,
    latencyMs: 0,
    cacheHit: "miss",
  };

  if (ticker) {
    const mapResult = await fetchSecTickerMap();
    const map = mapResult.data;
    const resolved = map[ticker];
    if (resolved) {
      const filings = await fetchSecCompanyFilings(resolved);
      result = {
        data: filings.data,
        degraded: filings.degraded || mapResult.degraded,
        latencyMs: filings.latencyMs + mapResult.latencyMs,
        cacheHit: filings.cacheHit,
      };
    } else {
      const fallback = await searchSecFilings({ q: ticker, form, from, to });
      result = fallback;
    }
  } else if (cik) {
    result = await fetchSecCompanyFilings(cik);
  } else if (q) {
    result = await searchSecFilings({ q, form, from, to });
  }

  return NextResponse.json(
    {
      filings: result.data,
      total: result.data.length,
      source: "sec-edgar",
      degraded: result.degraded,
      latencyMs: Math.round(result.latencyMs),
      cacheHit: result.cacheHit,
    },
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}
