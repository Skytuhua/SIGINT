import { NextResponse } from "next/server";
import { reverseGeocodeNominatim } from "../../../../../lib/server/news/providers/nominatim";
import { cachedFetch, fetchJsonOrThrow, type UpstreamPolicy } from "../../../../../lib/server/news/upstream";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const WIKIDATA_SPARQL = "https://query.wikidata.org/sparql";
const WIKIPEDIA_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary";

const OVERPASS_POLICY: UpstreamPolicy = {
  key: "overpass-military-bases",
  ttlMs: 3 * 24 * 60 * 60_000,
  staleTtlMs: 14 * 24 * 60 * 60_000,
  timeoutMs: 18_000,
  maxRetries: 1,
  backoffBaseMs: 900,
  circuitFailureThreshold: 3,
  circuitOpenMs: 5 * 60_000,
  rateLimit: { capacity: 1, refillPerSec: 1, minIntervalMs: 1200 },
};

const WIKIDATA_POLICY: UpstreamPolicy = {
  key: "wikidata-military-bases",
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
  key: "wikipedia-summary",
  ttlMs: 7 * 24 * 60 * 60_000,
  staleTtlMs: 30 * 24 * 60 * 60_000,
  timeoutMs: 10_000,
  maxRetries: 1,
  backoffBaseMs: 700,
  circuitFailureThreshold: 3,
  circuitOpenMs: 120_000,
  rateLimit: { capacity: 1, refillPerSec: 1, minIntervalMs: 1100 },
};

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type OverpassResponse = {
  elements?: OverpassElement[];
};

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function buildOverpassQuery(lat: number, lon: number, radiusM: number): string {
  return `
[out:json][timeout:25];
(
  nwr["military"](around:${Math.round(radiusM)},${lat.toFixed(6)},${lon.toFixed(6)});
  nwr["landuse"="military"](around:${Math.round(radiusM)},${lat.toFixed(6)},${lon.toFixed(6)});
  nwr["boundary"="military"](around:${Math.round(radiusM)},${lat.toFixed(6)},${lon.toFixed(6)});
  nwr["military"="airfield"](around:${Math.round(radiusM)},${lat.toFixed(6)},${lon.toFixed(6)});
  nwr["military"="naval_base"](around:${Math.round(radiusM)},${lat.toFixed(6)},${lon.toFixed(6)});
  nwr["military"="barracks"](around:${Math.round(radiusM)},${lat.toFixed(6)},${lon.toFixed(6)});
);
out center tags;
`.trim();
}

function pickBestOverpassCandidate(lat: number, lon: number, raw: OverpassResponse): {
  name: string | null;
  elementType: "node" | "way" | "relation";
  elementId: number;
  elementUrl: string;
  tags: Record<string, string>;
  distanceKm: number;
} | null {
  const elements = raw.elements ?? [];
  let best: {
    el: OverpassElement;
    tags: Record<string, string>;
    distanceKm: number;
    score: number;
  } | null = null;

  for (const el of elements) {
    const tags = el.tags ?? {};
    const coord =
      el.type === "node"
        ? (typeof el.lat === "number" && typeof el.lon === "number" ? { lat: el.lat, lon: el.lon } : null)
        : el.center ?? null;
    if (!coord || !Number.isFinite(coord.lat) || !Number.isFinite(coord.lon)) continue;
    const distanceKm = haversineKm(lat, lon, coord.lat, coord.lon);

    const name = (tags.name ?? "").trim();
    const military = (tags.military ?? "").trim();
    const landuse = (tags.landuse ?? "").trim();

    let score = 0;
    if (name) score += 4;
    if (military) score += 3;
    if (landuse === "military") score += 2;
    if (tags.operator?.trim()) score += 1;
    if (tags.wikidata?.trim()) score += 5;
    if (tags.wikipedia?.trim()) score += 3;
    // Prefer closer features, but allow richer tags to win.
    score -= Math.min(100, distanceKm) * 0.6;

    if (!best || score > best.score) best = { el, tags, distanceKm, score };
  }

  if (!best) return null;
  const elementUrl = `https://www.openstreetmap.org/${best.el.type}/${best.el.id}`;
  const name =
    (best.tags["name:en"] ?? "").trim() ||
    (best.tags.name ?? "").trim() ||
    null;
  return {
    name,
    elementType: best.el.type,
    elementId: best.el.id,
    elementUrl,
    tags: best.tags,
    distanceKm: best.distanceKm,
  };
}

async function fetchOverpassCandidate(lat: number, lon: number): Promise<{
  osm: ReturnType<typeof pickBestOverpassCandidate>;
  degraded: boolean;
  error?: string;
}> {
  const roundedKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const result = await cachedFetch({
    cacheKey: `overpass:${roundedKey}`,
    policy: OVERPASS_POLICY,
    fallbackValue: null as ReturnType<typeof pickBestOverpassCandidate>,
    request: async () => {
      // Two-pass radius: tight first, then wider if nothing is found.
      const radii = [6000, 20000];
      for (const radiusM of radii) {
        const query = buildOverpassQuery(lat, lon, radiusM);
        const raw = await fetchJsonOrThrow<OverpassResponse>(
          OVERPASS_URL,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "User-Agent": "WorldView/0.1 (research; military-bases enrichment)",
              Accept: "application/json",
            },
            body: `data=${encodeURIComponent(query)}`,
          },
          OVERPASS_POLICY.timeoutMs
        );
        const picked = pickBestOverpassCandidate(lat, lon, raw);
        if (picked) return picked;
      }
      return null;
    },
  });

  return {
    osm: result.data,
    degraded: result.degraded,
    error: result.error,
  };
}

function sanitizeQid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const q = value.trim();
  return /^Q\d+$/.test(q) ? q : null;
}

function sanitizeSparqlLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function runWikidataSparql(query: string): Promise<{
  qid: string;
  label: string | null;
  description: string | null;
  wikipediaUrl: string | null;
  website: string | null;
  distanceKm: number | null;
} | null> {
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
        dist?: { value: string };
      }>;
    };
  }>(
    url.toString(),
    {
      headers: {
        "User-Agent": "WorldView/0.1 (research; military-bases enrichment)",
        Accept: "application/sparql-results+json",
      },
    },
    WIKIDATA_POLICY.timeoutMs
  );

  const binding = json.results?.bindings?.[0];
  const itemUri = binding?.item?.value ?? "";
  const qid = itemUri.split("/").pop() ?? "";
  if (!/^Q\d+$/.test(qid)) return null;
  return {
    qid,
    label: binding?.itemLabel?.value ?? null,
    description: binding?.itemDescription?.value ?? null,
    wikipediaUrl: binding?.article?.value ?? null,
    website: binding?.website?.value ?? null,
    distanceKm: binding?.dist?.value != null && Number.isFinite(Number(binding.dist.value)) ? Number(binding.dist.value) : null,
  };
}

async function fetchWikidataByQid(qid: string): Promise<{
  wikidata: {
    qid: string;
    label: string | null;
    description: string | null;
    url: string;
    wikipediaUrl: string | null;
    website: string | null;
    distanceKm: number | null;
  } | null;
  degraded: boolean;
  error?: string;
}> {
  const safe = sanitizeQid(qid);
  if (!safe) {
    return { wikidata: null, degraded: false, error: "invalid-qid" };
  }

  const result = await cachedFetch({
    cacheKey: `qid:${safe}`,
    policy: WIKIDATA_POLICY,
    fallbackValue: null as Awaited<ReturnType<typeof runWikidataSparql>>,
    request: async () => {
      const query = `
SELECT ?item ?itemLabel ?itemDescription ?article ?website WHERE {
  BIND(wd:${safe} AS ?item)
  OPTIONAL { ?item wdt:P856 ?website }
  OPTIONAL {
    ?article schema:about ?item .
    ?article schema:isPartOf <https://en.wikipedia.org/> .
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`.trim();
      return await runWikidataSparql(query);
    },
  });

  const row = result.data;
  if (!row) {
    return { wikidata: null, degraded: result.degraded, error: result.error };
  }

  return {
    wikidata: {
      qid: row.qid,
      label: row.label,
      description: row.description,
      url: `https://www.wikidata.org/wiki/${row.qid}`,
      wikipediaUrl: row.wikipediaUrl,
      website: row.website,
      distanceKm: row.distanceKm,
    },
    degraded: result.degraded,
    error: result.error,
  };
}

async function fetchNearbyWikidata(lat: number, lon: number, hint?: string | null): Promise<{
  wikidata: {
    qid: string;
    label: string | null;
    description: string | null;
    url: string;
    wikipediaUrl: string | null;
    website: string | null;
    distanceKm: number | null;
  } | null;
  degraded: boolean;
  error?: string;
}> {
  const roundedKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const hintKey = hint ? hint.trim().toLowerCase().slice(0, 48) : "";
  const result = await cachedFetch({
    cacheKey: `near:${roundedKey}:${hintKey}`,
    policy: WIKIDATA_POLICY,
    fallbackValue: null as Awaited<ReturnType<typeof runWikidataSparql>>,
    request: async () => {
      const hintFilter = hint && hint.trim().length > 2
        ? `FILTER(CONTAINS(LCASE(STR(?itemLabel)), LCASE("${sanitizeSparqlLiteral(hint.trim())}")))`
        : "";
      const query = `
SELECT ?item ?itemLabel ?itemDescription ?article ?website ?dist WHERE {
  SERVICE wikibase:around {
    ?item wdt:P625 ?loc .
    bd:serviceParam wikibase:center "Point(${lon.toFixed(6)} ${lat.toFixed(6)})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "60" .
    bd:serviceParam wikibase:distance ?dist .
  }
  ?item wdt:P31/wdt:P279* ?class .
  VALUES ?class { wd:Q245016 wd:Q695850 wd:Q1324633 } .
  OPTIONAL { ?item wdt:P856 ?website }
  OPTIONAL {
    ?article schema:about ?item .
    ?article schema:isPartOf <https://en.wikipedia.org/> .
  }
  ${hintFilter}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY ?dist
LIMIT 1
`.trim();
      return await runWikidataSparql(query);
    },
  });

  const row = result.data;
  if (!row) return { wikidata: null, degraded: result.degraded, error: result.error };
  return {
    wikidata: {
      qid: row.qid,
      label: row.label,
      description: row.description,
      url: `https://www.wikidata.org/wiki/${row.qid}`,
      wikipediaUrl: row.wikipediaUrl,
      website: row.website,
      distanceKm: row.distanceKm,
    },
    degraded: result.degraded,
    error: result.error,
  };
}

function wikipediaTitleFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() ?? "";
    const decoded = decodeURIComponent(last);
    const title = decoded.replace(/_/g, " ").trim();
    return title ? title : null;
  } catch {
    return null;
  }
}

async function fetchWikipediaSummary(title: string): Promise<{
  wikipedia: { title: string; extract: string | null; url: string } | null;
  degraded: boolean;
  error?: string;
}> {
  const clean = title.trim();
  if (!clean) return { wikipedia: null, degraded: false };

  const result = await cachedFetch({
    cacheKey: `title:${clean.toLowerCase()}`,
    policy: WIKIPEDIA_POLICY,
    fallbackValue: null as { title: string; extract: string | null; content_urls?: { desktop?: { page?: string } } } | null,
    request: async () => {
      const url = `${WIKIPEDIA_SUMMARY}/${encodeURIComponent(clean.replace(/ /g, "_"))}`;
      return await fetchJsonOrThrow<{
        title?: string;
        extract?: string;
        content_urls?: { desktop?: { page?: string } };
      }>(
        url,
        {
          headers: {
            "User-Agent": "WorldView/0.1 (research; military-bases enrichment)",
            Accept: "application/json",
          },
        },
        WIKIPEDIA_POLICY.timeoutMs
      );
    },
  });

  const payload = result.data;
  const url = payload?.content_urls?.desktop?.page ?? (payload?.title ? `https://en.wikipedia.org/wiki/${encodeURIComponent(payload.title.replace(/ /g, "_"))}` : "");
  if (!payload?.title || !url) return { wikipedia: null, degraded: result.degraded, error: result.error };

  return {
    wikipedia: {
      title: payload.title,
      extract: payload.extract ?? null,
      url,
    },
    degraded: result.degraded,
    error: result.error,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const latRaw = searchParams.get("lat");
  const lonRaw = searchParams.get("lon");
  const lat = latRaw == null ? Number.NaN : Number(latRaw);
  const lon = lonRaw == null ? Number.NaN : Number(lonRaw);

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json(
      { result: null, degraded: false, error: "invalid-lat-lon" },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  const [place, overpass] = await Promise.all([
    reverseGeocodeNominatim(lat, lon),
    fetchOverpassCandidate(lat, lon),
  ]);

  const osm = overpass.osm;
  const qidFromOsm = sanitizeQid(osm?.tags?.wikidata);
  const nameHint = osm?.name ?? osm?.tags?.name ?? null;

  const wikidata = qidFromOsm ? await fetchWikidataByQid(qidFromOsm) : await fetchNearbyWikidata(lat, lon, nameHint);
  const wikiTitle =
    (wikidata.wikidata?.wikipediaUrl ? wikipediaTitleFromUrl(wikidata.wikidata.wikipediaUrl) : null) ??
    (osm?.tags?.wikipedia?.includes(":")
      ? osm?.tags?.wikipedia?.split(":").slice(1).join(":").replace(/_/g, " ").trim() ?? null
      : null);
  const wikipedia = wikiTitle ? await fetchWikipediaSummary(wikiTitle) : { wikipedia: null, degraded: false as const };

  const degraded = Boolean(place.degraded || overpass.degraded || wikidata.degraded || wikipedia.degraded);

  return NextResponse.json(
    {
      result: {
        place: place.data
          ? {
              displayName: place.data.displayName,
              country: place.data.country,
              countryCode: place.data.countryCode,
            }
          : null,
        osm: osm
          ? {
              name: osm.name,
              elementType: osm.elementType,
              elementId: osm.elementId,
              elementUrl: osm.elementUrl,
              tags: osm.tags,
              distanceKm: Math.round((osm.distanceKm ?? 0) * 10) / 10,
            }
          : null,
        wikidata: wikidata.wikidata
          ? {
              ...wikidata.wikidata,
              distanceKm:
                wikidata.wikidata.distanceKm != null
                  ? Math.round(wikidata.wikidata.distanceKm * 10) / 10
                  : null,
            }
          : null,
        wikipedia: wikipedia.wikipedia
          ? {
              title: wikipedia.wikipedia.title,
              extract: wikipedia.wikipedia.extract,
              url: wikipedia.wikipedia.url,
            }
          : null,
      },
      degraded,
      error: place.error || overpass.error || wikidata.error || wikipedia.error,
    },
    { headers: { "Cache-Control": "public, max-age=86400" } }
  );
}

