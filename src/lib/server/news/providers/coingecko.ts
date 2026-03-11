import { cachedFetch, fetchJsonOrThrow, type CachedFetchResult, type UpstreamPolicy } from "../upstream";

const CG_BASE = "https://api.coingecko.com/api/v3";

const POLICY: UpstreamPolicy = {
  key: "coingecko",
  ttlMs: 60_000,
  staleTtlMs: 5 * 60_000,
  timeoutMs: 10_000,
  maxRetries: 1,
  backoffBaseMs: 500,
  circuitFailureThreshold: 3,
  circuitOpenMs: 2 * 60_000,
  rateLimit: { capacity: 6, refillPerSec: 1, minIntervalMs: 1200 },
};

export interface CoinTrending {
  id: string;
  name: string;
  symbol: string;
  marketCapRank: number | null;
  priceBtc: number;
  thumb: string;
  score: number;
}

export interface CoinMarketData {
  id: string;
  symbol: string;
  name: string;
  currentPrice: number;
  priceChangePercent24h: number;
  marketCap: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  sparkline7d?: number[];
}

interface TrendingResponse {
  coins?: Array<{
    item: {
      id: string;
      name: string;
      symbol: string;
      market_cap_rank: number | null;
      price_btc: number;
      thumb: string;
      score: number;
    };
  }>;
}

interface MarketItem {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
  market_cap: number;
  total_volume: number;
  high_24h: number;
  low_24h: number;
  sparkline_in_7d?: { price: number[] };
}

export async function getCoinGeckoTrending(): Promise<CachedFetchResult<CoinTrending[]>> {
  return cachedFetch({
    cacheKey: "cg-trending",
    policy: POLICY,
    fallbackValue: [],
    request: async () => {
      const json = await fetchJsonOrThrow<TrendingResponse>(
        `${CG_BASE}/search/trending`,
        { headers: { "User-Agent": "SIGINT/0.1" } },
        POLICY.timeoutMs,
      );
      return (json.coins ?? []).map((c) => ({
        id: c.item.id,
        name: c.item.name,
        symbol: c.item.symbol,
        marketCapRank: c.item.market_cap_rank,
        priceBtc: c.item.price_btc,
        thumb: c.item.thumb,
        score: c.item.score,
      }));
    },
  });
}

export async function getCoinGeckoMarkets(limit = 20): Promise<CachedFetchResult<CoinMarketData[]>> {
  return cachedFetch({
    cacheKey: `cg-markets-${limit}`,
    policy: POLICY,
    fallbackValue: [],
    request: async () => {
      const url = `${CG_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1&sparkline=true&price_change_percentage=24h`;
      const items = await fetchJsonOrThrow<MarketItem[]>(
        url,
        { headers: { "User-Agent": "SIGINT/0.1" } },
        POLICY.timeoutMs,
      );
      return items.map((c) => ({
        id: c.id,
        symbol: c.symbol,
        name: c.name,
        currentPrice: c.current_price,
        priceChangePercent24h: c.price_change_percentage_24h,
        marketCap: c.market_cap,
        volume24h: c.total_volume,
        high24h: c.high_24h,
        low24h: c.low_24h,
        sparkline7d: c.sparkline_in_7d?.price,
      }));
    },
  });
}
