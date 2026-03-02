import { CATEGORY_LABELS } from "../../../config/newsConfig";
import { categorizeArticle } from "../../news/engine/categorize";
import { canonicalizeUrl, dedupeArticles, stableArticleId } from "../../news/engine/dedupe";
import { scoreArticle } from "../../news/engine/score";
import { threadArticles } from "../../news/engine/thread";
import { normalizeQueryAst } from "../../news/query/normalize";
import { parseQuery } from "../../news/query/parse";
import { routeQuery } from "../../news/query/routeQuery";
import { stringifyQueryAst } from "../../news/query/stringify";
import type {
  GdeltArticle,
  GeoMarker,
  NewsArticle,
  NewsFacetState,
  QueryAST,
  SearchRouteResult,
  SuggestionItem,
  YouTubeLive,
} from "../../news/types";
import { getGdeltArticles, getGdeltGeo } from "./providers/gdelt";
import { geocodeNominatim } from "./providers/nominatim";
import { getRssArticles } from "./providers/rss";
import { fetchSecCompanyFilings, fetchSecTickerMap, searchSecFilings } from "./providers/sec";
import { fetchWikidataEntity } from "./providers/wikidata";
import { discoverYouTubeLiveStreams } from "./providers/youtube";

function parseGdeltDate(value: string): number {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!m) return Date.now();
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
  const ts = Date.parse(iso);
  return Number.isFinite(ts) ? ts : Date.now();
}

function sortDeterministic(a: Pick<NewsArticle, "publishedAt" | "score" | "id">, b: Pick<NewsArticle, "publishedAt" | "score" | "id">): number {
  if (a.publishedAt !== b.publishedAt) return b.publishedAt - a.publishedAt;
  if (a.score !== b.score) return b.score - a.score;
  return a.id.localeCompare(b.id);
}

function toNewsArticle(article: GdeltArticle): NewsArticle {
  const publishedAt = parseGdeltDate(article.seendate);
  const cat = categorizeArticle({
    headline: article.title,
    snippet: "",
    source: article.domain,
    domain: article.domain,
  });
  const item: NewsArticle = {
    id: "",
    headline: article.title || article.url,
    url: article.url,
    canonicalUrl: canonicalizeUrl(article.url),
    domain: article.domain || "unknown",
    source: article.domain || "GDELT",
    publishedAt,
    snippet: "",
    imageUrl: article.socialimage,
    language: article.language || "unknown",
    country: article.sourcecountry || undefined,
    category: cat.category,
    score: 0,
    backendSource: "gdelt",
    provenance: {
      headlineSource: "gdelt",
      coordsSource: "none",
      entitySource: "none",
      confidence: 0.8,
    },
  };
  item.id = stableArticleId(item);
  return item;
}

function toFacet(items: NewsArticle[], key: "source" | "category" | "language" | "country"): Array<{
  key: string;
  label: string;
  count: number;
}> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value =
      key === "source"
        ? item.source
        : key === "category"
          ? item.category
          : key === "language"
            ? item.language
            : item.country ?? "unknown";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([k, count]) => ({
      key: k,
      label: key === "category" ? (CATEGORY_LABELS as Record<string, string>)[k] ?? k : k,
      count,
    }));
}

function buildFacets(items: NewsArticle[]): NewsFacetState {
  const coordCounts = {
    with: items.filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon)).length,
    without: items.filter((item) => !(Number.isFinite(item.lat) && Number.isFinite(item.lon))).length,
  };

  return {
    sources: toFacet(items, "source"),
    categories: toFacet(items, "category"),
    languages: toFacet(items, "language"),
    regions: toFacet(items, "country"),
    coordAvailability: [
      { key: "with", label: "Has Coordinates", count: coordCounts.with },
      { key: "without", label: "No Coordinates", count: coordCounts.without },
    ],
  };
}

function parseBbox(raw?: string | null): { west: number; south: number; east: number; north: number } | null {
  if (!raw) return null;
  const parts = raw.split(",").map((p) => Number(p.trim()));
  if (parts.length !== 4) return null;
  const [west, south, east, north] = parts;
  if (![west, south, east, north].every(Number.isFinite)) return null;
  return { west, south, east, north };
}

function inBbox(lat: number, lon: number, bbox: { west: number; south: number; east: number; north: number }): boolean {
  const latOk = lat >= bbox.south && lat <= bbox.north;
  const lonOk = bbox.west <= bbox.east ? lon >= bbox.west && lon <= bbox.east : lon >= bbox.west || lon <= bbox.east;
  return latOk && lonOk;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function applyUrlParamOverrides(ast: QueryAST, searchParams: URLSearchParams): QueryAST {
  const next = { ...ast };
  const cat = searchParams.get("cat");
  if (cat) next.cat = cat as QueryAST["cat"];
  const src = searchParams.get("src");
  if (src) next.src = src.split(/[|,]/g).map((v) => v.trim()).filter(Boolean);
  const country = searchParams.get("country");
  if (country) next.country = country.toUpperCase();
  const timespan = searchParams.get("timespan");
  if (timespan) next.timespan = timespan as QueryAST["timespan"];
  const from = searchParams.get("from");
  if (from) next.fromDate = from;
  const to = searchParams.get("to");
  if (to) next.toDate = to;
  const has = searchParams.get("has");
  if (has) {
    next.has = has
      .split(/[|,]/g)
      .map((v) => v.trim().toLowerCase())
      .filter((v): v is "video" | "coords" => v === "video" || v === "coords");
  }
  return normalizeQueryAst(next);
}

function newsToMarker(item: NewsArticle): GeoMarker | null {
  if (!Number.isFinite(item.lat) || !Number.isFinite(item.lon)) return null;
  return {
    id: `marker-${item.id}`,
    articleId: item.id,
    lat: item.lat as number,
    lon: item.lon as number,
    headline: item.headline,
    source: item.source,
    publishedAt: item.publishedAt,
    category: item.category,
    coordSource: item.coordSource ?? "none",
    confidence: item.coordConfidence ?? 0.5,
  };
}

function backendState(result: { degraded: boolean; error?: string }): "ok" | "degraded" | "open_circuit" {
  if (result.error?.includes("circuit-open")) return "open_circuit";
  if (result.degraded) return "degraded";
  return "ok";
}

type SourceHealthState = {
  status: "live" | "cached" | "degraded" | "unavailable";
  lastSuccessAt: number | null;
  errorCode: string | null;
  nextRetryAt: number | null;
};

function resultError(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const value = (result as { error?: unknown }).error;
  return typeof value === "string" ? value : undefined;
}

function normalizeErrorCode(error: string | undefined): string | null {
  if (!error) return null;
  const lower = error.toLowerCase();
  if (lower.includes("circuit-open")) return "circuit_open";
  if (lower.includes("timeout")) return "timeout";
  if (lower.includes("429")) return "rate_limited";
  if (lower.includes("500")) return "server_error";
  if (lower.includes("network")) return "network_error";
  return "upstream_error";
}

function buildSourceHealth(result: {
  degraded: boolean;
  error?: string;
  cacheHit?: "fresh" | "stale" | "miss";
  hasData: boolean;
}): SourceHealthState {
  const now = Date.now();
  const status = !result.degraded
    ? "live"
    : result.cacheHit === "stale"
      ? "cached"
      : result.hasData
        ? "degraded"
        : "unavailable";
  const errorCode = normalizeErrorCode(result.error);
  return {
    status,
    lastSuccessAt: status === "live" || status === "cached" ? now : null,
    errorCode,
    nextRetryAt:
      errorCode === "circuit_open" || errorCode === "rate_limited" ? now + 30_000 : null,
  };
}

function toYoutubeNewsArticle(stream: YouTubeLive, mode: "live" | "fallback"): NewsArticle {
  const parsedPublishedAt = stream.publishedAt ? Date.parse(stream.publishedAt) : NaN;
  const item: NewsArticle = {
    id: "",
    headline: stream.title,
    url: stream.sourceUrl,
    canonicalUrl: canonicalizeUrl(stream.sourceUrl),
    domain: "youtube.com",
    source: stream.channelName,
    publishedAt: Number.isFinite(parsedPublishedAt) ? parsedPublishedAt : Date.now(),
    snippet:
      mode === "live"
        ? stream.status === "live"
          ? "Live stream"
          : "Recent stream"
        : stream.status === "live"
          ? "Live stream fallback (news upstream degraded)."
          : "Recent stream fallback (news upstream degraded).",
    imageUrl: stream.thumbnailUrl,
    language: "unknown",
    category: "world",
    score: mode === "live" ? 48 : stream.status === "live" ? 58 : 45,
    backendSource: "youtube",
    provenance: {
      headlineSource: "youtube",
      coordsSource: "none",
      entitySource: "none",
      confidence: mode === "live" ? 0.65 : 0.61,
    },
  };
  item.id = stableArticleId(item);
  return item;
}

export async function executeNewsSearch(searchParams: URLSearchParams): Promise<SearchRouteResult> {
  const rawQ = searchParams.get("q") ?? "";
  const mapMode = (searchParams.get("mode") ?? "pointdata") as "pointdata" | "country" | "adm1";
  const inView = searchParams.get("inView") === "true";
  const bbox = parseBbox(searchParams.get("bbox"));
  const offset = Math.max(0, Number(searchParams.get("offset") ?? "0") || 0);
  const limit = Math.min(400, Math.max(1, Number(searchParams.get("limit") ?? "160") || 160));

  let ast = parseQuery(rawQ);
  ast = applyUrlParamOverrides(ast, searchParams);
  const normalizedQuery = stringifyQueryAst(ast);
  const rawQueryTerms = [ast.sym, ast.place, ...ast.freeText].filter(Boolean);
  const stopwordTerms = new Set(["news"]);
  const filteredQueryTerms = rawQueryTerms
    .map((t) => String(t).toLowerCase().trim())
    .filter((term) => term && !stopwordTerms.has(term));
  const queryTerms = filteredQueryTerms.join(" ");
  const domainFilter = ast.src?.find((s) => s !== "gdelt" && s !== "sec" && s !== "rss");
  const plan = routeQuery(ast, {
    requireCoords: Boolean(
      ast.has?.includes("coords") ||
      ast.near ||
      ast.place ||
      ast.country ||
      inView ||
      mapMode !== "pointdata"
    ),
    includeVideo: ast.has?.includes("video") ?? false,
    mapMode,
  });

  const backendLatency: Record<string, number> = {};
  const degraded: Record<string, boolean> = {};

  const gdeltPromise = plan.useGdeltDoc
    ? getGdeltArticles({
        q: queryTerms,
        cat: ast.cat,
        country: ast.country,
        domain: domainFilter,
        timespan: ast.timespan,
        from: ast.fromDate,
        to: ast.toDate,
      })
    : Promise.resolve({ data: [], degraded: false, latencyMs: 0, cacheHit: "miss" as const });

  const rssPromise = plan.useRss
    ? getRssArticles({
        q: queryTerms,
        cat: ast.cat,
        domain: domainFilter,
        maxItems: 260,
      })
    : Promise.resolve({
        data: { items: [], feedsChecked: 0, degradedFeeds: [] },
        degraded: false,
        latencyMs: 0,
        cacheHit: "miss" as const,
        error: undefined,
      });

  const geoPromise = plan.useGdeltGeo
    ? getGdeltGeo({
        q: [ast.place, ast.country, ast.sym, ...ast.freeText].filter(Boolean).join(" "),
        timespan: ast.timespan,
        from: ast.fromDate,
        to: ast.toDate,
        mode: mapMode,
      })
    : Promise.resolve({
        data: { mode: mapMode, points: [], aggregates: [] },
        degraded: false,
        latencyMs: 0,
        cacheHit: "miss" as const,
      });

  const secPromise = plan.useSec
    ? (async () => {
        if (ast.cik) return fetchSecCompanyFilings(ast.cik);
        if (ast.sym) {
          const tickerMap = await fetchSecTickerMap();
          const cik = tickerMap.data[ast.sym];
          if (cik) {
            const filings = await fetchSecCompanyFilings(cik);
            return {
              data: filings.data,
              degraded: tickerMap.degraded || filings.degraded,
              latencyMs: tickerMap.latencyMs + filings.latencyMs,
              cacheHit: filings.cacheHit,
            };
          }
        }
        return searchSecFilings({
          q: [ast.sym, ...ast.freeText].filter(Boolean).join(" "),
          form: ast.filingForm,
          from: ast.fromDate,
          to: ast.toDate,
        });
      })()
    : Promise.resolve({ data: [], degraded: false, latencyMs: 0, cacheHit: "miss" as const });

  const wikidataPromise = plan.useWikidata
    ? fetchWikidataEntity({ ticker: ast.sym, company: ast.freeText[0] })
    : Promise.resolve({ data: null, degraded: false, latencyMs: 0, cacheHit: "miss" as const });

  const youtubePromise = plan.useYoutube
    ? discoverYouTubeLiveStreams(process.env.YOUTUBE_API_KEY)
    : Promise.resolve({
        data: {
          items: [],
          channelsChecked: 0,
          liveCount: 0,
          degraded: [],
          keyMissing: !process.env.YOUTUBE_API_KEY,
          discoverySource: "youtube-data-api" as const,
          fallbackActive: false,
        },
        degraded: false,
        latencyMs: 0,
        cacheHit: "miss" as const,
      });

  const [gdeltResult, rssResult, geoResult, secResult, wikidataResult, youtubeInitialResult] = await Promise.all([
    gdeltPromise,
    rssPromise,
    geoPromise,
    secPromise,
    wikidataPromise,
    youtubePromise,
  ]);
  const youtubeResult = youtubeInitialResult;
  const rssDegraded = rssResult.degraded || rssResult.data.degradedFeeds.length > 0;

  backendLatency.gdelt = gdeltResult.latencyMs;
  backendLatency.rss = rssResult.latencyMs;
  backendLatency.geo = geoResult.latencyMs;
  backendLatency.sec = secResult.latencyMs;
  backendLatency.wikidata = wikidataResult.latencyMs;
  backendLatency.youtube = youtubeResult.latencyMs;

  degraded.gdelt = gdeltResult.degraded;
  degraded.rss = rssDegraded;
  degraded.geo = geoResult.degraded;
  degraded.sec = secResult.degraded;
  degraded.wikidata = wikidataResult.degraded;
  degraded.youtube = youtubeResult.degraded;

  const backendHealth: Record<string, "ok" | "degraded" | "open_circuit"> = {
    gdelt: backendState(gdeltResult),
    rss: backendState({ degraded: rssDegraded, error: rssResult.error }),
    geo: backendState(geoResult),
    sec: backendState(secResult),
    wikidata: backendState(wikidataResult),
    youtube: backendState(youtubeResult),
  };
  const sourceHealth: Record<
    string,
    {
      status: "live" | "cached" | "degraded" | "unavailable";
      lastSuccessAt: number | null;
      errorCode: string | null;
      nextRetryAt: number | null;
    }
  > = {
    gdelt: buildSourceHealth({
      degraded: gdeltResult.degraded,
      error: resultError(gdeltResult),
      cacheHit: gdeltResult.cacheHit,
      hasData: gdeltResult.data.length > 0,
    }),
    rss: buildSourceHealth({
      degraded: rssDegraded,
      error: rssResult.error,
      cacheHit: rssResult.cacheHit,
      hasData: rssResult.data.items.length > 0,
    }),
    geo: buildSourceHealth({
      degraded: geoResult.degraded,
      error: resultError(geoResult),
      cacheHit: geoResult.cacheHit,
      hasData: geoResult.data.points.length > 0 || geoResult.data.aggregates.length > 0,
    }),
    sec: buildSourceHealth({
      degraded: secResult.degraded,
      error: resultError(secResult),
      cacheHit: secResult.cacheHit,
      hasData: secResult.data.length > 0,
    }),
    wikidata: buildSourceHealth({
      degraded: wikidataResult.degraded,
      error: resultError(wikidataResult),
      cacheHit: wikidataResult.cacheHit,
      hasData: Boolean(wikidataResult.data),
    }),
    youtube: buildSourceHealth({
      degraded: youtubeResult.degraded,
      error: resultError(youtubeResult),
      cacheHit: youtubeResult.cacheHit,
      hasData: youtubeResult.data.items.length > 0,
    }),
  };

  let items: NewsArticle[] = [
    ...rssResult.data.items,
    ...gdeltResult.data.map((article) => toNewsArticle(article)),
    ...secResult.data.map((filing) => ({
      id: filing.id,
      headline: filing.headline,
      url: filing.url,
      canonicalUrl: canonicalizeUrl(filing.url),
      domain: filing.domain,
      source: filing.source,
      publishedAt: filing.publishedAt,
      snippet: filing.snippet,
      language: filing.language,
      category: "filings" as const,
      score: filing.score,
      entity: filing.entity,
      backendSource: "sec" as const,
      provenance: {
        headlineSource: "sec" as const,
        coordsSource: "none" as const,
        entitySource: "sec" as const,
        confidence: 0.95,
      },
    })),
  ];

  const searchStopwords = new Set(["news"]);
  const searchTerms = [ast.sym, ast.place, ...ast.freeText]
    .filter(Boolean)
    .map((t) => String(t).toLowerCase().trim())
    .filter((term) => term && !searchStopwords.has(term));
  if (searchTerms.length > 0) {
    items = items.filter((item) => {
      const text = `${item.headline} ${item.snippet ?? ""} ${item.entity ?? ""} ${item.placeName ?? ""}`.toLowerCase();
      return searchTerms.some((term) => term.length > 0 && text.includes(term));
    });
  }

  const blockedDomains = ["producthunt.com"];
  const blockedSourceLabels = ["product hunt"];
  items = items.filter((item) => {
    const domain = item.domain.toLowerCase();
    const source = (item.source ?? "").toLowerCase();
    if (blockedDomains.some((d) => domain.includes(d))) return false;
    if (blockedSourceLabels.some((s) => source.includes(s))) return false;
    return true;
  });

  const pointByCanonical = new Map<string, { lat: number; lon: number; name: string; confidence: number }>();
  for (const point of geoResult.data.points) {
    const key = point.topart?.url ? canonicalizeUrl(point.topart.url) : "";
    if (key && !pointByCanonical.has(key)) {
      pointByCanonical.set(key, {
        lat: point.lat,
        lon: point.lon,
        name: point.fullname || point.name,
        confidence: 0.9,
      });
    }
  }

  for (const item of items) {
    const point = pointByCanonical.get(item.canonicalUrl);
    if (point) {
      item.lat = point.lat;
      item.lon = point.lon;
      item.placeName = point.name;
      item.coordSource = "gdelt-geo";
      item.coordConfidence = point.confidence;
      item.provenance.coordsSource = "gdelt-geo";
      continue;
    }

    if ((!Number.isFinite(item.lat) || !Number.isFinite(item.lon)) && wikidataResult.data?.lat && wikidataResult.data?.lon) {
      item.lat = wikidataResult.data.lat;
      item.lon = wikidataResult.data.lon;
      item.placeName = wikidataResult.data.label;
      item.coordSource = "wikidata";
      item.coordConfidence = 0.62;
      item.provenance.coordsSource = "wikidata";
      item.provenance.entitySource = "wikidata";
    }
  }

  if ((!items.some((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon))) && ast.place) {
    const nominatim = await geocodeNominatim(ast.place);
    backendLatency.nominatim = nominatim.latencyMs;
    degraded.nominatim = nominatim.degraded;
    backendHealth.nominatim = backendState(nominatim);
    sourceHealth.nominatim = buildSourceHealth({
      degraded: nominatim.degraded,
      error: nominatim.error,
      cacheHit: nominatim.cacheHit,
      hasData: Boolean(nominatim.data),
    });
    if (nominatim.data) {
      for (const item of items.slice(0, 30)) {
        if (Number.isFinite(item.lat) && Number.isFinite(item.lon)) continue;
        item.lat = nominatim.data.lat;
        item.lon = nominatim.data.lon;
        item.placeName = nominatim.data.displayName;
        item.coordSource = "nominatim";
        item.coordConfidence = Math.max(0.35, Math.min(0.75, nominatim.data.importance));
        item.provenance.coordsSource = "nominatim";
      }
    }
  }

  const watchlist = {
    tickers: [],
    topics: [],
    regions: [],
    sources: [],
  };
  for (const item of items) {
    item.score = scoreArticle(item, watchlist);
    item.region = item.country ?? item.placeName ?? undefined;
  }

  items = dedupeArticles(items);
  const threaded = threadArticles(items);
  items = threaded.items;

  if (ast.cat) items = items.filter((item) => item.category === ast.cat);
  if (ast.src?.length) {
    const srcSet = new Set(ast.src.map((src) => src.toLowerCase()));
    items = items.filter((item) => {
      const domain = item.domain.toLowerCase();
      if (item.backendSource === "sec" && srcSet.has("sec")) return true;
      if (item.backendSource === "gdelt" && srcSet.has("gdelt")) return true;
      if (item.backendSource === "rss" && srcSet.has("rss")) return true;
      return Array.from(srcSet).some((src) => domain.includes(src));
    });
  }
  if (ast.has?.includes("coords")) {
    items = items.filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon));
  }
  if (ast.near) {
    items = items.filter((item) => {
      if (!Number.isFinite(item.lat) || !Number.isFinite(item.lon)) return false;
      return (
        haversineKm(ast.near!.lat, ast.near!.lon, item.lat as number, item.lon as number) <= ast.near!.km
      );
    });
  }
  if (inView && bbox) {
    items = items.filter((item) => {
      if (!Number.isFinite(item.lat) || !Number.isFinite(item.lon)) return false;
      return inBbox(item.lat as number, item.lon as number, bbox);
    });
  }
  if (ast.has?.includes("video")) {
    const videoDomains = ["youtube.com", "youtu.be", "reuters.com", "bloomberg.com", "apnews.com"];
    items = items.filter((item) => videoDomains.some((domain) => item.domain.includes(domain)));
    if (!items.length && youtubeResult.data.items.length) {
      items = youtubeResult.data.items.map((stream) => toYoutubeNewsArticle(stream, "live"));
    }
  }

  if (!items.length && plan.useYoutube && youtubeResult.data.items.length) {
    items = youtubeResult.data.items.slice(0, 40).map((stream) => toYoutubeNewsArticle(stream, "fallback"));
  }

  items = [...items].sort(sortDeterministic);
  const facets = buildFacets(items);
  const markers = items.map(newsToMarker).filter((marker): marker is GeoMarker => Boolean(marker));
  const paged = items.slice(offset, offset + limit);
  const activeConstraints = {
    inView: inView && Boolean(bbox),
    near: Boolean(ast.near),
    hasCoords: Boolean(ast.has?.includes("coords")),
    cat: ast.cat,
    src: ast.src,
  };
  const primaryUnavailable = backendHealth.gdelt !== "ok" && backendHealth.rss !== "ok";
  const hasVideoFallback = plan.useYoutube && youtubeResult.data.items.length > 0;
  const emptyReason = !items.length
    ? primaryUnavailable
      ? plan.useYoutube
        ? hasVideoFallback
          ? "Primary text-news upstream is degraded. Try removing restrictive filters to view video fallback items."
          : "Primary text-news upstream is degraded and no video fallback items are available. Check connectivity or relax filters."
        : "Primary text-news upstream is degraded. Check connectivity or relax filters."
      : "No stories matched current constraints. Relax filters, disable Search In View, or widen time range."
    : null;

  return {
    items: paged.map((item) => ({
      ...item,
      recencyMinutes: Math.max(1, Math.floor((Date.now() - item.publishedAt) / 60_000)),
      watchlistHits: 0,
      keywordScore: Math.min(30, Math.round(item.score * 0.3)),
      filingBoost: item.category === "filings" ? 12 : 0,
    })),
    markers,
    facets,
    total: items.length,
    degraded,
    backendLatency,
    backendHealth,
    sourceHealth,
    timeline: [],
    emptyReason,
    fallbackApplied: [],
    activeConstraints,
    queryEcho: {
      raw: rawQ,
      normalized: normalizedQuery,
      ast,
    },
  };
}

const OPERATOR_HINTS = [
  "sym:",
  "cik:",
  "src:",
  "cat:",
  "place:",
  "country:",
  "near:",
  "time:",
  "from:",
  "to:",
  "type:",
  "form:",
  "has:",
];

export async function buildSuggestions(searchParams: URLSearchParams): Promise<SuggestionItem[]> {
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.max(1, Math.min(20, Number(searchParams.get("limit") ?? "8") || 8));
  if (!q) {
    return OPERATOR_HINTS.slice(0, limit).map((hint) => ({
      label: hint,
      value: hint,
      type: "operator",
      confidence: 0.5,
    }));
  }

  const lower = q.toLowerCase();
  const suggestions: SuggestionItem[] = [];
  for (const hint of OPERATOR_HINTS) {
    if (hint.startsWith(lower) || lower.startsWith(hint)) {
      suggestions.push({
        label: hint,
        value: hint,
        type: "operator",
        confidence: 0.9,
      });
    }
  }

  if (/^[a-z]{1,5}$/i.test(q)) {
    const entity = await fetchWikidataEntity({ ticker: q.toUpperCase() });
    if (entity.data) {
      suggestions.push({
        label: `${entity.data.label} (${q.toUpperCase()})`,
        value: `sym:${q.toUpperCase()}`,
        type: "entity",
        confidence: 0.88,
      });
    }
  }

  if (!suggestions.length) {
    suggestions.push({
      label: q,
      value: q,
      type: "topic",
      confidence: 0.5,
    });
  }

  return suggestions.slice(0, limit);
}
