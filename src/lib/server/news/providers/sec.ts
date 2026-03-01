import type { SecFiling } from "../../../news/types";
import { cachedFetch, fetchJsonOrThrow, type CachedFetchResult, type UpstreamPolicy } from "../upstream";

const SEC_SEARCH_BASE = "https://efts.sec.gov/LATEST/search-index";
const SEC_SUBMISSIONS_BASE = "https://data.sec.gov/submissions";
const SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";

const SEC_HEADERS = {
  "User-Agent": "WorldView/0.1 research@worldview.app",
  Accept: "application/json",
};

const SEC_TICKER_POLICY: UpstreamPolicy = {
  key: "sec-tickers",
  ttlMs: 24 * 60 * 60_000,
  staleTtlMs: 7 * 24 * 60 * 60_000,
  timeoutMs: 12_000,
  maxRetries: 2,
  backoffBaseMs: 500,
  circuitFailureThreshold: 4,
  circuitOpenMs: 120_000,
  rateLimit: { capacity: 5, refillPerSec: 5, minIntervalMs: 180 },
};

const SEC_COMPANY_POLICY: UpstreamPolicy = {
  key: "sec-company",
  ttlMs: 2 * 60 * 60_000,
  staleTtlMs: 12 * 60 * 60_000,
  timeoutMs: 12_000,
  maxRetries: 2,
  backoffBaseMs: 550,
  circuitFailureThreshold: 4,
  circuitOpenMs: 120_000,
  rateLimit: { capacity: 5, refillPerSec: 5, minIntervalMs: 180 },
};

const SEC_SEARCH_POLICY: UpstreamPolicy = {
  key: "sec-search",
  ttlMs: 60 * 60_000,
  staleTtlMs: 6 * 60 * 60_000,
  timeoutMs: 12_000,
  maxRetries: 2,
  backoffBaseMs: 550,
  circuitFailureThreshold: 4,
  circuitOpenMs: 120_000,
  rateLimit: { capacity: 4, refillPerSec: 4, minIntervalMs: 220 },
};

type TickerMap = Record<string, string>;

export async function fetchSecTickerMap(): Promise<CachedFetchResult<TickerMap>> {
  return cachedFetch({
    cacheKey: SEC_TICKERS_URL,
    policy: SEC_TICKER_POLICY,
    fallbackValue: {},
    request: async () => {
      const raw = await fetchJsonOrThrow<Record<string, { cik_str: number; ticker: string }>>(
        SEC_TICKERS_URL,
        { headers: SEC_HEADERS },
        SEC_TICKER_POLICY.timeoutMs
      );
      const map: TickerMap = {};
      for (const entry of Object.values(raw)) {
        if (entry?.ticker && entry?.cik_str) {
          map[entry.ticker.toUpperCase()] = String(entry.cik_str).padStart(10, "0");
        }
      }
      return map;
    },
  });
}

function toFiling(item: {
  cik: string;
  companyName: string;
  formType: string;
  filedAt: string;
  reportDate?: string;
  accessionNumber: string;
  url: string;
  description: string;
  entity?: string;
  score?: number;
}): SecFiling {
  const filedTs = item.filedAt ? Date.parse(item.filedAt) : Date.now();
  return {
    id: `sec-${item.accessionNumber}`,
    cik: item.cik,
    companyName: item.companyName,
    formType: item.formType,
    filedAt: item.filedAt,
    reportDate: item.reportDate,
    accessionNumber: item.accessionNumber,
    url: item.url,
    headline: `${item.companyName} - ${item.formType} (${item.filedAt || "n/a"})`,
    snippet: item.description,
    publishedAt: Number.isFinite(filedTs) ? filedTs : Date.now(),
    score: Math.max(1, Math.min(100, Math.round(item.score ?? 50))),
    category: "filings",
    backendSource: "sec",
    source: "SEC EDGAR",
    domain: "sec.gov",
    language: "English",
    entity: item.entity,
  };
}

export async function fetchSecCompanyFilings(cik: string): Promise<CachedFetchResult<SecFiling[]>> {
  const paddedCik = cik.replace(/[^\d]/g, "").padStart(10, "0");
  const url = `${SEC_SUBMISSIONS_BASE}/CIK${paddedCik}.json`;

  return cachedFetch({
    cacheKey: url,
    policy: SEC_COMPANY_POLICY,
    fallbackValue: [],
    request: async () => {
      const data = await fetchJsonOrThrow<{
        name: string;
        cik: string;
        tickers?: string[];
        filings: {
          recent: {
            accessionNumber: string[];
            filingDate: string[];
            reportDate: string[];
            form: string[];
            primaryDocument: string[];
            primaryDocDescription: string[];
          };
        };
      }>(url, { headers: SEC_HEADERS }, SEC_COMPANY_POLICY.timeoutMs);

      const r = data.filings?.recent;
      if (!r?.accessionNumber?.length) return [];

      const filings: SecFiling[] = [];
      const max = Math.min(60, r.accessionNumber.length);
      for (let i = 0; i < max; i += 1) {
        const accession = r.accessionNumber[i] ?? `${paddedCik}-${i}`;
        const filedAt = r.filingDate[i] ?? "";
        const formType = r.form[i] ?? "UNKNOWN";
        const accSlug = accession.replace(/-/g, "");
        const doc = r.primaryDocument[i] ?? "";
        const companyUrl = doc
          ? `https://www.sec.gov/Archives/edgar/data/${Number(paddedCik)}/${accSlug}/${doc}`
          : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${paddedCik}&type=${formType}&owner=include&count=40`;

        filings.push(
          toFiling({
            cik: paddedCik,
            companyName: data.name,
            formType,
            filedAt,
            reportDate: r.reportDate[i] ?? undefined,
            accessionNumber: accession,
            url: companyUrl,
            description: r.primaryDocDescription[i] ?? `${formType} filing`,
            entity: data.tickers?.[0],
          })
        );
      }
      return filings;
    },
  });
}

export async function searchSecFilings(params: {
  q?: string;
  form?: string;
  from?: string;
  to?: string;
}): Promise<CachedFetchResult<SecFiling[]>> {
  const url = new URL(SEC_SEARCH_BASE);
  if (params.q?.trim()) url.searchParams.set("q", `"${params.q.trim()}"`);
  if (params.form) url.searchParams.set("forms", params.form);
  if (params.from || params.to) {
    url.searchParams.set("dateRange", "custom");
    if (params.from) url.searchParams.set("startdt", params.from);
    if (params.to) url.searchParams.set("enddt", params.to);
  }
  const cacheKey = url.toString();

  return cachedFetch({
    cacheKey,
    policy: SEC_SEARCH_POLICY,
    fallbackValue: [],
    request: async () => {
      const data = await fetchJsonOrThrow<{
        hits?: {
          hits?: Array<{
            _id: string;
            _score?: number;
            _source: {
              period_of_report?: string;
              entity_name?: string;
              file_date?: string;
              form_type?: string;
              accession_no?: string;
              file_num?: string;
            };
          }>;
        };
      }>(url.toString(), { headers: SEC_HEADERS }, SEC_SEARCH_POLICY.timeoutMs);

      const hits = data.hits?.hits ?? [];
      return hits.slice(0, 80).map((hit) => {
        const source = hit._source;
        const accession = source.accession_no ?? hit._id;
        const filedAt = source.file_date ?? "";
        const formType = source.form_type ?? params.form ?? "UNKNOWN";
        const edgarUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&filenum=${source.file_num ?? ""}&type=${formType}&owner=include&count=40`;

        return toFiling({
          cik: "",
          companyName: source.entity_name ?? "Unknown",
          formType,
          filedAt,
          reportDate: source.period_of_report,
          accessionNumber: accession,
          url: edgarUrl,
          description: `${formType} filing${source.period_of_report ? ` for ${source.period_of_report}` : ""}`,
          entity: params.q,
          score: (hit._score ?? 1) * 20,
        });
      });
    },
  });
}

