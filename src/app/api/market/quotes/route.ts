import { NextResponse } from "next/server";
import { getQuotes } from "../../../../lib/server/news/providers/yahooFinance";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("symbols") ?? "";
  const symbols = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (symbols.length === 0) {
    return NextResponse.json(
      { error: "Missing 'symbols' parameter" },
      { status: 400 },
    );
  }

  const result = await getQuotes(symbols);
  return NextResponse.json(
    {
      quotes: result.data,
      degraded: result.degraded,
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
