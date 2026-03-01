import { NextResponse } from "next/server";
import { buildSuggestions } from "../../../../lib/server/news/search";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const suggestions = await buildSuggestions(searchParams);
  return NextResponse.json(
    { suggestions },
    { headers: { "Cache-Control": "public, max-age=30" } }
  );
}
