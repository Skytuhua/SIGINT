import { cachedFetch, fetchJsonOrThrow, type CachedFetchResult, type UpstreamPolicy } from "../upstream";

const GAMMA_BASE = "https://gamma-api.polymarket.com";

const POLICY: UpstreamPolicy = {
  key: "polymarket",
  ttlMs: 90_000,
  staleTtlMs: 10 * 60_000,
  timeoutMs: 12_000,
  maxRetries: 1,
  backoffBaseMs: 500,
  circuitFailureThreshold: 3,
  circuitOpenMs: 3 * 60_000,
  rateLimit: { capacity: 4, refillPerSec: 1, minIntervalMs: 1500 },
};
const SNAPSHOT_CACHE_KEY = "poly-active-events-snapshot-v1";
const SNAPSHOT_LIMIT = 250;
const COUNTRY_SOFT_TIMEOUT_MS = 1_800;

export interface PolymarketEvent {
  id: string;
  title: string;
  description: string;
  slug: string;
  endDate: string;
  active: boolean;
  closed: boolean;
  liquidity: number;
  volume: number;
  markets: PolymarketMarket[];
}

export interface PolymarketMarket {
  id: string;
  question: string;
  outcomePrices: string;
  volume: number;
  liquidity: number;
  active: boolean;
  closed: boolean;
  groupItemTitle?: string;
}

export interface PredictionMarketItem {
  id: string;
  question: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  liquidity: number;
  endDate: string;
  slug: string;
  eventTitle: string;
}

interface GammaEventRaw {
  id: string;
  title: string;
  description: string;
  slug: string;
  endDate?: string;
  end_date_iso?: string;
  active: boolean;
  closed: boolean;
  liquidity: number | string;
  volume: number | string;
  markets: Array<{
    id: string;
    question: string;
    outcomePrices?: string;
    outcome_prices?: string;
    volume: number | string;
    liquidity: number | string;
    active: boolean;
    closed: boolean;
    endDateIso?: string;
    groupItemTitle?: string;
    group_item_title?: string;
  }>;
}

type GammaEventsResponse = GammaEventRaw[];

function parseOutcomePrices(raw: string | undefined | null): { yes: number; no: number } {
  if (!raw) return { yes: 0, no: 0 };
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length >= 2) {
      return { yes: Number(parsed[0]) || 0, no: Number(parsed[1]) || 0 };
    }
  } catch { /* fallback */ }
  return { yes: 0, no: 0 };
}

function extractMarketItem(evt: GammaEventRaw, mkt: GammaEventRaw["markets"][number]): PredictionMarketItem {
  const prices = parseOutcomePrices(mkt.outcomePrices ?? mkt.outcome_prices);
  return {
    id: mkt.id,
    question: mkt.question || evt.title,
    yesPrice: prices.yes,
    noPrice: prices.no,
    volume: Number(mkt.volume) || 0,
    liquidity: Number(mkt.liquidity) || 0,
    endDate: evt.endDate ?? evt.end_date_iso ?? mkt.endDateIso ?? "",
    slug: evt.slug ?? "",
    eventTitle: evt.title,
  };
}

async function getActiveEventsSnapshot(): Promise<CachedFetchResult<GammaEventsResponse>> {
  return cachedFetch({
    cacheKey: SNAPSHOT_CACHE_KEY,
    policy: POLICY,
    fallbackValue: [],
    request: async () => {
      const url = `${GAMMA_BASE}/events?closed=false&active=true&limit=${SNAPSHOT_LIMIT}&order=volume`;
      return fetchJsonOrThrow<GammaEventsResponse>(
        url,
        { headers: { "User-Agent": "WorldView/0.1" } },
        POLICY.timeoutMs,
      );
    },
  });
}

function collectActiveMarkets(events: GammaEventsResponse): PredictionMarketItem[] {
  const results: PredictionMarketItem[] = [];
  for (const evt of events) {
    for (const mkt of evt.markets ?? []) {
      if (mkt.closed || !mkt.active) continue;
      results.push(extractMarketItem(evt, mkt));
    }
  }
  return results;
}

export async function getPolymarketEvents(
  limit = 20,
  tag?: string,
): Promise<CachedFetchResult<PredictionMarketItem[]>> {
  const snapshot = await getActiveEventsSnapshot();
  const needle = (tag ?? "").trim().toLowerCase();
  const filtered = collectActiveMarkets(snapshot.data).filter((item) => {
    if (!needle) return true;
    const text = `${item.eventTitle} ${item.question}`.toLowerCase();
    return text.includes(needle);
  });

  return {
    data: filtered.sort((a, b) => b.volume - a.volume).slice(0, limit),
    degraded: snapshot.degraded,
    latencyMs: snapshot.latencyMs,
    cacheHit: snapshot.cacheHit,
    error: snapshot.error,
  };
}

export async function searchPolymarketByCountry(
  countryName: string,
  limit = 5,
): Promise<CachedFetchResult<PredictionMarketItem[]>> {
  const needle = countryName.trim().toLowerCase();
  if (!needle) {
    return {
      data: [],
      degraded: false,
      latencyMs: 0,
      cacheHit: "miss",
    };
  }

  const timeoutFallback = new Promise<CachedFetchResult<GammaEventsResponse>>((resolve) => {
    setTimeout(() => {
      resolve({
        data: [],
        degraded: true,
        latencyMs: COUNTRY_SOFT_TIMEOUT_MS,
        cacheHit: "miss",
        error: "soft-timeout",
      });
    }, COUNTRY_SOFT_TIMEOUT_MS);
  });

  const snapshot = await Promise.race([getActiveEventsSnapshot(), timeoutFallback]);
  if (!snapshot.data.length) {
    return {
      data: [],
      degraded: snapshot.degraded,
      latencyMs: snapshot.latencyMs,
      cacheHit: snapshot.cacheHit,
      error: snapshot.error,
    };
  }

  const results: PredictionMarketItem[] = [];
  for (const evt of snapshot.data) {
    const evtText = `${evt.title} ${evt.description}`.toLowerCase();
    const evtMatch = evtText.includes(needle);

    for (const mkt of evt.markets ?? []) {
      if (mkt.closed || !mkt.active) continue;
      const mktMatch = evtMatch || (mkt.question?.toLowerCase().includes(needle) ?? false);
      if (!mktMatch) continue;
      results.push(extractMarketItem(evt, mkt));
    }
  }

  return {
    data: results.sort((a, b) => b.volume - a.volume).slice(0, limit),
    degraded: snapshot.degraded,
    latencyMs: snapshot.latencyMs,
    cacheHit: snapshot.cacheHit,
    error: snapshot.error,
  };
}
