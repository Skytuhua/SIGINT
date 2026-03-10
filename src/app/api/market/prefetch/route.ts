import { NextResponse } from "next/server";
import { getQuotes, getMovers, getMarketNews, getEarningsCalendar } from "../../../../lib/server/news/providers/yahooFinance";

// All symbols used across Overview panels — batched into one call to warm cache
const PREFETCH_SYMBOLS = [
  // Indices / Futures (GlobalSnapshotPanel)
  "ES=F", "NQ=F", "RTY=F", "YM=F", "^GDAXI", "^FTSE", "^N225", "^HSI",
  // FX (GlobalSnapshotPanel)
  "EURUSD=X", "JPY=X", "GBPUSD=X", "DX-Y.NYB",
  // Commodities (CommoditiesBoard)
  "CL=F", "BZ=F", "NG=F", "GC=F", "SI=F", "HG=F", "PL=F",
  "ZC=F", "ZW=F", "ZS=F", "KC=F", "SB=F",
  // Rates (YieldCurvePanel)
  "^IRX", "^FVX", "^TNX", "^TYX",
  // Volatility
  "^VIX",
  // Sector ETFs (SectorRotationPanel)
  "XLK", "XLC", "XLF", "XLI", "XLV", "XLY", "XLP", "XLB", "XLRE", "XLU", "XLE",
  // Breadth proxies
  "RSP", "SPY",
];

export async function GET() {
  // Fire all fetches in parallel to warm the server cache
  const [quotes, movers, news, earnings] = await Promise.allSettled([
    getQuotes(PREFETCH_SYMBOLS),
    getMovers(),
    getMarketNews(20),
    getEarningsCalendar(),
  ]);

  return NextResponse.json({
    ok: true,
    results: {
      quotes: quotes.status === "fulfilled" && !quotes.value.degraded ? "live" : "degraded",
      movers: movers.status === "fulfilled" && !movers.value.degraded ? "live" : "degraded",
      news: news.status === "fulfilled" && !news.value.degraded ? "live" : "degraded",
      earnings: earnings.status === "fulfilled" && !earnings.value.degraded ? "live" : "degraded",
    },
    timestamp: new Date().toISOString(),
  });
}
