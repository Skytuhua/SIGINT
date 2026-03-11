import type { WikidataEntity } from "../../../news/types";
import { cachedFetch, fetchJsonOrThrow, type CachedFetchResult, type UpstreamPolicy } from "../upstream";

const WIKIDATA_SPARQL = "https://query.wikidata.org/sparql";

const POLICY: UpstreamPolicy = {
  key: "wikidata",
  ttlMs: 3 * 24 * 60 * 60_000,
  staleTtlMs: 10 * 24 * 60 * 60_000,
  timeoutMs: 12_000,
  maxRetries: 1,
  backoffBaseMs: 700,
  circuitFailureThreshold: 3,
  circuitOpenMs: 120_000,
  rateLimit: { capacity: 1, refillPerSec: 1, minIntervalMs: 1000 },
};

function sanitizeLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildTickerQuery(ticker: string): string {
  return `
SELECT ?company ?companyLabel ?lat ?lon ?industryLabel ?desc WHERE {
  ?company wdt:P249 "${sanitizeLiteral(ticker)}".
  OPTIONAL {
    ?company wdt:P159 ?hq .
    ?hq wdt:P625 ?coord .
    BIND(geof:latitude(?coord) AS ?lat)
    BIND(geof:longitude(?coord) AS ?lon)
  }
  OPTIONAL { ?company wdt:P452 ?industry }
  OPTIONAL { ?company schema:description ?desc FILTER(LANG(?desc) = "en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 1
`.trim();
}

function buildCompanyQuery(company: string): string {
  return `
SELECT ?company ?companyLabel ?lat ?lon ?industryLabel ?desc WHERE {
  ?company rdfs:label ?label .
  FILTER(LANG(?label) = "en")
  FILTER(CONTAINS(LCASE(STR(?label)), LCASE("${sanitizeLiteral(company)}")))
  OPTIONAL {
    ?company wdt:P159 ?hq .
    ?hq wdt:P625 ?coord .
    BIND(geof:latitude(?coord) AS ?lat)
    BIND(geof:longitude(?coord) AS ?lon)
  }
  OPTIONAL { ?company wdt:P452 ?industry }
  OPTIONAL { ?company schema:description ?desc FILTER(LANG(?desc) = "en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 1
`.trim();
}

function parseEntity(
  query: string,
  json: {
    results?: {
      bindings?: Array<{
        company?: { value: string };
        companyLabel?: { value: string };
        lat?: { value: string };
        lon?: { value: string };
        industryLabel?: { value: string };
        desc?: { value: string };
      }>;
    };
  }
): WikidataEntity | null {
  const binding = json.results?.bindings?.[0];
  if (!binding?.company?.value) return null;
  const qid = binding.company.value.split("/").pop() ?? "";
  return {
    qid,
    label: binding.companyLabel?.value ?? query,
    ticker: /^[A-Z.\-]{1,8}$/.test(query) ? query : undefined,
    lat: binding.lat ? Number(binding.lat.value) : undefined,
    lon: binding.lon ? Number(binding.lon.value) : undefined,
    industry: binding.industryLabel?.value,
    description: binding.desc?.value,
    aliases: [query],
  };
}

async function runSparql(query: string): Promise<WikidataEntity | null> {
  const url = new URL(WIKIDATA_SPARQL);
  url.searchParams.set("query", query);
  url.searchParams.set("format", "json");
  const json = await fetchJsonOrThrow<{
    results?: {
      bindings?: Array<{
        company?: { value: string };
        companyLabel?: { value: string };
        lat?: { value: string };
        lon?: { value: string };
        industryLabel?: { value: string };
        desc?: { value: string };
      }>;
    };
  }>(
    url.toString(),
    {
      headers: {
        "User-Agent": "SIGINT/0.1 (research; https://github.com/sigint)",
        Accept: "application/sparql-results+json",
      },
    },
    POLICY.timeoutMs
  );
  return parseEntity(query, json);
}

export async function fetchWikidataEntity(params: {
  ticker?: string;
  company?: string;
}): Promise<CachedFetchResult<WikidataEntity | null>> {
  const ticker = params.ticker?.trim().toUpperCase();
  const company = params.company?.trim();
  const key = ticker || company || "";
  if (!key) {
    return {
      data: null,
      degraded: false,
      latencyMs: 0,
      cacheHit: "miss",
    };
  }

  return cachedFetch({
    cacheKey: key,
    policy: POLICY,
    fallbackValue: null,
    request: async () => {
      if (ticker) {
        const byTicker = await runSparql(buildTickerQuery(ticker));
        if (byTicker) return byTicker;
      }
      if (company) {
        const byCompany = await runSparql(buildCompanyQuery(company));
        if (byCompany) return byCompany;
      }
      return null;
    },
  });
}

