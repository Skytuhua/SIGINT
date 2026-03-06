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
const SNAPSHOT_LIMIT = 500;
const COUNTRY_SOFT_TIMEOUT_MS = 3_500;

// Aliases used for local snapshot filtering (substring match on title/description/question)
const COUNTRY_ALIASES: Record<string, string[]> = {
  "United States": ["Trump", "tariff", "tariffs", "Federal Reserve", "Congress", "Senate", "White House", "Pentagon", "Republican", "Democrat", "Biden", "Harris", "DOGE", "America", "USA", "American"],
  "United Kingdom": ["UK", "Britain", "British", "England", "Starmer", "Sunak", "Brexit", "Sterling"],
  "Russia": ["Putin", "Russian", "Kremlin", "Moscow", "Ruble", "Zelensky", "Soviet"],
  "China": ["Xi Jinping", "Chinese", "PRC", "Beijing", "CCP", "Yuan", "Renminbi"],
  "Taiwan": ["ROC", "Taipei", "Taiwanese", "TSMC"],
  "South Korea": ["Korea", "Korean", "Seoul", "Won", "K-pop"],
  "Iran": ["Iranian", "Tehran", "Khamenei", "IRGC", "Persian", "Rial"],
  "Ukraine": ["Zelensky", "Zelenskyy", "Ukrainian", "Kyiv", "Kiev", "Donbas", "Kharkiv", "Odessa"],
  "Israel": ["Netanyahu", "Israeli", "Tel Aviv", "IDF", "Gaza", "Shekel", "Mossad"],
  "Saudi Arabia": ["Saudi", "Riyadh", "MBS", "Aramco", "OPEC", "Crown Prince"],
  "United Arab Emirates": ["UAE", "Dubai", "Abu Dhabi", "Emirati", "Dirham"],
  "North Korea": ["DPRK", "Kim Jong", "Pyongyang", "Kim Jong-un"],
  "European Union": ["EU", "Europe", "European", "ECB", "Euro", "Brussels"],
  "Turkey": ["Erdogan", "Turkish", "Ankara", "Lira", "Türkiye"],
  "Germany": ["German", "Berlin", "Bundeswehr", "Merz", "Scholz", "DAX"],
  "France": ["French", "Paris", "Macron", "Eurozone", "CAC"],
  "Japan": ["Japanese", "Tokyo", "Yen", "Nikkei", "Kishida", "Ishiba", "BOJ"],
  "India": ["Indian", "Modi", "New Delhi", "Rupee", "BJP", "Sensex"],
  "Brazil": ["Brazilian", "Lula", "Brasilia", "Real", "Bolsonaro", "Petrobras"],
  "Venezuela": ["Venezuelan", "Maduro", "Caracas", "Bolivar"],
  "Mexico": ["Mexican", "Sheinbaum", "Peso", "AMLO", "Cartel"],
  "Pakistan": ["Pakistani", "Islamabad", "Imran Khan", "ISI"],
  "Afghanistan": ["Afghan", "Taliban", "Kabul", "Afghani"],
  "Argentina": ["Argentine", "Milei", "Peso", "Buenos Aires", "Kirchner"],
  "Cuba": ["Cuban", "Havana", "Castro", "Diaz-Canel"],
  "Palestine": ["Palestinian", "Gaza", "Hamas", "West Bank", "Rafah", "Ramallah", "PLO", "PA"],
  "Syria": ["Syrian", "Damascus", "Assad", "HTS", "Idlib"],
  "Iraq": ["Iraqi", "Baghdad", "Dinar", "Kurdish", "Kurdistan"],
  "Libya": ["Libyan", "Tripoli", "Benghazi"],
  "Egypt": ["Egyptian", "Cairo", "Sisi", "Pound"],
  "Nigeria": ["Nigerian", "Abuja", "Naira", "Tinubu"],
  "Ethiopia": ["Ethiopian", "Addis", "Tigray", "Amhara"],
  "Sudan": ["Sudanese", "Khartoum", "RSF", "SAF", "Darfur"],
  "Canada": ["Canadian", "Trudeau", "Carney", "Ottawa", "CAD"],
  "Australia": ["Australian", "Albanese", "Sydney", "AUD"],
  "Poland": ["Polish", "Warsaw", "Zloty", "NATO"],
};

// Primary search keyword used for Gamma API direct search (more focused than aliases)
const COUNTRY_SEARCH_TERMS: Record<string, string[]> = {
  "United States": ["Trump", "United States", "US tariff", "Federal Reserve"],
  "United Kingdom": ["United Kingdom", "UK"],
  "Russia": ["Russia", "Putin"],
  "China": ["China", "Xi Jinping"],
  "Ukraine": ["Ukraine", "Zelensky"],
  "Israel": ["Israel", "Gaza"],
  "Iran": ["Iran"],
  "Taiwan": ["Taiwan"],
  "North Korea": ["North Korea"],
  "Saudi Arabia": ["Saudi Arabia"],
  "European Union": ["European Union", "EU"],
};

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

async function searchGammaByKeyword(keyword: string): Promise<GammaEventsResponse> {
  return cachedFetch({
    cacheKey: `poly-search-${keyword.toLowerCase().replace(/\s+/g, "-").slice(0, 40)}-v1`,
    policy: { ...POLICY, ttlMs: 120_000, staleTtlMs: 15 * 60_000 },
    fallbackValue: [] as GammaEventsResponse,
    request: async () => {
      const url = `${GAMMA_BASE}/events?search=${encodeURIComponent(keyword)}&active=true&closed=false&limit=30&order=volume`;
      return fetchJsonOrThrow<GammaEventsResponse>(
        url,
        { headers: { "User-Agent": "WorldView/0.1" } },
        8_000,
      );
    },
  }).then((r) => r.data);
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
  const primaryNeedle = countryName.trim().toLowerCase();
  if (!primaryNeedle) {
    return { data: [], degraded: false, latencyMs: 0, cacheHit: "miss" };
  }

  const aliases = COUNTRY_ALIASES[countryName] ?? [];
  const needles = [primaryNeedle, ...aliases.map((a) => a.toLowerCase())];
  const matchesAnyNeedle = (text: string): boolean =>
    needles.some((n) => n.length > 2 ? text.includes(n) : new RegExp(`\\b${n}\\b`, "i").test(text));

  // Run snapshot + any direct keyword searches in parallel
  const directSearchTerms = COUNTRY_SEARCH_TERMS[countryName] ?? [];
  const [snapshot, ...directResults] = await Promise.all([
    getActiveEventsSnapshot(),
    ...directSearchTerms.slice(0, 2).map((term) =>
      searchGammaByKeyword(term).catch(() => [] as GammaEventsResponse)
    ),
  ]);

  // Merge snapshot + direct search events, deduplicate by event id
  const allEvents: GammaEventsResponse = [...snapshot.data];
  const seenIds = new Set(snapshot.data.map((e) => e.id));
  for (const batch of directResults) {
    for (const evt of batch) {
      if (!seenIds.has(evt.id)) {
        allEvents.push(evt);
        seenIds.add(evt.id);
      }
    }
  }

  if (!allEvents.length) {
    return {
      data: [],
      degraded: snapshot.degraded,
      latencyMs: snapshot.latencyMs,
      cacheHit: snapshot.cacheHit,
      error: snapshot.error,
    };
  }

  const seenMktIds = new Set<string>();
  const results: PredictionMarketItem[] = [];

  for (const evt of allEvents) {
    const evtText = `${evt.title} ${evt.description ?? ""}`.toLowerCase();
    // Events from direct search always match; snapshot events need alias check
    const evtFromDirect = !snapshot.data.some((e) => e.id === evt.id);
    const evtMatch = evtFromDirect || matchesAnyNeedle(evtText);

    for (const mkt of evt.markets ?? []) {
      if (mkt.closed || !mkt.active) continue;
      if (seenMktIds.has(mkt.id)) continue;
      const mktText = (mkt.question ?? "").toLowerCase();
      if (!evtMatch && !matchesAnyNeedle(mktText)) continue;
      seenMktIds.add(mkt.id);
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
