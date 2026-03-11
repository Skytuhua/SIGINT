import { NextResponse } from "next/server";
import { getGdeltArticles } from "../../../../../lib/server/news/providers/gdelt";
import { generateHostedSummary, isHostedLlmAvailable } from "../../../../../lib/llm/hostedClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ── Wikipedia: search first, then fetch summary ─────────────────────────────
async function fetchWikipediaSummary(name: string): Promise<{ extract: string; pageUrl: string } | null> {
  try {
    // Search for the best matching article title
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&srlimit=1&format=json&origin=*`;
    const searchRes = await fetch(searchUrl, {
      headers: { "User-Agent": "SIGINT/0.1 (research tool)" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!searchRes.ok) return null;
    const searchJson = await searchRes.json() as Record<string, any>;
    const title: string | undefined = searchJson?.query?.search?.[0]?.title;
    if (!title) return null;

    const encoded = encodeURIComponent(title.replace(/\s+/g, "_"));
    const summaryRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`, {
      headers: { "User-Agent": "SIGINT/0.1 (research tool)" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!summaryRes.ok) return null;
    const json = await summaryRes.json() as Record<string, any>;
    if (json.type === "disambiguation") return null;
    const extract = String(json.extract ?? "").slice(0, 800);
    const pageUrl = String(json.content_urls?.desktop?.page ?? "");
    if (!extract) return null;
    return { extract, pageUrl };
  } catch {
    return null;
  }
}

// ── OpenSanctions: free public API, rich entity profiles ────────────────────
export interface OpenSanctionsProfile {
  birthDate: string | null;
  nationality: string | null;
  position: string | null;
  country: string | null;
  description: string | null;
  gender: string | null;
  registrationNumber: string | null;
  incorporationDate: string | null;
  dissolutionDate: string | null;
  topics: string[];
  opensanctionsUrl: string | null;
}

async function fetchOpenSanctionsProfile(name: string, entityType: string): Promise<OpenSanctionsProfile | null> {
  try {
    const schema = entityType === "Individual" ? "Person"
      : entityType === "Vessel" ? "Vessel"
      : entityType === "Aircraft" ? "Airplane"
      : "LegalEntity";

    const url = `https://api.opensanctions.org/search/default?q=${encodeURIComponent(name)}&schema=${schema}&limit=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "SIGINT/0.1 (research tool)", Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = await res.json() as Record<string, any>;
    const result = json?.results?.[0];
    if (!result) return null;

    const p = result.properties ?? {};
    const first = (arr: unknown): string | null =>
      Array.isArray(arr) && arr.length > 0 ? String(arr[0]) : null;

    const topics: string[] = Array.isArray(result.datasets)
      ? []
      : Array.isArray(p.topics) ? p.topics.map(String) : [];

    return {
      birthDate: first(p.birthDate),
      nationality: first(p.nationality) ?? first(p.country),
      position: first(p.position),
      country: first(p.country),
      description: first(p.notes) ?? first(p.description),
      gender: first(p.gender),
      registrationNumber: first(p.registrationNumber),
      incorporationDate: first(p.incorporationDate),
      dissolutionDate: first(p.dissolutionDate),
      topics,
      opensanctionsUrl: result.id ? `https://www.opensanctions.org/entities/${result.id}/` : null,
    };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name")?.trim();
  const entityType = searchParams.get("entityType") ?? "";
  const authority = searchParams.get("authority") ?? "";
  const program = searchParams.get("program") ?? "";
  const linkedCountries = searchParams.get("linkedCountries") ?? "";
  const aliases = searchParams.get("aliases") ?? "";

  if (!name) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }

  const isIndividualOrOrg = ["Individual", "Organization", "Company", "Bank", "Government"].some(
    (t) => entityType.toLowerCase().includes(t.toLowerCase())
  );

  // Broaden GDELT query with name + top alias for better recall
  const aliasTerms = aliases.split(";").map((a) => a.trim()).filter(Boolean).slice(0, 2);
  const gdeltQuery = [
    `"${name}"`,
    ...aliasTerms.map((a) => `"${a}"`),
  ].join(" OR ");

  const [gdeltResult, wikiResult, osProfile] = await Promise.all([
    getGdeltArticles({ q: gdeltQuery, timespan: "1y", maxrecords: 15 }).catch(() => ({ data: [], degraded: true })),
    isIndividualOrOrg ? fetchWikipediaSummary(name) : Promise.resolve(null),
    fetchOpenSanctionsProfile(name, entityType),
  ]);

  let aiSummary: string | null = null;
  if (isHostedLlmAvailable()) {
    try {
      const contextParts: string[] = [
        `Entity name: ${name}`,
        `Type: ${entityType || "Unknown"}`,
        `Sanctioning authority: ${authority || "Unknown"}`,
        `Program: ${program || "Unknown"}`,
        linkedCountries ? `Linked countries: ${linkedCountries}` : "",
        osProfile?.position ? `Position/role: ${osProfile.position}` : "",
        osProfile?.nationality ? `Nationality: ${osProfile.nationality}` : "",
        osProfile?.description ? `Notes: ${osProfile.description}` : "",
        wikiResult?.extract ? `Wikipedia: ${wikiResult.extract}` : "",
      ].filter(Boolean);

      aiSummary = await generateHostedSummary({
        system:
          "You are a geopolitical intelligence analyst. Given structured data about a sanctioned entity, write a concise 3–4 sentence intelligence summary covering: who they are, why they are sanctioned, and their geopolitical significance. Be factual and objective. Do not repeat field names verbatim.",
        user: contextParts.join("\n"),
      });
    } catch {
      aiSummary = null;
    }
  }

  const news = (gdeltResult.data ?? []).map((a) => ({
    title: a.title,
    url: a.url,
    domain: a.domain,
    date: a.seendate,
    sourcecountry: a.sourcecountry,
  }));

  return NextResponse.json({
    aiSummary,
    wikipedia: wikiResult,
    opensanctions: osProfile,
    news,
    degraded: gdeltResult.degraded ?? false,
  });
}
