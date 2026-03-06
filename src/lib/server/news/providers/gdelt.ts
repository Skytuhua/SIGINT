import type {
  GdeltAggregatePoint,
  GdeltArticle,
  GdeltGeoPoint,
  GdeltTimelinePoint,
  NewsCategory,
} from "../../../news/types";
import type { ConflictEvent } from "../conflictZones/types";
import { cachedFetch, fetchJsonOrThrow, type CachedFetchResult, type UpstreamPolicy } from "../upstream";

const GDELT_DOC_BASE = "https://api.gdeltproject.org/api/v2/doc/doc";
const GDELT_GEO_BASE = "https://api.gdeltproject.org/api/v2/geo/geo";
const GDELT_CONTEXT_BASE = "https://api.gdeltproject.org/api/v2/context/context";

const DOC_POLICY: UpstreamPolicy = {
  key: "gdelt-doc",
  ttlMs: 90_000,
  staleTtlMs: 15 * 60_000,
  timeoutMs: 18_000,
  maxRetries: 0,
  backoffBaseMs: 400,
  circuitFailureThreshold: 8,
  circuitOpenMs: 15_000,
  rateLimit: { capacity: 4, refillPerSec: 2, minIntervalMs: 500 },
};

const GEO_POLICY: UpstreamPolicy = {
  key: "gdelt-geo",
  ttlMs: 90_000,
  staleTtlMs: 12 * 60_000,
  timeoutMs: 14_000,
  maxRetries: 0,
  backoffBaseMs: 450,
  circuitFailureThreshold: 5,
  circuitOpenMs: 20_000,
  rateLimit: { capacity: 6, refillPerSec: 5, minIntervalMs: 120 },
};

const CONTEXT_POLICY: UpstreamPolicy = {
  key: "gdelt-context",
  ttlMs: 10 * 60_000,
  staleTtlMs: 20 * 60_000,
  timeoutMs: 10_000,
  maxRetries: 2,
  backoffBaseMs: 500,
  circuitFailureThreshold: 3,
  circuitOpenMs: 2 * 60_000,
  rateLimit: { capacity: 4, refillPerSec: 3, minIntervalMs: 250 },
};

const TIMELINE_POLICY: UpstreamPolicy = {
  key: "gdelt-timeline",
  ttlMs: 5 * 60_000,
  staleTtlMs: 12 * 60_000,
  timeoutMs: 10_000,
  maxRetries: 2,
  backoffBaseMs: 450,
  circuitFailureThreshold: 3,
  circuitOpenMs: 2 * 60_000,
  rateLimit: { capacity: 4, refillPerSec: 3, minIntervalMs: 250 },
};

const EVENTS_POLICY: UpstreamPolicy = {
  key: "gdelt-events",
  ttlMs: 90_000,
  staleTtlMs: 12 * 60_000,
  timeoutMs: 12_000,
  maxRetries: 2,
  backoffBaseMs: 450,
  circuitFailureThreshold: 3,
  circuitOpenMs: 2 * 60_000,
  rateLimit: { capacity: 6, refillPerSec: 5, minIntervalMs: 120 },
};

export interface GdeltDocParams {
  q?: string;
  cat?: NewsCategory;
  country?: string;
  domain?: string;
  timespan?: string;
  from?: string;
  to?: string;
  lang?: string;
  maxrecords?: number;
}

export interface GdeltGeoParams {
  q?: string;
  timespan?: string;
  from?: string;
  to?: string;
  mode?: "pointdata" | "country" | "adm1";
  maxrecords?: number;
}

export interface GdeltEventsParams {
  timespan?: string;
  from?: string;
  to?: string;
  mode?: "strict" | "broad";
  maxrecords?: number;
  countryCode?: string;
}

const CAT_QUERY_MAP: Partial<Record<NewsCategory, string>> = {
  markets: "theme:ECON OR theme:ECON_BANKRUPTCY OR theme:ECON_TRADE",
  financial: "banking OR fintech OR \"central bank\" OR \"interest rate\" OR mortgage",
  ipo: "IPO OR \"initial public offering\" OR SPAC OR \"direct listing\"",
  tech: "software OR \"tech giant\" OR \"open source\" OR programming",
  ai: "\"artificial intelligence\" OR \"machine learning\" OR \"large language model\" OR GPT OR \"generative AI\"",
  cyber: "theme:CYBER_ATTACK OR cybersecurity OR ransomware OR \"data breach\" OR hacker",
  semiconductors: "semiconductor OR chipmaker OR TSMC OR NVIDIA OR \"chip shortage\" OR foundry",
  cloud: "\"cloud computing\" OR AWS OR Azure OR \"Google Cloud\" OR SaaS OR serverless",
  startups: "startup OR \"venture capital\" OR \"seed round\" OR unicorn OR accelerator",
  events: "CES OR WWDC OR \"tech conference\" OR summit OR keynote OR \"product launch\"",
  energy: "theme:ENERGY OR \"oil price\" OR \"natural gas\" OR OPEC",
  defense: "theme:MILITARY OR theme:CRISISLEX_C03_ARMED_CONFLICT",
  space: "NASA OR SpaceX OR satellite OR rocket OR \"space station\" OR orbit",
  biotech: "biotech OR pharmaceutical OR \"FDA approval\" OR \"clinical trial\" OR genomics",
  crypto: "bitcoin OR ethereum OR cryptocurrency",
  world: "theme:UNGP_HUMAN_RIGHTS OR election OR government",
  filings: "\"SEC filing\" OR \"annual report\" OR \"quarterly report\"",
  local: "\"city council\" OR \"local government\" OR county OR regional",
  government: "congress OR senate OR legislation OR \"executive order\" OR \"white house\" OR policy OR regulation",
};

function buildQuery(params: GdeltDocParams): string {
  const parts: string[] = [];
  if (params.q?.trim()) parts.push(params.q.trim());
  if (params.cat && CAT_QUERY_MAP[params.cat]) parts.push(`(${CAT_QUERY_MAP[params.cat]})`);
  if (params.country) parts.push(`sourcecountry:${params.country.toUpperCase()}`);
  if (params.domain) parts.push(`domain:${params.domain}`);
  return parts.filter(Boolean).join(" ") || "(sourcelang:english OR sourcelang:spanish)";
}

function applyTime(url: URL, timespan?: string, from?: string, to?: string): void {
  if (timespan) url.searchParams.set("timespan", timespan);
  if (from) url.searchParams.set("startdatetime", `${from.replace(/-/g, "")}000000`);
  if (to) url.searchParams.set("enddatetime", `${to.replace(/-/g, "")}235959`);
}

function parsePoint(row: Record<string, unknown>): GdeltGeoPoint | null {
  const lat = Number(row.lat ?? row.latitude ?? row.centroidlat);
  const lon = Number(row.lon ?? row.longitude ?? row.centroidlon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const count = Number(row.count ?? row.value ?? row.numarticles ?? 1);
  return {
    name: String(row.name ?? row.fullname ?? row.country ?? row.adm1 ?? ""),
    fullname: String(row.fullname ?? row.name ?? row.country ?? row.adm1 ?? ""),
    countrycode: String(row.countrycode ?? row.code ?? row.country ?? "").slice(0, 2).toUpperCase(),
    lat,
    lon,
    count: Number.isFinite(count) ? count : 1,
  };
}

function parseAggregate(row: Record<string, unknown>): GdeltAggregatePoint | null {
  const p = parsePoint(row);
  if (!p) return null;
  return {
    key: String(row.countrycode ?? row.code ?? row.name ?? p.fullname),
    label: p.fullname,
    count: p.count,
    lat: p.lat,
    lon: p.lon,
  };
}

export async function getGdeltArticles(params: GdeltDocParams): Promise<CachedFetchResult<GdeltArticle[]>> {
  const query = buildQuery(params);
  const url = new URL(GDELT_DOC_BASE);
  url.searchParams.set("query", query);
  url.searchParams.set("mode", "artlist");
  url.searchParams.set("format", "json");
  url.searchParams.set("sort", "DateDesc");
  // Use smaller maxrecords for broad/default queries to reduce GDELT load
  const defaultMax = query.includes("sourcelang:") ? 75 : 250;
  url.searchParams.set("maxrecords", String(Math.max(1, Math.min(250, params.maxrecords ?? defaultMax))));
  if (params.lang) url.searchParams.set("sourcelang", params.lang);
  applyTime(url, params.timespan, params.from, params.to);

  return cachedFetch({
    cacheKey: url.toString(),
    policy: DOC_POLICY,
    fallbackValue: [],
    request: async () => {
      const json = await fetchJsonOrThrow<{ articles?: GdeltArticle[] }>(
        url.toString(),
        { headers: { "User-Agent": "WorldView/0.1 (research)" } },
        DOC_POLICY.timeoutMs
      );
      return json.articles ?? [];
    },
  });
}

export async function getGdeltGeo(params: GdeltGeoParams): Promise<
  CachedFetchResult<{ mode: "pointdata" | "country" | "adm1"; points: GdeltGeoPoint[]; aggregates: GdeltAggregatePoint[] }>
> {
  const mode = params.mode ?? "pointdata";
  const GEO_STOPWORDS = new Set(["news", "the", "a", "an", "in", "of", "on"]);
  const geoQ = (params.q ?? "").split(/\s+/).filter((w) => w && !GEO_STOPWORDS.has(w.toLowerCase())).join(" ");
  const url = new URL(GDELT_GEO_BASE);
  url.searchParams.set("query", geoQ.trim() || "sourcelang:english");
  url.searchParams.set("mode", mode);
  url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", String(Math.max(1, Math.min(250, params.maxrecords ?? 100))));
  applyTime(url, params.timespan, params.from, params.to);

  return cachedFetch({
    cacheKey: url.toString(),
    policy: GEO_POLICY,
    fallbackValue: { mode, points: [], aggregates: [] },
    request: async () => {
      const json = await fetchJsonOrThrow<Record<string, unknown>>(
        url.toString(),
        { headers: { "User-Agent": "WorldView/0.1 (research)" } },
        GEO_POLICY.timeoutMs
      );
      const rowsRaw = Array.isArray(json.map)
        ? (json.map as Record<string, unknown>[])
        : Array.isArray(json.features)
          ? (json.features as Record<string, unknown>[])
          : [];
      if (mode === "pointdata") {
        const points = rowsRaw.map(parsePoint).filter((p): p is GdeltGeoPoint => Boolean(p));
        return { mode, points, aggregates: [] };
      }
      const aggregates = rowsRaw
        .map(parseAggregate)
        .filter((p): p is GdeltAggregatePoint => Boolean(p));
      const points = aggregates.map((agg) => ({
        name: agg.label,
        fullname: agg.label,
        countrycode: agg.key.slice(0, 2).toUpperCase(),
        lat: agg.lat,
        lon: agg.lon,
        count: agg.count,
      }));
      return { mode, points, aggregates };
    },
  });
}

export async function getGdeltContext(query: string): Promise<CachedFetchResult<GdeltArticle[]>> {
  const q = query.trim();
  if (!q) {
    return { data: [], degraded: false, latencyMs: 0, cacheHit: "miss" };
  }

  const url = new URL(GDELT_CONTEXT_BASE);
  url.searchParams.set("query", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", "20");

  return cachedFetch({
    cacheKey: url.toString(),
    policy: CONTEXT_POLICY,
    fallbackValue: [],
    request: async () => {
      const json = await fetchJsonOrThrow<{ articles?: GdeltArticle[] }>(
        url.toString(),
        { headers: { "User-Agent": "WorldView/0.1 (research)" } },
        CONTEXT_POLICY.timeoutMs
      );
      return json.articles ?? [];
    },
  });
}

export async function getGdeltTimeline(
  query: string,
  timespan = "7d"
): Promise<CachedFetchResult<GdeltTimelinePoint[]>> {
  const url = new URL(GDELT_DOC_BASE);
  url.searchParams.set("query", query.trim() || "sourcelang:english");
  url.searchParams.set("mode", "timelinevol");
  url.searchParams.set("format", "json");
  url.searchParams.set("timespan", timespan);

  return cachedFetch({
    cacheKey: url.toString(),
    policy: TIMELINE_POLICY,
    fallbackValue: [],
    request: async () => {
      const json = await fetchJsonOrThrow<{ timeline?: Array<{ date: string; value: number }> }>(
        url.toString(),
        { headers: { "User-Agent": "WorldView/0.1 (research)" } },
        TIMELINE_POLICY.timeoutMs
      );
      return (json.timeline ?? []).map((point) => ({
        date: point.date,
        value: Number(point.value) || 0,
      }));
    },
  });
}

const CONFLICT_QUERY_STRICT =
  'theme:CRISISLEX_C03_ARMED_CONFLICT OR ("armed conflict" OR "military attack" OR airstrike OR shelling OR "armed assault" OR bombing)';
const CONFLICT_QUERY_BROAD =
  CONFLICT_QUERY_STRICT +
  ' OR clashes OR firefight OR insurgent OR militia OR bombardment OR "rocket attack" OR crossfire';

/**
 * Fetches conflict-related event signals from GDELT Geo API.
 * Uses conflict-themed queries (material conflict / armed conflict) to approximate
 * QuadClass=4 (Material Conflict) signals. Returns geographic points as ConflictEvent inputs.
 */
export async function getGdeltEvents(
  params: GdeltEventsParams
): Promise<CachedFetchResult<ConflictEvent[]>> {
  const mode = params.mode ?? "strict";
  const query = mode === "broad" ? CONFLICT_QUERY_BROAD : CONFLICT_QUERY_STRICT;
  const timespan = params.timespan ?? "24h";
  const maxrecords = Math.max(1, Math.min(250, params.maxrecords ?? 200));

  const geoResult = await getGdeltGeo({
    q: query,
    timespan,
    from: params.from,
    to: params.to,
    mode: "pointdata",
    maxrecords,
  });

  let points = geoResult.data.points;
  if (params.countryCode && params.countryCode.length === 2) {
    const code = params.countryCode.toUpperCase();
    points = points.filter((p) => (p.countrycode ?? "").toUpperCase() === code);
  }

  const now = Date.now();
  const events: ConflictEvent[] = points.map((p, idx) => {
    const mentionCount = p.count ?? 1;
    const severityWeight = Math.min(100, 40 + Math.log10(1 + mentionCount) * 20);
    return {
      id: `gdelt-evt-${idx}-${p.lat.toFixed(2)}-${p.lon.toFixed(2)}`,
      timestamp: now,
      lat: p.lat,
      lon: p.lon,
      source: "gdelt_geo" as const,
      country: p.countrycode ?? undefined,
      locationName: p.fullname || p.name,
      actors: [],
      articleCount: mentionCount,
      mentionCount,
      severityWeight,
      verified: false,
      sourceUrl: undefined,
    };
  });

  return {
    data: events,
    degraded: geoResult.degraded,
    latencyMs: geoResult.latencyMs,
    cacheHit: geoResult.cacheHit,
  };
}
