import { NextResponse } from "next/server";
import { cachedFetch, fetchJsonOrThrow, type UpstreamPolicy } from "../../../../../../lib/server/news/upstream";

const WIKIDATA_SPARQL = "https://query.wikidata.org/sparql";
const WIKIPEDIA_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary";

const WIKIDATA_POLICY: UpstreamPolicy = {
  key: "wikidata-trade-nodes",
  ttlMs: 7 * 24 * 60 * 60_000,
  staleTtlMs: 30 * 24 * 60 * 60_000,
  timeoutMs: 12_000,
  maxRetries: 1,
  backoffBaseMs: 900,
  circuitFailureThreshold: 3,
  circuitOpenMs: 120_000,
  rateLimit: { capacity: 1, refillPerSec: 1, minIntervalMs: 1100 },
};

const WIKIPEDIA_POLICY: UpstreamPolicy = {
  key: "wikipedia-trade-nodes",
  ttlMs: 7 * 24 * 60 * 60_000,
  staleTtlMs: 30 * 24 * 60 * 60_000,
  timeoutMs: 10_000,
  maxRetries: 1,
  backoffBaseMs: 700,
  circuitFailureThreshold: 3,
  circuitOpenMs: 120_000,
  rateLimit: { capacity: 1, refillPerSec: 1, minIntervalMs: 1100 },
};

function sanitizeQid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const q = value.trim();
  return /^Q\d+$/.test(q) ? q : null;
}

function wikipediaTitleFromUrl(url: string): string | null {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
    const title = decodeURIComponent(last).replace(/_/g, " ").trim();
    return title || null;
  } catch {
    return null;
  }
}

async function fetchWikidataByQid(qid: string) {
  const safe = sanitizeQid(qid);
  if (!safe) return { wikidata: null, degraded: false, error: "invalid-qid" as string | undefined };

  const result = await cachedFetch({
    cacheKey: `wikidata-trade:${safe}`,
    policy: WIKIDATA_POLICY,
    fallbackValue: null as {
      qid: string;
      label: string | null;
      description: string | null;
      wikipediaUrl: string | null;
      website: string | null;
      imageUrl: string | null;
      openSeaMapUrl: string | null;
      locode: string | null;
      iataCode: string | null;
    } | null,
    request: async () => {
      const query = `
SELECT ?item ?itemLabel ?itemDescription ?article ?website ?image ?locode ?iata WHERE {
  BIND(wd:${safe} AS ?item)
  OPTIONAL { ?item wdt:P856 ?website }
  OPTIONAL { ?item wdt:P18 ?image }
  OPTIONAL { ?item wdt:P982 ?locode }
  OPTIONAL { ?item wdt:P238 ?iata }
  OPTIONAL {
    ?article schema:about ?item .
    ?article schema:isPartOf <https://en.wikipedia.org/> .
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 1`.trim();

      const url = new URL(WIKIDATA_SPARQL);
      url.searchParams.set("query", query);
      url.searchParams.set("format", "json");

      const json = await fetchJsonOrThrow<{
        results?: {
          bindings?: Array<{
            item?: { value: string };
            itemLabel?: { value: string };
            itemDescription?: { value: string };
            article?: { value: string };
            website?: { value: string };
            image?: { value: string };
            locode?: { value: string };
            iata?: { value: string };
          }>;
        };
      }>(url.toString(), {
        headers: {
          "User-Agent": "WorldView/0.1 (research; trade-route-nodes enrichment)",
          Accept: "application/sparql-results+json",
        },
      }, WIKIDATA_POLICY.timeoutMs);

      const b = json.results?.bindings?.[0];
      if (!b) return null;
      const qidParsed = (b.item?.value ?? "").split("/").pop() ?? "";
      if (!/^Q\d+$/.test(qidParsed)) return null;

      // Wikimedia image URL → thumbnail
      let imageUrl: string | null = null;
      const rawImg = b.image?.value?.trim() ?? "";
      if (rawImg) {
        const filename = rawImg.split("/Special:FilePath/")[1] ?? rawImg.split("/File:")[1] ?? "";
        if (filename) {
          imageUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=400`;
        }
      }

      const openSeaMapUrl = `https://map.openseamap.org/?zoom=8&lat=${safe}&lon=${safe}`;

      return {
        qid: qidParsed,
        label: b.itemLabel?.value ?? null,
        description: b.itemDescription?.value ?? null,
        wikipediaUrl: b.article?.value ?? null,
        website: b.website?.value ?? null,
        imageUrl,
        openSeaMapUrl: null,
        locode: b.locode?.value ?? null,
        iataCode: b.iata?.value ?? null,
      };
    },
  });

  return { wikidata: result.data, degraded: result.degraded, error: result.error };
}

async function fetchWikipediaSummary(title: string) {
  const clean = title.trim();
  if (!clean) return { wikipedia: null, degraded: false };

  const result = await cachedFetch({
    cacheKey: `wiki-trade:${clean.toLowerCase()}`,
    policy: WIKIPEDIA_POLICY,
    fallbackValue: null as {
      title: string;
      extract: string | null;
      url: string;
      thumbnail: string | null;
    } | null,
    request: async () => {
      const url = `${WIKIPEDIA_SUMMARY}/${encodeURIComponent(clean.replace(/ /g, "_"))}`;
      const json = await fetchJsonOrThrow<{
        title?: string;
        extract?: string;
        content_urls?: { desktop?: { page?: string } };
        thumbnail?: { source?: string };
      }>(url, {
        headers: {
          "User-Agent": "WorldView/0.1 (research; trade-route-nodes enrichment)",
          Accept: "application/json",
        },
      }, WIKIPEDIA_POLICY.timeoutMs);

      const pageUrl =
        json.content_urls?.desktop?.page ??
        (json.title ? `https://en.wikipedia.org/wiki/${encodeURIComponent(json.title.replace(/ /g, "_"))}` : "");
      if (!json.title || !pageUrl) return null;

      return {
        title: json.title,
        extract: json.extract ?? null,
        url: pageUrl,
        thumbnail: json.thumbnail?.source ?? null,
      };
    },
  });

  return { wikipedia: result.data, degraded: result.degraded, error: result.error };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const qidRaw = searchParams.get("wikidataId") ?? "";
  const qid = sanitizeQid(qidRaw);

  if (!qid) {
    return NextResponse.json(
      { result: null, degraded: false, error: "missing-wikidataId" },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  const wikidata = await fetchWikidataByQid(qid);

  const wikiTitle = wikidata.wikidata?.wikipediaUrl
    ? wikipediaTitleFromUrl(wikidata.wikidata.wikipediaUrl)
    : null;
  const wikipedia = wikiTitle
    ? await fetchWikipediaSummary(wikiTitle)
    : { wikipedia: null, degraded: false };

  const degraded = Boolean(wikidata.degraded || wikipedia.degraded);

  return NextResponse.json(
    {
      result: {
        wikidata: wikidata.wikidata
          ? {
              qid: wikidata.wikidata.qid,
              label: wikidata.wikidata.label,
              description: wikidata.wikidata.description,
              url: `https://www.wikidata.org/wiki/${wikidata.wikidata.qid}`,
              wikipediaUrl: wikidata.wikidata.wikipediaUrl,
              website: wikidata.wikidata.website,
              imageUrl: wikidata.wikidata.imageUrl,
              locode: wikidata.wikidata.locode,
              iataCode: wikidata.wikidata.iataCode,
            }
          : null,
        wikipedia: wikipedia.wikipedia
          ? {
              title: wikipedia.wikipedia.title,
              extract: wikipedia.wikipedia.extract,
              url: wikipedia.wikipedia.url,
              thumbnail: wikipedia.wikipedia.thumbnail,
            }
          : null,
      },
      degraded,
      error: wikidata.error || wikipedia.error,
    },
    { headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } }
  );
}
