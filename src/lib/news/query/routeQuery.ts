import type { QueryAST, QueryRoutingPlan } from "../types";

interface RouteOptions {
  requireCoords?: boolean;
  includeVideo?: boolean;
  mapMode?: "pointdata" | "country" | "adm1";
}

const BROAD_STOPWORDS = new Set(["news"]);

function hasMeaningfulFreeText(ast: QueryAST): boolean {
  return ast.freeText.some((term) => {
    const t = String(term).trim();
    if (!t) return false;
    const lower = t.toLowerCase();
    if (BROAD_STOPWORDS.has(lower)) return false;
    return lower.length >= 2;
  });
}

function looksCompanyLike(ast: QueryAST): boolean {
  if (ast.sym || ast.cik) return true;
  const blocked = new Set(["AI", "US", "USA", "EU", "UK", "UAE", "UN", "NATO"]);
  return ast.freeText.some((term) => {
    if (term.length < 3 || term.length > 8) return false;
    if (blocked.has(term)) return false;
    return /^[A-Z.\-]+$/.test(term);
  });
}

export function routeQuery(ast: QueryAST, options: RouteOptions = {}): QueryRoutingPlan {
  const reasons: string[] = [];
  const srcSet = new Set(ast.src ?? []);

  const filingQuery = Boolean(ast.type === "filing" || ast.filingForm || ast.cik);
  const meaningfulText = hasMeaningfulFreeText(ast);
  const hasNonFilingIntent = Boolean(
    meaningfulText || (ast.cat && ast.cat !== "filings") || ast.place || ast.country || ast.near
  );
  const hasLocationSignals = Boolean(ast.place || ast.country || ast.near);
  const hasTimespan = Boolean(ast.timespan);
  const timespanOnlyBroad = Boolean(hasTimespan && !meaningfulText && !ast.cat && !hasLocationSignals);

  const useSec = filingQuery || ast.src?.includes("sec") === true;
  if (useSec) reasons.push("sec:filing-signals");

  // Enable GDELT for all non-filing queries. GDELT provides the broadest
  // corpus of news articles. Even for empty browse queries, GDELT is valuable
  // because it populates the cache for subsequent requests.
  const useGdeltDoc =
    !filingQuery || (ast.src?.includes("gdelt") ?? false);
  if (useGdeltDoc) reasons.push("gdelt-doc:news-content");

  // RSS is always enabled for non-filing queries — it's the most reliable
  // backend for the default "browse recent news" case and provides diverse sources.
  const wantsRssExplicit = srcSet.has("rss");
  const useRss =
    wantsRssExplicit ||
    (!filingQuery &&
      (srcSet.size === 0 ||
        (srcSet.size > 0 && !srcSet.has("sec") && !srcSet.has("gdelt"))));
  if (useRss) reasons.push("rss:free-headlines");

  const wantsNewsApiExplicit = srcSet.has("newsapi");
  const worldishCategory = !ast.cat || ast.cat === "world";
  const newsApiIntent = Boolean(
    worldishCategory && (meaningfulText || hasLocationSignals || timespanOnlyBroad)
  );
  const useNewsApi =
    wantsNewsApiExplicit ||
    (!filingQuery && srcSet.size === 0 && newsApiIntent);
  if (useNewsApi) reasons.push("newsapi:world-content");

  const needsCoords = Boolean(
    options.requireCoords ||
      ast.has?.includes("coords") ||
      ast.place ||
      ast.country ||
      ast.near ||
      options.mapMode
  );
  const useGdeltGeo = useGdeltDoc && needsCoords;
  if (useGdeltGeo) reasons.push("gdelt-geo:coords-required");

  const useWikidata = looksCompanyLike(ast);
  if (useWikidata) reasons.push("wikidata:entity-enrichment");

  const useYoutube = Boolean(options.includeVideo || ast.has?.includes("video"));
  if (useYoutube) reasons.push("youtube:video-signal");

  return {
    useGdeltDoc,
    useGdeltGeo,
    useRss,
    useSec,
    useWikidata,
    useYoutube,
    useNewsApi,
    reasons,
  };
}
