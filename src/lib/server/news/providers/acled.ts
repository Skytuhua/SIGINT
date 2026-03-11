import { cachedFetch, fetchJsonOrThrow, type CachedFetchResult, type UpstreamPolicy } from "../upstream";

const GDELT_DOC_BASE = "https://api.gdeltproject.org/api/v2/doc/doc";

const POLICY: UpstreamPolicy = {
  key: "conflict-gdelt",
  ttlMs: 60 * 60_000,
  staleTtlMs: 24 * 60 * 60_000,
  timeoutMs: 15_000,
  maxRetries: 2,
  backoffBaseMs: 1_000,
  circuitFailureThreshold: 3,
  circuitOpenMs: 10 * 60_000,
  rateLimit: { capacity: 4, refillPerSec: 1, minIntervalMs: 2_000 },
};

export interface AcledEvent {
  eventId: string;
  eventDate: string;
  eventType: string;
  subEventType: string;
  country: string;
  admin1: string;
  location: string;
  latitude: number;
  longitude: number;
  fatalities: number;
  notes: string;
  source: string;
  actor1: string;
  actor2: string;
}

export interface AcledCountrySummary {
  totalEvents: number;
  totalFatalities: number;
  battles: number;
  protests: number;
  riots: number;
  violenceAgainstCivilians: number;
  explosions: number;
  strategicDevelopments: number;
  events: AcledEvent[];
}

const EVENT_TYPE_WEIGHTS: Record<string, number> = {
  "Battles": 10,
  "Violence against civilians": 8,
  "Explosions/Remote violence": 7,
  "Riots": 6,
  "Protests": 5,
  "Strategic developments": 3,
};

export function computeAcledInstabilityScore(summary: AcledCountrySummary): number {
  let raw = 0;
  raw += summary.battles * (EVENT_TYPE_WEIGHTS["Battles"] ?? 1);
  raw += summary.violenceAgainstCivilians * (EVENT_TYPE_WEIGHTS["Violence against civilians"] ?? 1);
  raw += summary.explosions * (EVENT_TYPE_WEIGHTS["Explosions/Remote violence"] ?? 1);
  raw += summary.riots * (EVENT_TYPE_WEIGHTS["Riots"] ?? 1);
  raw += summary.protests * (EVENT_TYPE_WEIGHTS["Protests"] ?? 1);
  raw += summary.strategicDevelopments * (EVENT_TYPE_WEIGHTS["Strategic developments"] ?? 1);
  raw += summary.totalFatalities * 2;
  return Math.min(100, Math.round(raw / Math.max(1, summary.totalEvents + summary.totalFatalities) * 10));
}

const CONFLICT_THEMES: Record<string, keyof Pick<AcledCountrySummary, "battles" | "protests" | "riots" | "violenceAgainstCivilians" | "explosions" | "strategicDevelopments">> = {
  "KILL": "violenceAgainstCivilians",
  "TERROR": "explosions",
  "PROTEST": "protests",
  "RIOT": "riots",
  "MILITARY": "battles",
  "ARMED_CONFLICT": "battles",
  "REBELLION": "battles",
  "BOMB": "explosions",
  "WOUND": "violenceAgainstCivilians",
  "ARREST": "strategicDevelopments",
  "COUP": "strategicDevelopments",
  "SIEGE": "battles",
};

interface GdeltTimelineEntry {
  date: string;
  value: number;
}

interface GdeltDocArticle {
  url: string;
  title: string;
  seendate: string;
  domain: string;
  language: string;
  sourcecountry?: string;
  tone?: number;
}

async function fetchGdeltConflictCount(
  country: string,
  theme: string,
  timespan: string,
): Promise<number> {
  const query = `${theme} sourcecountry:${country}`;
  const url = `${GDELT_DOC_BASE}?query=${encodeURIComponent(query)}&timespan=${timespan}&mode=timelinevol&format=json`;
  try {
    const resp = await fetchJsonOrThrow<{ timeline?: Array<{ data: GdeltTimelineEntry[] }> }>(
      url,
      { headers: { "User-Agent": "SIGINT/0.1" } },
      POLICY.timeoutMs,
    );
    const series = resp.timeline?.[0]?.data ?? [];
    return series.reduce((sum, pt) => sum + (Number(pt.value) || 0), 0);
  } catch {
    return 0;
  }
}

async function fetchGdeltConflictArticles(
  country: string,
  timespan: string,
): Promise<GdeltDocArticle[]> {
  const query = `(conflict OR protest OR military OR violence OR attack OR bombing) sourcecountry:${country}`;
  const url = `${GDELT_DOC_BASE}?query=${encodeURIComponent(query)}&timespan=${timespan}&mode=artlist&maxrecords=50&format=json`;
  try {
    const resp = await fetchJsonOrThrow<{ articles?: GdeltDocArticle[] }>(
      url,
      { headers: { "User-Agent": "SIGINT/0.1" } },
      POLICY.timeoutMs,
    );
    return resp.articles ?? [];
  } catch {
    return [];
  }
}

function classifyArticle(title: string): keyof Pick<AcledCountrySummary, "battles" | "protests" | "riots" | "violenceAgainstCivilians" | "explosions" | "strategicDevelopments"> {
  const t = title.toLowerCase();
  if (/\b(protest|demonstrat|march|rally)\b/.test(t)) return "protests";
  if (/\b(riot|loot|unrest)\b/.test(t)) return "riots";
  if (/\b(bomb|explo|missile|drone|strike|shell)\b/.test(t)) return "explosions";
  if (/\b(kill|murder|massacre|execution|civilian)\b/.test(t)) return "violenceAgainstCivilians";
  if (/\b(battle|combat|fight|clash|militar|war|offensive|invasi)\b/.test(t)) return "battles";
  return "strategicDevelopments";
}

function estimateFatalities(title: string): number {
  const match = title.match(/(\d+)\s*(?:killed|dead|die|fatalities|casualties)/i);
  return match ? Math.min(Number(match[1]) || 0, 1000) : 0;
}

export async function getAcledCountryEvents(
  country: string,
  days = 30,
): Promise<CachedFetchResult<AcledCountrySummary>> {
  const empty: AcledCountrySummary = {
    totalEvents: 0,
    totalFatalities: 0,
    battles: 0,
    protests: 0,
    riots: 0,
    violenceAgainstCivilians: 0,
    explosions: 0,
    strategicDevelopments: 0,
    events: [],
  };

  return cachedFetch({
    cacheKey: `conflict-gdelt-${country.toLowerCase()}-${days}d`,
    policy: POLICY,
    fallbackValue: empty,
    request: async () => {
      const timespan = `${days}d`;
      const articles = await fetchGdeltConflictArticles(country, timespan);

      const summary: AcledCountrySummary = { ...empty, events: [] };
      summary.totalEvents = articles.length;

      for (const art of articles) {
        const category = classifyArticle(art.title ?? "");
        summary[category]++;

        const fat = estimateFatalities(art.title ?? "");
        summary.totalFatalities += fat;

        summary.events.push({
          eventId: art.url,
          eventDate: art.seendate ?? "",
          eventType: category,
          subEventType: "",
          country,
          admin1: "",
          location: "",
          latitude: 0,
          longitude: 0,
          fatalities: fat,
          notes: art.title ?? "",
          source: art.domain ?? "",
          actor1: "",
          actor2: "",
        });
      }

      return summary;
    },
  });
}
