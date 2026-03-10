import { cachedFetch, type CachedFetchResult, type UpstreamPolicy } from "../upstream";
import type { QuoteData, MoverRow, EarningsEntry, NewsHeadline } from "./marketTypes";

/* ── Policy ──────────────────────────────────────────────────────────────── */

const QUOTE_POLICY: UpstreamPolicy = {
  key: "yahoo-finance",
  ttlMs: 10_000,
  staleTtlMs: 5 * 60_000,
  timeoutMs: 12_000,
  maxRetries: 2,
  backoffBaseMs: 600,
  circuitFailureThreshold: 10,
  circuitOpenMs: 2 * 60_000,
  rateLimit: { capacity: 10, refillPerSec: 2, minIntervalMs: 500 },
};

const HISTORICAL_POLICY: UpstreamPolicy = {
  key: "yahoo-finance-hist",
  ttlMs: 30 * 60_000,
  staleTtlMs: 2 * 60 * 60_000,
  timeoutMs: 15_000,
  maxRetries: 1,
  backoffBaseMs: 1_000,
  circuitFailureThreshold: 5,
  circuitOpenMs: 5 * 60_000,
  rateLimit: { capacity: 5, refillPerSec: 1, minIntervalMs: 1_000 },
};

const NEWS_POLICY: UpstreamPolicy = {
  key: "yahoo-finance-news",
  ttlMs: 2 * 60_000,
  staleTtlMs: 10 * 60_000,
  timeoutMs: 10_000,
  maxRetries: 1,
  backoffBaseMs: 500,
  circuitFailureThreshold: 5,
  circuitOpenMs: 3 * 60_000,
  rateLimit: { capacity: 6, refillPerSec: 1, minIntervalMs: 1_200 },
};

/* ── Yahoo Finance crumb/cookie authentication ───────────────────────────── */

const YF_BASE = "https://query2.finance.yahoo.com";

const YF_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://finance.yahoo.com/",
  Origin: "https://finance.yahoo.com",
};

interface CrumbCache {
  crumb: string;
  cookie: string;
  expiresAt: number;
}

let _crumbCache: CrumbCache | null = null;

function invalidateCrumb() {
  _crumbCache = null;
}

async function getYahooCrumb(): Promise<{ crumb: string; cookie: string }> {
  const now = Date.now();
  if (_crumbCache && _crumbCache.expiresAt > now) {
    return { crumb: _crumbCache.crumb, cookie: _crumbCache.cookie };
  }

  // Step 1: Hit fc.yahoo.com to get initial cookies
  const initRes = await fetch("https://fc.yahoo.com", {
    redirect: "manual",
    headers: { "User-Agent": YF_HEADERS["User-Agent"] },
    signal: AbortSignal.timeout(10_000),
  });

  // Extract Set-Cookie header(s)
  const rawCookies: string[] = [];
  initRes.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      rawCookies.push(value.split(";")[0]);
    }
  });

  // Fallback: parse concatenated Set-Cookie header
  if (rawCookies.length === 0) {
    const headerVal = initRes.headers.get("set-cookie");
    if (headerVal) {
      for (const part of headerVal.split(",")) {
        const trimmed = part.trim().split(";")[0];
        if (trimmed.includes("=")) rawCookies.push(trimmed);
      }
    }
  }

  const cookieStr = rawCookies.join("; ");

  // Step 2: Fetch crumb with cookie
  const crumbRes = await fetch(`${YF_BASE}/v1/test/getcrumb`, {
    headers: {
      ...YF_HEADERS,
      Cookie: cookieStr,
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!crumbRes.ok) {
    throw new Error(`Failed to get Yahoo crumb: ${crumbRes.status}`);
  }

  const crumb = (await crumbRes.text()).trim();
  if (!crumb || crumb.length > 50) {
    throw new Error(`Invalid Yahoo crumb response: "${crumb.slice(0, 60)}"`);
  }

  _crumbCache = {
    crumb,
    cookie: cookieStr,
    expiresAt: now + 25 * 60_000,
  };

  return { crumb, cookie: cookieStr };
}

/**
 * Fetch JSON from Yahoo Finance with crumb authentication.
 * On 401/403, invalidates crumb and retries once.
 */
async function yahooFetchJson<T>(
  url: string,
  timeoutMs: number,
): Promise<T> {
  const attempt = async (retry: boolean): Promise<T> => {
    const { crumb, cookie } = await getYahooCrumb();
    const separator = url.includes("?") ? "&" : "?";
    const fullUrl = `${url}${separator}crumb=${encodeURIComponent(crumb)}`;

    const res = await fetch(fullUrl, {
      headers: { ...YF_HEADERS, Cookie: cookie },
      cache: "no-store" as RequestCache,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if ((res.status === 401 || res.status === 403) && retry) {
      invalidateCrumb();
      return attempt(false);
    }

    if (!res.ok) {
      throw new Error(`Yahoo Finance ${res.status}: ${url}`);
    }

    return (await res.json()) as T;
  };

  return attempt(true);
}

/* ── Yahoo Finance v7 quote API ──────────────────────────────────────────── */

interface YFQuoteResponse {
  quoteResponse?: {
    result?: Array<{
      symbol: string;
      shortName?: string;
      longName?: string;
      regularMarketPrice?: number;
      regularMarketChange?: number;
      regularMarketChangePercent?: number;
      regularMarketPreviousClose?: number;
      regularMarketVolume?: number;
      marketCap?: number;
      regularMarketDayHigh?: number;
      regularMarketDayLow?: number;
      fiftyTwoWeekHigh?: number;
      fiftyTwoWeekLow?: number;
      ytdReturn?: number;
      marketState?: string;
    }>;
    error?: unknown;
  };
}

function mapQuote(raw: NonNullable<YFQuoteResponse["quoteResponse"]>["result"] extends Array<infer T> ? T : never): QuoteData {
  return {
    symbol: raw.symbol ?? "",
    name: raw.shortName ?? raw.longName ?? raw.symbol ?? "",
    price: raw.regularMarketPrice ?? 0,
    change: raw.regularMarketChange ?? 0,
    changePercent: raw.regularMarketChangePercent ?? 0,
    prevClose: raw.regularMarketPreviousClose ?? 0,
    volume: raw.regularMarketVolume ?? 0,
    marketCap: raw.marketCap,
    dayHigh: raw.regularMarketDayHigh ?? 0,
    dayLow: raw.regularMarketDayLow ?? 0,
    fiftyTwoWeekHigh: raw.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: raw.fiftyTwoWeekLow,
    ytdReturn: raw.ytdReturn,
    marketState: raw.marketState,
  };
}

/**
 * Fetch quotes for multiple symbols in a single call.
 */
export async function getQuotes(
  symbols: string[],
): Promise<CachedFetchResult<Record<string, QuoteData>>> {
  const syms = symbols.slice(0, 50);
  const key = syms.sort().join(",");

  return cachedFetch({
    cacheKey: `yf-quotes::${key}`,
    policy: QUOTE_POLICY,
    fallbackValue: {},
    request: async () => {
      const url = `${YF_BASE}/v7/finance/quote?symbols=${encodeURIComponent(syms.join(","))}&fields=symbol,shortName,longName,regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketPreviousClose,regularMarketVolume,marketCap,regularMarketDayHigh,regularMarketDayLow,fiftyTwoWeekHigh,fiftyTwoWeekLow,ytdReturn,marketState`;
      const json = await yahooFetchJson<YFQuoteResponse>(url, QUOTE_POLICY.timeoutMs);
      const result: Record<string, QuoteData> = {};
      for (const item of json.quoteResponse?.result ?? []) {
        result[item.symbol ?? ""] = mapQuote(item);
      }
      return result;
    },
  });
}

/* ── Yahoo Finance v8 chart API (historical closes) ──────────────────────── */

interface YFChartResponse {
  chart?: {
    result?: Array<{
      meta?: { symbol?: string };
      indicators?: {
        adjclose?: Array<{ adjclose?: number[] }>;
        quote?: Array<{ close?: number[] }>;
      };
    }>;
    error?: unknown;
  };
}

/**
 * Fetch historical daily closes for a single symbol.
 */
export async function getHistoricalCloses(
  symbol: string,
  range = "1mo",
  interval = "1d",
): Promise<CachedFetchResult<number[]>> {
  return cachedFetch({
    cacheKey: `yf-hist::${symbol}::${range}::${interval}`,
    policy: HISTORICAL_POLICY,
    fallbackValue: [],
    request: async () => {
      const url = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
      const json = await yahooFetchJson<YFChartResponse>(url, HISTORICAL_POLICY.timeoutMs);
      const result = json.chart?.result?.[0];
      const adjclose = result?.indicators?.adjclose?.[0]?.adjclose;
      const close = result?.indicators?.quote?.[0]?.close;
      const prices = adjclose ?? close ?? [];
      return prices.filter((v): v is number => v != null && !Number.isNaN(v));
    },
  });
}

/* ── Top movers (derived from broad quote fetch) ─────────────────────────── */

const SP500_TOP_TICKERS = [
  "AAPL","MSFT","NVDA","AMZN","GOOGL","META","TSLA","BRK-B","AVGO","JPM",
  "LLY","V","UNH","MA","XOM","COST","HD","PG","JNJ","ABBV",
  "MRK","NFLX","CRM","AMD","BAC","ORCL","WMT","CVX","KO","PEP",
  "TMO","ADBE","CSCO","ACN","LIN","MCD","ABT","DHR","PM","WFC",
  "IBM","GE","CAT","INTU","TXN","VZ","QCOM","ISRG","CMCSA","NOW",
  "NEE","RTX","SPGI","AMAT","HON","PFE","AMGN","UNP","BLK","LOW",
  "SYK","BKNG","GS","ELV","MDLZ","AXP","LRCX","DE","T","VRTX",
  "C","PLD","ADI","REGN","SCHW","MMC","CB","BSX","KLAC","SLB",
  "MU","PANW","SO","DUK","SNPS","ZTS","CDNS","ICE","CME","APD",
  "FI","SHW","BDX","CL","EOG","TGT","MCK","HCA","EQIX","ITW",
];

export async function getMovers(): Promise<CachedFetchResult<{ gainers: MoverRow[]; losers: MoverRow[] }>> {
  return cachedFetch({
    cacheKey: "yf-movers",
    policy: { ...QUOTE_POLICY, ttlMs: 2 * 60_000, staleTtlMs: 10 * 60_000 },
    fallbackValue: { gainers: [], losers: [] },
    request: async () => {
      const url = `${YF_BASE}/v7/finance/quote?symbols=${SP500_TOP_TICKERS.join(",")}&fields=symbol,shortName,regularMarketPrice,regularMarketChangePercent,regularMarketVolume,averageDailyVolume3Month`;
      const json = await yahooFetchJson<YFQuoteResponse>(url, QUOTE_POLICY.timeoutMs);
      const items = json.quoteResponse?.result ?? [];

      const mapped = items
        .filter((i) => i.regularMarketChangePercent != null)
        .map((i) => {
          const pct = i.regularMarketChangePercent ?? 0;
          const avgVol = (i as Record<string, unknown>).averageDailyVolume3Month as number | undefined;
          const vol = i.regularMarketVolume ?? 0;
          const volMult = avgVol && avgVol > 0 ? (vol / avgVol).toFixed(1) + "x" : "—";
          return {
            sym: i.symbol ?? "",
            name: i.shortName ?? i.symbol ?? "",
            pct,
            price: `$${(i.regularMarketPrice ?? 0).toFixed(2)}`,
            volMult,
            reason: "",
          } satisfies MoverRow;
        });

      const sorted = [...mapped].sort((a, b) => b.pct - a.pct);
      const gainers = sorted.filter((m) => m.pct > 0).slice(0, 10);
      const losers = sorted.filter((m) => m.pct < 0).sort((a, b) => a.pct - b.pct).slice(0, 10);

      return { gainers, losers };
    },
  });
}

/* ── Market news via Yahoo RSS ───────────────────────────────────────────── */

const CATEGORY_MAP: Record<string, { label: string; color: string }> = {
  default:     { label: "MARKETS",     color: "#89e5ff" },
  markets:     { label: "MARKETS",     color: "#89e5ff" },
  equities:    { label: "EQUITIES",    color: "#36b37e" },
  earnings:    { label: "EARNINGS",    color: "#36b37e" },
  tech:        { label: "TECH",        color: "#b9cde0" },
  energy:      { label: "ENERGY",      color: "#ffab40" },
  crypto:      { label: "CRYPTO",      color: "#76ff03" },
  macro:       { label: "MACRO",       color: "#89e5ff" },
};

export async function getMarketNews(limit = 20): Promise<CachedFetchResult<NewsHeadline[]>> {
  return cachedFetch({
    cacheKey: `yf-news::${limit}`,
    policy: NEWS_POLICY,
    fallbackValue: [],
    request: async () => {
      const url = `https://rss.finance.yahoo.com/rss/topfinstories`;
      const res = await fetch(url, {
        headers: { "User-Agent": YF_HEADERS["User-Agent"] },
        cache: "no-store" as RequestCache,
        signal: AbortSignal.timeout(NEWS_POLICY.timeoutMs),
      });
      if (!res.ok) throw new Error(`Yahoo RSS returned ${res.status}`);
      const xml = await res.text();

      const items: NewsHeadline[] = [];
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;
      while ((match = itemRegex.exec(xml)) !== null && items.length < limit) {
        const itemXml = match[1];
        const title = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
          ?? itemXml.match(/<title>(.*?)<\/title>/)?.[1]
          ?? "";
        const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] ?? "";
        const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? "";
        const source = itemXml.match(/<source[^>]*>(.*?)<\/source>/)?.[1] ?? "Yahoo Finance";

        if (!title) continue;

        const cat = CATEGORY_MAP.default;
        const d = new Date(pubDate);
        const ts = Number.isNaN(d.getTime())
          ? ""
          : `${d.getUTCHours().toString().padStart(2, "0")}:${d.getUTCMinutes().toString().padStart(2, "0")}`;

        const tickerMatch = title.match(/\$([A-Z]{1,5})\b/) ?? title.match(/\b([A-Z]{2,5})\b(?=\s+(?:stock|shares|earnings|revenue|Q[1-4]))/);
        const ticker = tickerMatch?.[1];

        items.push({
          category: cat.label,
          categoryColor: cat.color,
          ticker,
          headline: title.replace(/<[^>]+>/g, ""),
          ts,
          url: link,
          source,
        });
      }

      return items;
    },
  });
}

/* ── Earnings calendar ───────────────────────────────────────────────────── */

export async function getEarningsCalendar(): Promise<CachedFetchResult<{ upcoming: EarningsEntry[]; recent: EarningsEntry[] }>> {
  return cachedFetch({
    cacheKey: "yf-earnings",
    policy: { ...QUOTE_POLICY, ttlMs: 15 * 60_000, staleTtlMs: 60 * 60_000 },
    fallbackValue: { upcoming: [], recent: [] },
    request: async () => {
      const earningsTickers = [
        "AAPL","MSFT","NVDA","GOOGL","AMZN","META","TSLA","AVGO","NFLX","COST",
        "AMD","CRM","ORCL","ADBE","QCOM","INTC","PYPL","UBER","SQ","SNOW",
      ];
      const url = `${YF_BASE}/v7/finance/quote?symbols=${earningsTickers.join(",")}&fields=symbol,shortName,earningsTimestamp,earningsTimestampStart,earningsTimestampEnd,epsTrailingTwelveMonths,epsForward,epsCurrentYear,marketCap`;
      const json = await yahooFetchJson<YFQuoteResponse>(url, QUOTE_POLICY.timeoutMs);
      const results = json.quoteResponse?.result ?? [];
      const now = Date.now();
      const upcoming: EarningsEntry[] = [];
      const recent: EarningsEntry[] = [];

      for (const item of results) {
        const raw = item as Record<string, unknown>;
        const earningsTs = (raw.earningsTimestamp as number) ?? (raw.earningsTimestampStart as number);
        if (!earningsTs) continue;

        const earningsDate = new Date(earningsTs * 1000);
        const dateStr = earningsDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const hour = earningsDate.getUTCHours();
        const time = hour < 14 ? "BMO" : "AMC";

        const epsEst = raw.epsForward ?? raw.epsCurrentYear;
        const mcap = raw.marketCap as number | undefined;
        const mcapStr = mcap ? `${(mcap / 1e9).toFixed(0)}B` : "";

        const entry: EarningsEntry = {
          date: dateStr,
          time,
          sym: item.symbol ?? "",
          company: item.shortName ?? item.symbol ?? "",
          epsEst: epsEst != null ? `$${Number(epsEst).toFixed(2)}` : "—",
          mktCapB: mcapStr,
        };

        const diff = earningsTs * 1000 - now;
        if (diff > 0) {
          upcoming.push(entry);
        } else if (diff > -30 * 24 * 60 * 60 * 1000) {
          const epsTTM = raw.epsTrailingTwelveMonths as number | undefined;
          if (epsTTM != null) {
            entry.epsAct = `$${epsTTM.toFixed(2)}`;
            const estNum = typeof epsEst === "number" ? epsEst : parseFloat(String(epsEst));
            if (!Number.isNaN(estNum)) {
              entry.surprise = epsTTM > estNum * 1.01 ? "beat" : epsTTM < estNum * 0.99 ? "miss" : "in-line";
            }
          }
          recent.push(entry);
        }
      }

      upcoming.sort((a, b) => a.date.localeCompare(b.date));
      recent.sort((a, b) => b.date.localeCompare(a.date));

      return {
        upcoming: upcoming.slice(0, 15),
        recent: recent.slice(0, 8),
      };
    },
  });
}
