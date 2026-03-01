import type { QueryAST, QueryRoutingPlan } from "../types";

interface RouteOptions {
  requireCoords?: boolean;
  includeVideo?: boolean;
  mapMode?: "pointdata" | "country" | "adm1";
}

function looksCompanyLike(ast: QueryAST): boolean {
  if (ast.sym || ast.cik) return true;
  return ast.freeText.some((term) => {
    if (term.length < 2 || term.length > 8) return false;
    return /^[A-Z.]+$/.test(term);
  });
}

export function routeQuery(ast: QueryAST, options: RouteOptions = {}): QueryRoutingPlan {
  const reasons: string[] = [];
  const srcSet = new Set(ast.src ?? []);

  const filingQuery = Boolean(ast.type === "filing" || ast.filingForm || ast.cik);
  const hasNonFilingIntent = Boolean(
    ast.freeText.length || ast.cat && ast.cat !== "filings" || ast.place || ast.country || ast.near
  );

  const useSec = filingQuery || ast.src?.includes("sec") === true;
  if (useSec) reasons.push("sec:filing-signals");

  const useGdeltDoc = !filingQuery || hasNonFilingIntent || (ast.src?.includes("gdelt") ?? false);
  if (useGdeltDoc) reasons.push("gdelt-doc:news-content");

  const useRss =
    srcSet.has("rss") ||
    (!filingQuery && (!srcSet.size || (!srcSet.has("sec") && !srcSet.has("gdelt"))));
  if (useRss) reasons.push("rss:free-headlines");

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
    reasons,
  };
}
