import { cachedFetch, fetchJsonOrThrow, type CachedFetchResult, type UpstreamPolicy } from "../upstream";
import type { WBCountryMacro, EconomicCenterSourceStatus } from "./types";

const WB_BASE = "https://api.worldbank.org/v2";

const WB_POLICY: UpstreamPolicy = {
  key: "econ-centers-worldbank",
  ttlMs: 4 * 60 * 60_000,
  staleTtlMs: 40 * 60 * 60_000,
  timeoutMs: 20_000,
  maxRetries: 2,
  backoffBaseMs: 1_000,
  circuitFailureThreshold: 3,
  circuitOpenMs: 5 * 60_000,
  rateLimit: { capacity: 4, refillPerSec: 2, minIntervalMs: 500 },
};

// World Bank multi-indicator bulk response shape
type WBBulkRow = {
  indicator: { id: string };
  country: { id: string };
  date: string;
  value: number | null;
};

type WBBulkPage = [
  { page: number; pages: number; per_page: number; total: number },
  WBBulkRow[] | null,
];

export interface WorldBankFetchResult {
  macroByIso2: Map<string, WBCountryMacro>;
  sourceStatus: EconomicCenterSourceStatus;
}

async function fetchBulkPage(page: number): Promise<WBBulkPage> {
  const url =
    `${WB_BASE}/country/all/indicator/NY.GDP.MKTP.CD;NE.TRD.GNFS.ZS` +
    `?format=json&per_page=500&mrv=1&page=${page}`;
  return fetchJsonOrThrow<WBBulkPage>(
    url,
    { headers: { "User-Agent": "SIGINT/0.1" } },
    WB_POLICY.timeoutMs,
  );
}

async function fetchAllMacro(): Promise<Map<string, WBCountryMacro>> {
  const result: Map<string, WBCountryMacro> = new Map();

  // Fetch first page to learn total pages
  const first = await fetchBulkPage(1);
  const meta = first[0];
  const totalPages = meta?.pages ?? 1;
  const rows: WBBulkRow[] = [...(first[1] ?? [])];

  // Fetch remaining pages (cap at 3 total)
  const maxPages = Math.min(totalPages, 3);
  if (maxPages > 1) {
    const pagePromises = Array.from({ length: maxPages - 1 }, (_, i) => fetchBulkPage(i + 2));
    const extra = await Promise.all(pagePromises);
    for (const page of extra) {
      if (page[1]) rows.push(...page[1]);
    }
  }

  // Group rows by country ISO2 and indicator
  const gdpMap = new Map<string, { value: number; year: number }>();
  const tradeMap = new Map<string, { value: number; year: number }>();

  for (const row of rows) {
    if (!row.country?.id || row.value === null || row.value === undefined) continue;
    const iso2 = row.country.id.toUpperCase();
    const year = Number(row.date) || 0;
    const indicatorId = row.indicator?.id;

    if (indicatorId === "NY.GDP.MKTP.CD") {
      const existing = gdpMap.get(iso2);
      if (!existing || year > existing.year) {
        gdpMap.set(iso2, { value: row.value, year });
      }
    } else if (indicatorId === "NE.TRD.GNFS.ZS") {
      const existing = tradeMap.get(iso2);
      if (!existing || year > existing.year) {
        tradeMap.set(iso2, { value: row.value, year });
      }
    }
  }

  // Merge into WBCountryMacro records
  const allIso2s = new Set([...gdpMap.keys(), ...tradeMap.keys()]);
  for (const iso2 of allIso2s) {
    const gdp = gdpMap.get(iso2);
    const trade = tradeMap.get(iso2);
    result.set(iso2, {
      gdpUsd: gdp?.value ?? null,
      tradeGdpPct: trade?.value ?? null,
      year: Math.max(gdp?.year ?? 0, trade?.year ?? 0),
    });
  }

  return result;
}

export async function fetchWorldBankMacro(): Promise<WorldBankFetchResult> {
  const res = await cachedFetch<Map<string, WBCountryMacro>>({
    cacheKey: "econ-centers-worldbank-all-v1",
    policy: WB_POLICY,
    fallbackValue: new Map(),
    request: fetchAllMacro,
  });

  const sourceStatus: EconomicCenterSourceStatus = statusFromResult(res);
  return { macroByIso2: res.data, sourceStatus };
}

function statusFromResult<T>(res: CachedFetchResult<T>): EconomicCenterSourceStatus {
  if (res.cacheHit === "fresh" && !res.degraded) {
    return { status: "live", lastUpdated: Date.now(), errorCode: null };
  }
  if (res.cacheHit === "stale" && !res.degraded) {
    return { status: "cached", lastUpdated: Date.now(), errorCode: null };
  }
  if (res.cacheHit === "stale" && res.degraded) {
    return { status: "degraded", lastUpdated: Date.now(), errorCode: res.error ?? null };
  }
  return {
    status: res.degraded ? "degraded" : "unavailable",
    lastUpdated: res.degraded ? Date.now() : null,
    errorCode: res.error ?? null,
  };
}
