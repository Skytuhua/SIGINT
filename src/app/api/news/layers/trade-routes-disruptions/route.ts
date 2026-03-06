import { NextResponse } from "next/server";

interface GdeltArticle {
  title?: string;
  url?: string;
  seendate?: string;
}

interface GdeltResponse {
  articles?: GdeltArticle[];
}

interface DisruptionSignal {
  chokepoint: string;
  headlines: { title: string; url: string; date: string }[];
}

const GDELT_API = "https://api.gdeltproject.org/api/v2/doc/doc";
const CACHE_TTL_MS = 5 * 60_000;

const cache = new Map<string, { data: DisruptionSignal; ts: number }>();

async function queryGdeltForChokepoint(name: string): Promise<DisruptionSignal> {
  const cached = cache.get(name);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  const searchTerm = `${name} shipping OR disruption OR attack OR closure`;
  const params = new URLSearchParams({
    query: searchTerm,
    mode: "ArtList",
    maxrecords: "5",
    format: "json",
    timespan: "7d",
  });

  try {
    const res = await fetch(`${GDELT_API}?${params.toString()}`, {
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return { chokepoint: name, headlines: [] };
    }

    const data = (await res.json()) as GdeltResponse;
    const articles = data.articles ?? [];

    const signal: DisruptionSignal = {
      chokepoint: name,
      headlines: articles
        .filter((a): a is Required<Pick<GdeltArticle, "title" | "url">> & GdeltArticle =>
          Boolean(a.title && a.url)
        )
        .slice(0, 5)
        .map((a) => ({
          title: a.title,
          url: a.url,
          date: a.seendate?.slice(0, 8) ?? "",
        })),
    };

    cache.set(name, { data: signal, ts: Date.now() });
    return signal;
  } catch {
    return { chokepoint: name, headlines: [] };
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chokepointsParam = searchParams.get("chokepoints") ?? "";

  if (!chokepointsParam) {
    return NextResponse.json([]);
  }

  const names = chokepointsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);

  const results = await Promise.all(names.map(queryGdeltForChokepoint));
  const nonEmpty = results.filter((r) => r.headlines.length > 0);

  return NextResponse.json(nonEmpty, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
