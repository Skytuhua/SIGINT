"use client";

import { useCallback, useEffect, useMemo, ReactNode, useRef, useState } from "react";
import { CATEGORY_COLORS } from "../../config/newsConfig";
import { INFRASTRUCTURE_DATA } from "../../data/infrastructure";
import { isCountryMatch, normalizeCountryCode } from "../../lib/news/countryCode";
import type {
  CountryInfrastructure,
  CountryProfile,
  NewsArticle,
  NewsCategory,
  PredictionMarketItem,
} from "../../lib/news/types";
import { useWorldViewStore } from "../../store";
import IconButton from "../dashboard/controls/IconButton";
import DenseSelect from "../dashboard/controls/DenseSelect";
import PanelBody from "../dashboard/panel/PanelBody";
import PanelFooter from "../dashboard/panel/PanelFooter";
import PanelTabs from "../dashboard/panel/PanelTabs";

const ISO2_TO_NAME: Record<string, string> = {
  US: "United States", GB: "United Kingdom", FR: "France", DE: "Germany",
  IT: "Italy", JP: "Japan", CN: "China", IN: "India", RU: "Russia",
  CA: "Canada", AU: "Australia", BR: "Brazil", ZA: "South Africa",
  MX: "Mexico", KR: "South Korea", TW: "Taiwan", IL: "Israel",
  EG: "Egypt", SA: "Saudi Arabia", IR: "Iran", SY: "Syria",
  UA: "Ukraine", PL: "Poland", ES: "Spain", NG: "Nigeria",
  AR: "Argentina", CO: "Colombia", TH: "Thailand", ID: "Indonesia",
  MY: "Malaysia", PH: "Philippines", VN: "Vietnam", PK: "Pakistan",
  BD: "Bangladesh", TR: "Turkey", SE: "Sweden", NO: "Norway",
  DK: "Denmark", FI: "Finland", NL: "Netherlands", BE: "Belgium",
  AT: "Austria", CH: "Switzerland", PT: "Portugal", GR: "Greece",
  CZ: "Czech Republic", RO: "Romania", HU: "Hungary", IE: "Ireland",
  NZ: "New Zealand", SG: "Singapore", AE: "United Arab Emirates",
  QA: "Qatar", KW: "Kuwait", IQ: "Iraq", AF: "Afghanistan",
  KE: "Kenya", ET: "Ethiopia", GH: "Ghana", TZ: "Tanzania",
  CL: "Chile", PE: "Peru", VE: "Venezuela", EC: "Ecuador",
  GL: "Greenland", IS: "Iceland",
};

const ISO2_TO_FLAG: Record<string, string> = {};

function getFlag(code: string): string {
  if (ISO2_TO_FLAG[code]) return ISO2_TO_FLAG[code];
  if (code.length !== 2) return "";
  const flag = String.fromCodePoint(
    ...code.toUpperCase().split("").map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  );
  ISO2_TO_FLAG[code] = flag;
  return flag;
}

const CONFLICT_CATS: NewsCategory[] = ["defense", "world"];
const SECURITY_CATS: NewsCategory[] = ["cyber"];
const INFO_CATS: NewsCategory[] = ["tech", "ai", "semiconductors", "cloud"];

// Domains that routinely produce non-geopolitical noise for country profiles.
const BLOCKED_NEWS_DOMAINS = new Set<string>(["producthunt.com"]);

function buildProfile(code: string, articles: NewsArticle[]): CountryProfile {
  const filtered = articles.filter((article) => !BLOCKED_NEWS_DOMAINS.has(article.domain));

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60_000;

  let unrest = 0;
  let conflict = 0;
  let security = 0;
  let information = 0;
  for (const article of filtered) {
    const score = article.score ?? 0;
    if (CONFLICT_CATS.includes(article.category)) conflict += score;
    else if (SECURITY_CATS.includes(article.category)) security += score;
    else if (INFO_CATS.includes(article.category)) information += score;
    else unrest += score;
  }

  const total = unrest + conflict + security + information;
  const index = Math.min(100, Math.round(total / Math.max(filtered.length, 1)));

  const recentArticles = filtered.filter((a) => a.publishedAt >= sevenDaysAgo);
  const olderArticles = filtered.filter((a) => a.publishedAt < sevenDaysAgo);
  const trend: CountryProfile["trend"] =
    recentArticles.length > olderArticles.length
      ? "rising"
      : recentArticles.length < olderArticles.length
        ? "falling"
        : "stable";

  const dayBuckets: Record<string, { protest: number; conflict: number; natural: number; military: number }> = {};
  for (let day = 6; day >= 0; day -= 1) {
    const date = new Date(now - day * 24 * 60 * 60_000).toISOString().slice(0, 10);
    dayBuckets[date] = { protest: 0, conflict: 0, natural: 0, military: 0 };
  }

  for (const article of filtered) {
    const date = new Date(article.publishedAt).toISOString().slice(0, 10);
    if (!dayBuckets[date]) continue;
    if (article.category === "defense") dayBuckets[date].military += 1;
    else if (CONFLICT_CATS.includes(article.category)) dayBuckets[date].conflict += 1;
    else if (article.category === "energy" || article.category === "space") dayBuckets[date].natural += 1;
    else dayBuckets[date].protest += 1;
  }

  return {
    code,
    name: ISO2_TO_NAME[code] || code,
    instabilityIndex: index,
    trend,
    breakdown: {
      unrest: Math.min(100, Math.round((unrest / Math.max(total, 1)) * 100)),
      conflict: Math.min(100, Math.round((conflict / Math.max(total, 1)) * 100)),
      security: Math.min(100, Math.round((security / Math.max(total, 1)) * 100)),
      information: Math.min(100, Math.round((information / Math.max(total, 1)) * 100)),
    },
    articles: filtered,
    timeline: Object.entries(dayBuckets).map(([date, counts]) => ({ date, ...counts })),
  };
}

function threatLevel(index: number): { label: string; className: string } {
  if (index >= 70) return { label: "HIGH", className: "wv-cm-threat-high" };
  if (index >= 40) return { label: "MEDIUM", className: "wv-cm-threat-medium" };
  return { label: "LOW", className: "wv-cm-threat-low" };
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatVolume(raw: number | string | undefined): string {
  const vol = Number(raw) || 0;
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(1)}K`;
  return `${vol.toFixed(0)}`;
}

function normalizeMarketSplit(yesRaw: number, noRaw: number): { yesPct: number; noPct: number } {
  const yesSafe = Number.isFinite(yesRaw) ? Math.max(0, Math.min(1, yesRaw)) : 0;
  const noSafe = Number.isFinite(noRaw) ? Math.max(0, Math.min(1, noRaw)) : 1 - yesSafe;
  const total = yesSafe + noSafe;
  if (total <= 0) return { yesPct: 50, noPct: 50 };
  const yesPct = Math.max(1, Math.min(99, Math.round((yesSafe / total) * 100)));
  return { yesPct, noPct: Math.max(1, 100 - yesPct) };
}

const TIMELINE_ROWS = [
  { key: "protest" as const, label: "Protest", color: "#f4d03f" },
  { key: "conflict" as const, label: "Conflict", color: "#e53935" },
  { key: "natural" as const, label: "Natural", color: "#9c6bff" },
  { key: "military" as const, label: "Military", color: "#5c8cb5" },
];

interface CountryApiData {
  compositeIndex?: number;
  acledScore?: number;
  governanceDeficit?: number;
  acledSummary?: {
    totalEvents: number;
    totalFatalities: number;
    battles: number;
    protests: number;
    riots: number;
    violenceAgainstCivilians: number;
    explosions: number;
    strategicDevelopments: number;
  };
  governance?: {
    politicalStability: number | null;
    ruleOfLaw: number | null;
    controlOfCorruption: number | null;
    governmentEffectiveness: number | null;
    regulatoryQuality: number | null;
    voiceAccountability: number | null;
    year: number;
  };
  predictionMarkets?: PredictionMarketItem[];
}

interface Props {
  countryCode: string;
  dockSide?: "left" | "right";
  onClose: () => void;
}

type DetailStatus = "idle" | "loading" | "ready" | "error" | "unsupported";
type InfraTab = "pipelines" | "dataCenters" | "nuclearFacilities";
type SummaryUnavailableReason =
  | "unsupported_url"
  | "fetch_failed"
  | "empty_content"
  | "invalid_url"
  | "low_relevance";

interface ArticleSummaryResponse {
  summary: string | null;
  engine: "openai" | "extractive" | "none";
  degraded: boolean;
  cacheHit: "fresh" | "stale" | "miss";
  latencyMs: number;
  sourceUrl: string;
  model?: string;
  unavailableReason?: SummaryUnavailableReason;
  error?: string;
}

const summaryMemo = new Map<string, ArticleSummaryResponse>();
const summaryInflight = new Map<string, Promise<ArticleSummaryResponse>>();
const SUMMARY_MEMO_MAX = 200;

function putSummaryMemo(key: string, payload: ArticleSummaryResponse): void {
  if (summaryMemo.size >= SUMMARY_MEMO_MAX) {
    const oldestKey = summaryMemo.keys().next().value;
    if (oldestKey) summaryMemo.delete(oldestKey);
  }
  summaryMemo.set(key, payload);
}

function getDetailStatus(payload: ArticleSummaryResponse | null): DetailStatus {
  if (!payload) return "error";
  if (payload.summary) return "ready";
  if (payload.unavailableReason === "unsupported_url" || payload.unavailableReason === "invalid_url") return "unsupported";
  return "error";
}

function fetchSummaryWithDedup(cacheKey: string, params: URLSearchParams): Promise<ArticleSummaryResponse> {
  const existing = summaryInflight.get(cacheKey);
  if (existing) return existing;

  const request = fetch(`/api/news/article-summary?${params.toString()}`, { cache: "default" })
    .then(async (response) => {
      if (!response.ok) throw new Error(`summary returned ${response.status}`);
      return (await response.json()) as ArticleSummaryResponse;
    })
    .finally(() => {
      summaryInflight.delete(cacheKey);
    });

  summaryInflight.set(cacheKey, request);
  return request;
}

function setUrlCountryParam(code: string | null): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (code) url.searchParams.set("country", code);
  else url.searchParams.delete("country");
  window.history.replaceState(null, "", url.toString());
}

function fmtUtcTime(ts: number | null | undefined): string {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return "--";
  return new Date(ts).toISOString().slice(0, 16).replace("T", " ") + "Z";
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function formatPct(value01: number): string {
  return `${Math.round(clamp01(value01) * 100)}%`;
}

function ArticleDetailAside({
  article,
  detailStatus,
  detailSummary,
  onClose,
}: {
  article: NewsArticle;
  detailStatus: DetailStatus;
  detailSummary: ArticleSummaryResponse | null;
  onClose: () => void;
}) {
  return (
    <aside className="wv-country-detail is-standalone" aria-label="News detail">
      <div className="wv-country-detail-header">
        <div className="wv-country-detail-title">DETAIL</div>
        <div className="wv-country-detail-controls">
          <button
            type="button"
            className="wv-inline-action"
            onClick={() => window.open(article.url, "_blank", "noopener,noreferrer")}
          >
            OPEN
          </button>
          <button type="button" className="wv-inline-action" onClick={onClose}>
            CLOSE
          </button>
        </div>
      </div>
      <div className="wv-country-detail-body">
        <div className="wv-country-detail-headline" title={article.headline}>
          {article.headline}
        </div>
        <div className="wv-country-detail-meta">
          <span>{article.source}</span>
          <span className="wv-country-sep">|</span>
          <span>{fmtUtcTime(article.publishedAt)}</span>
          <span className="wv-country-sep">|</span>
          <span>{article.domain}</span>
        </div>
        <div className="wv-country-detail-section">
          <div className="wv-country-detail-label">SUMMARY</div>
          {detailStatus === "loading" ? (
            <div className="wv-panel-state">
              <div className="wv-skeleton-row" />
              <div className="wv-skeleton-row" />
              <div className="wv-skeleton-row" />
            </div>
          ) : null}
          {detailStatus === "ready" && detailSummary?.summary ? (
            <div className="wv-country-detail-text">{detailSummary.summary}</div>
          ) : null}
          {detailStatus === "unsupported" ? (
            <div className="wv-country-detail-muted">Summary is unavailable for this link type.</div>
          ) : null}
          {detailStatus === "error" ? (
            <div className="wv-country-detail-muted">Could not generate a full-article summary right now.</div>
          ) : null}
        </div>
        {article.snippet ? (
          <div className="wv-country-detail-section">
            <div className="wv-country-detail-label">SNIPPET</div>
            <div className="wv-country-detail-text">{article.snippet}</div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

export default function CountryDetailModal({ countryCode, dockSide = "left", onClose }: Props) {
  const normalizedCountryCode = normalizeCountryCode(countryCode) ?? countryCode.toUpperCase();
  const feedItems = useWorldViewStore((s) => s.news.feedItems);
  const setNewsUiState = useWorldViewStore((s) => s.setNewsUiState);
  const savedSearches = useWorldViewStore((s) => s.news.savedSearches);
  const alerts = useWorldViewStore((s) => s.news.alerts);
  const saveNewsSearch = useWorldViewStore((s) => s.saveNewsSearch);
  const deleteNewsSearch = useWorldViewStore((s) => s.deleteNewsSearch);
  const upsertNewsAlert = useWorldViewStore((s) => s.upsertNewsAlert);
  const ackNewsAlert = useWorldViewStore((s) => s.ackNewsAlert);
  const setNewsQuery = useWorldViewStore((s) => s.setNewsQuery);
  const setNewsUiStateRef = useRef(setNewsUiState);
  const [apiData, setApiData] = useState<CountryApiData | null>(null);
  const [countryNews, setCountryNews] = useState<NewsArticle[]>([]);
  const [apiLoading, setApiLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [marketsError, setMarketsError] = useState<string | null>(null);
  const [hasMarketsData, setHasMarketsData] = useState(false);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);

  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);
  const [detailStatus, setDetailStatus] = useState<DetailStatus>("idle");
  const [detailSummary, setDetailSummary] = useState<ArticleSummaryResponse | null>(null);

  const fetchCountryProfile = useCallback(async () => {
    setApiLoading(true);
    setApiError(null);
    setMarketsError(null);
    try {
      const resp = await fetch(`/api/news/country-profile?country=${normalizedCountryCode}`);
      if (resp.ok) {
        const data = (await resp.json()) as CountryApiData;
        setApiData(data);
        if (Array.isArray(data.predictionMarkets) && data.predictionMarkets.length > 0) {
          setHasMarketsData(true);
        }
      } else {
        setApiError("Failed to load country profile.");
        if (!hasMarketsData) {
          setMarketsError("Failed to load prediction markets.");
        } else {
          setMarketsError("Prediction markets temporarily unavailable; showing last data.");
        }
      }
    } catch {
      setApiError("Failed to load country profile.");
      if (!hasMarketsData) {
        setMarketsError("Failed to load prediction markets.");
      } else {
        setMarketsError("Prediction markets temporarily unavailable; showing last data.");
      }
    } finally {
      setApiLoading(false);
    }
  }, [hasMarketsData, normalizedCountryCode]);

  const fetchCountryNews = useCallback(async () => {
    setNewsLoading(true);
    setNewsError(null);
    try {
      const resp = await fetch(`/api/news/search?q=country:${normalizedCountryCode}&cat=&timespan=7d&limit=30`);
      if (resp.ok) {
        const data = (await resp.json()) as { items?: NewsArticle[] };
        if (Array.isArray(data.items)) setCountryNews(data.items);
      } else {
        setCountryNews([]);
        setNewsError("Failed to load country news.");
      }
    } catch {
      setCountryNews([]);
      setNewsError("Failed to load country news.");
    } finally {
      setNewsLoading(false);
    }
  }, [normalizedCountryCode]);

  useEffect(() => {
    void fetchCountryProfile();
    void fetchCountryNews();
  }, [fetchCountryNews, fetchCountryProfile]);

  const profile = useMemo(() => {
    const localMatched = feedItems.filter((article) => isCountryMatch(article.country, normalizedCountryCode));
    const merged = [...localMatched];
    for (const article of countryNews) {
      if (!merged.some((existing) => existing.id === article.id)) {
        merged.push(article);
      }
    }
    return buildProfile(normalizedCountryCode, merged);
  }, [countryNews, feedItems, normalizedCountryCode]);

  const hasAcledEvents = !!(apiData?.acledSummary && apiData.acledSummary.totalEvents > 0);
  const hasGovernanceIndicators = !!(
    apiData?.governance &&
    [
      apiData.governance.politicalStability,
      apiData.governance.ruleOfLaw,
      apiData.governance.controlOfCorruption,
      apiData.governance.governmentEffectiveness,
      apiData.governance.regulatoryQuality,
      apiData.governance.voiceAccountability,
    ].some((v) => typeof v === "number")
  );
  const backendIndexRaw =
    typeof apiData?.compositeIndex === "number" && Number.isFinite(apiData.compositeIndex)
      ? apiData.compositeIndex
      : undefined;
  const instabilityIndex = backendIndexRaw ?? profile.instabilityIndex;
  const noInstabilityData =
    (backendIndexRaw === 0 || backendIndexRaw === undefined) &&
    profile.instabilityIndex === 0 &&
    !hasAcledEvents &&
    !hasGovernanceIndicators;
  const threat = noInstabilityData ? { label: "N/A", className: "" } : threatLevel(instabilityIndex);
  const trendText =
    profile.trend === "rising"
      ? "Rising"
      : profile.trend === "falling"
        ? "Falling"
        : "Stable";

  const sortedArticles = useMemo(
    () => [...profile.articles].sort((a, b) => b.publishedAt - a.publishedAt),
    [profile.articles]
  );
  const topHeadline = sortedArticles[0] ?? null;

  const maxTimelineVal = useMemo(() => {
    let max = 1;
    for (const day of profile.timeline) {
      for (const row of TIMELINE_ROWS) {
        max = Math.max(max, day[row.key]);
      }
    }
    return max;
  }, [profile.timeline]);

  const breakdownData = useMemo(() => {
    if (apiData?.acledSummary) {
      const acled = apiData.acledSummary;
      const total = acled.totalEvents || 1;
      return [
        { label: "Unrest", value: Math.round(((acled.protests + acled.riots) / total) * 100), code: "U" },
        { label: "Conflict", value: Math.round(((acled.battles + acled.violenceAgainstCivilians) / total) * 100), code: "C" },
        { label: "Security", value: Math.round((acled.explosions / total) * 100), code: "S" },
        { label: "Information", value: Math.round((acled.strategicDevelopments / total) * 100), code: "I" },
      ];
    }
    return [
      { label: "Unrest", value: profile.breakdown.unrest, code: "U" },
      { label: "Conflict", value: profile.breakdown.conflict, code: "C" },
      { label: "Security", value: profile.breakdown.security, code: "S" },
      { label: "Information", value: profile.breakdown.information, code: "I" },
    ];
  }, [apiData?.acledSummary, profile.breakdown]);

  const infrastructure = useMemo<CountryInfrastructure>(() => {
    return INFRASTRUCTURE_DATA[normalizedCountryCode] ?? { pipelines: [], dataCenters: [], nuclearFacilities: [] };
  }, [normalizedCountryCode]);

  const predictionMarkets = apiData?.predictionMarkets ?? [];

  const countryDisplayName = useMemo(() => {
    const known = ISO2_TO_NAME[normalizedCountryCode];
    if (known) return known;
    try {
      const display = new Intl.DisplayNames(["en"], { type: "region" }).of(normalizedCountryCode);
      if (display && display !== normalizedCountryCode) return display;
    } catch {
      // ignore
    }
    return normalizedCountryCode;
  }, [normalizedCountryCode]);

  useEffect(() => {
    setNewsUiStateRef.current = setNewsUiState;
  }, [setNewsUiState]);

  useEffect(() => {
    setUrlCountryParam(normalizedCountryCode);
  }, [normalizedCountryCode]);

  const countryDock = useWorldViewStore((s) => s.news.ui.countryDock);
  const isPinned = countryDock.pinned;
  const showQuickActions = countryDock.showQuickActions;

  const trackedSavedSearch = useMemo(() => {
    const id = `country-${normalizedCountryCode}`;
    return savedSearches.some((s) => s.id === id);
  }, [normalizedCountryCode, savedSearches]);

  const trackedAlert = useMemo(() => {
    const id = `country-${normalizedCountryCode}`;
    return alerts.some((a) => a.id === id && a.enabled);
  }, [alerts, normalizedCountryCode]);

  const setDockState = (partial: Partial<(typeof countryDock) >) => {
    setNewsUiState({
      countryDock: {
        ...countryDock,
        ...partial,
      },
    });
  };

  const closeAll = useCallback(() => {
    setUrlCountryParam(null);
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (selectedArticle) {
        setSelectedArticle(null);
        setDetailStatus("idle");
        setDetailSummary(null);
        return;
      }
      closeAll();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeAll, selectedArticle]);

  useEffect(() => {
    if (!selectedArticle) return;
    let cancelled = false;
    setDetailStatus("loading");
    setDetailSummary(null);

    const cacheKey = `${selectedArticle.id}:${selectedArticle.url}`;
    const memoized = summaryMemo.get(cacheKey);
    if (memoized) {
      setDetailSummary(memoized);
      setDetailStatus(getDetailStatus(memoized));
      return;
    }

    const params = new URLSearchParams();
    params.set("url", selectedArticle.url);
    if (selectedArticle.headline) params.set("headline", selectedArticle.headline);
    if (selectedArticle.source) params.set("source", selectedArticle.source);
    if (selectedArticle.backendSource) params.set("backend", selectedArticle.backendSource);

    fetchSummaryWithDedup(cacheKey, params)
      .then((payload) => {
        if (cancelled) return;
        putSummaryMemo(cacheKey, payload);
        setDetailSummary(payload);
        setDetailStatus(getDetailStatus(payload));
      })
      .catch(() => {
        if (cancelled) return;
        setDetailSummary(null);
        setDetailStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [selectedArticle]);

  const articles24h = useMemo(
    () => profile.articles.filter((item) => item.publishedAt > Date.now() - 24 * 60 * 60_000).length,
    [profile.articles]
  );
  const sourcesCount = useMemo(() => new Set(profile.articles.map((item) => item.source)).size, [profile.articles]);
  const categoriesCount = useMemo(() => new Set(profile.articles.map((item) => item.category)).size, [profile.articles]);

  const infraTabs = useMemo(() => {
    const tabs: Array<{ value: InfraTab; label: string; count: number }> = [
      { value: "pipelines", label: "PIPELINES", count: infrastructure.pipelines.length },
      { value: "dataCenters", label: "DATA CENTERS", count: infrastructure.dataCenters.length },
      { value: "nuclearFacilities", label: "NUCLEAR", count: infrastructure.nuclearFacilities.length },
    ];
    return tabs.filter((t) => t.count > 0);
  }, [infrastructure.dataCenters.length, infrastructure.nuclearFacilities.length, infrastructure.pipelines.length]);
  const [infraTab, setInfraTab] = useState<InfraTab>("pipelines");
  useEffect(() => {
    if (infraTabs.length && !infraTabs.some((t) => t.value === infraTab)) {
      setInfraTab(infraTabs[0].value);
    }
  }, [infraTab, infraTabs]);

  const [marketsSort, setMarketsSort] = useState<"volume" | "yes" | "updated">("volume");
  const [marketsDir, setMarketsDir] = useState<"desc" | "asc">("desc");
  const sortedMarkets = useMemo(() => {
    const items = [...predictionMarkets];
    const dir = marketsDir === "desc" ? -1 : 1;
    items.sort((a, b) => {
      if (marketsSort === "updated") return dir * ((b.lastUpdated ?? 0) - (a.lastUpdated ?? 0));
      if (marketsSort === "yes") return dir * ((b.yesPrice ?? 0) - (a.yesPrice ?? 0));
      return dir * ((Number(b.volume) || 0) - (Number(a.volume) || 0));
    });
    return items;
  }, [marketsDir, marketsSort, predictionMarkets]);

  const [newsSort, setNewsSort] = useState<"relevance" | "time">("relevance");
  const sortedNews = useMemo(() => {
    const items = [...sortedArticles];
    if (newsSort === "time") return items;
    return items.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }, [newsSort, sortedArticles]);

  let detailContent: ReactNode = null;
  if (selectedArticle) {
    detailContent = (
      <ArticleDetailAside
        article={selectedArticle}
        detailStatus={detailStatus}
        detailSummary={detailSummary}
        onClose={() => setSelectedArticle(null)}
      />
    );
  }

  return (
    <div className={`wv-country-dock-layout is-${dockSide}`.trim()}>
      <aside
        className="wv-country-dock is-expanded"
        role="dialog"
        aria-label={`Country ${normalizedCountryCode}`}
      >
      <div className="wv-country-dock-header">
        <div className="wv-country-dock-ident">
          <span className="wv-country-dock-flag" aria-hidden="true">
            {getFlag(normalizedCountryCode)}
          </span>
          <div className="wv-country-dock-title">
            <span className="wv-country-dock-name">
              {countryDisplayName}
            </span>
            <span className="wv-country-dock-code">({normalizedCountryCode})</span>
          </div>
          <span className={`wv-country-chip ${threat.className}`}>{threat.label}</span>
          <span className="wv-country-dock-trend">{trendText}</span>
        </div>
        <div className="wv-country-dock-controls">
          <IconButton
            label={isPinned ? "Unpin drawer" : "Pin drawer"}
            text="PIN"
            active={isPinned}
            onClick={() => setDockState({ pinned: !isPinned })}
          />
          <IconButton label="Close country drawer" text="CLOSE" onClick={closeAll} />
        </div>
      </div>

      {showQuickActions ? (
        <div className="wv-country-dock-actions">
          <button type="button" className="wv-inline-action" onClick={() => setNewsQuery(`country:${normalizedCountryCode}`)}>
            OPEN_DETAILS
          </button>
          <button
            type="button"
            className={`wv-inline-action ${trackedSavedSearch ? "is-active" : ""}`.trim()}
            onClick={() => {
              const id = `country-${normalizedCountryCode}`;
              if (trackedSavedSearch) {
                deleteNewsSearch(id);
                setNewsUiStateRef.current({ statusLine: `Untracked ${normalizedCountryCode}.` });
                return;
              }
              saveNewsSearch({
                id,
                name: `COUNTRY ${normalizedCountryCode}`,
                query: `country:${normalizedCountryCode}`,
                createdAt: Date.now(),
                alertEnabled: false,
              });
              setNewsUiStateRef.current({ statusLine: `Tracking ${normalizedCountryCode}.` });
            }}
          >
            TRACK
          </button>
          <button
            type="button"
            className={`wv-inline-action ${trackedAlert ? "is-active" : ""}`.trim()}
            onClick={() => {
              const id = `country-${normalizedCountryCode}`;
              if (trackedAlert) {
                ackNewsAlert(id);
                upsertNewsAlert({
                  id,
                  name: `COUNTRY ${normalizedCountryCode}`,
                  query: `country:${normalizedCountryCode}`,
                  threshold: 3,
                  soundEnabled: false,
                  enabled: false,
                  lastChecked: Date.now(),
                  hitCount: 0,
                  unreadCount: 0,
                  seenFingerprints: [],
                });
                setNewsUiStateRef.current({ statusLine: `Alerts disabled for ${normalizedCountryCode}.` });
                return;
              }
              upsertNewsAlert({
                id,
                name: `COUNTRY ${normalizedCountryCode}`,
                query: `country:${normalizedCountryCode}`,
                threshold: 3,
                soundEnabled: false,
                enabled: true,
                lastChecked: 0,
                hitCount: 0,
                unreadCount: 0,
                seenFingerprints: [],
              });
              setNewsUiStateRef.current({ statusLine: `Alerts enabled for ${normalizedCountryCode}.` });
            }}
          >
            ALERTS
          </button>
          <button
            type="button"
            className="wv-inline-action"
            onClick={async () => {
              const share = new URL(window.location.href);
              share.searchParams.set("country", normalizedCountryCode);
              try {
                await navigator.clipboard.writeText(share.toString());
                setNewsUiStateRef.current({ statusLine: "Country link copied." });
              } catch {
                setNewsUiStateRef.current({ statusLine: "Copy failed." });
              }
            }}
          >
            COPY_LINK
          </button>
          <button
            type="button"
            className="wv-inline-action"
            onClick={() => setDockState({ showQuickActions: false })}
            title="Hide quick actions"
          >
            HIDE
          </button>
        </div>
      ) : (
        <div className="wv-country-dock-actions is-collapsed">
          <button type="button" className="wv-inline-action" onClick={() => setDockState({ showQuickActions: true })}>
            SHOW_ACTIONS
          </button>
        </div>
      )}

      <div className="wv-country-grid">
        {/* Instability Index + Active Signals (merged) */}
        <section className="wv-panel wv-country-panel wv-country-panel-instability-signals">
          <div className="wv-country-panel-header">
            <div className="wv-country-panel-title">INSTABILITY &amp; SIGNALS</div>
            <div className="wv-country-panel-meta">
              {apiLoading ? "LOADING" : apiError ? (apiData ? "STALE" : "ERROR") : noInstabilityData ? "NO DATA" : "READY"}
            </div>
            <div className="wv-country-panel-controls">
              <IconButton
                label="Refresh instability"
                text="REFRESH"
                onClick={() => void fetchCountryProfile()}
                disabled={apiLoading}
              />
            </div>
          </div>
          <PanelBody>
            {apiLoading ? (
              <div className="wv-panel-state">
                <div className="wv-skeleton-block" />
                <div className="wv-skeleton-row" />
                <div className="wv-skeleton-row" />
                <div className="wv-skeleton-row" />
              </div>
            ) : apiError && !apiData ? (
              <div className="wv-panel-state">
                <div className="wv-panel-state-line">{apiError}</div>
                <button type="button" className="wv-inline-action" onClick={() => void fetchCountryProfile()}>
                  RETRY
                </button>
              </div>
            ) : (
              <div className="wv-country-instability-signals">
                <div className="wv-country-instability-block">
                  {noInstabilityData ? (
                    <div className="wv-panel-state wv-country-instability-no-data" style={{ padding: 4 }}>
                      <div className="wv-panel-state-line" style={{ fontSize: 10 }}>
                        No instability data for the last 30 days.
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="wv-country-instability-kpi">
                        <div className="wv-country-instability-value">{instabilityIndex}</div>
                        <div className="wv-country-instability-scale">/100</div>
                      </div>
                      <div className="wv-country-breakdown">
                        <div className="wv-country-breakdown-title">Breakdown</div>
                        {breakdownData.map((row) => (
                          <div key={row.code} className="wv-country-breakdown-row">
                            <span className="wv-country-breakdown-label">{row.label}</span>
                            <span className="wv-country-breakdown-bar" aria-hidden="true">
                              <span className="wv-country-breakdown-fill" style={{ width: `${row.value}%` }} />
                            </span>
                            <span className="wv-country-breakdown-val">{row.value}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div className="wv-country-signals-block">
                  {newsLoading && profile.articles.length === 0 ? (
                    <div className="wv-panel-state">
                      <div className="wv-skeleton-row" />
                      <div className="wv-skeleton-row" />
                      <div className="wv-skeleton-row" />
                      <div className="wv-skeleton-row" />
                    </div>
                  ) : (
                    <div className="wv-country-timeline">
                      <div className="wv-country-timeline-title">7-day activity</div>
                      {TIMELINE_ROWS.map((row) => {
                        const hasData = profile.timeline.some((entry) => entry[row.key] > 0);
                        return (
                          <div key={row.key} className="wv-country-timeline-row">
                            <span className="wv-country-timeline-label" style={{ color: row.color }}>
                              {row.label}
                            </span>
                            <div className="wv-country-timeline-bars" role="img" aria-label={`${row.label} 7-day spark`}>
                              {profile.timeline.map((entry) => (
                                <span
                                  key={`${row.key}-${entry.date}`}
                                  className="wv-country-timeline-bar"
                                  style={{
                                    height: `${Math.max(2, (entry[row.key] / maxTimelineVal) * 18)}px`,
                                    background: entry[row.key] > 0 ? row.color : "var(--wv-line)",
                                    opacity: entry[row.key] > 0 ? 0.85 : 0.28,
                                  }}
                                  title={`${entry.date}: ${entry[row.key]}`}
                                />
                              ))}
                            </div>
                            {!hasData ? <span className="wv-country-timeline-empty">No events in 7 days</span> : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </PanelBody>
          <PanelFooter
            updatedAt={Date.now()}
            source="PROFILE"
            health={
              apiLoading
                ? "loading"
                : apiError && apiData
                  ? "stale"
                  : apiError && !apiData
                    ? "error"
                    : "ok"
            }
            message={
              apiError
                ? apiData
                  ? "profile fetch failed; showing last data"
                  : "profile fetch failed"
                : noInstabilityData
                  ? "no recent instability signals"
                  : `trend ${profile.trend}`
            }
          />
        </section>

        {/* Intelligence Brief */}
        <section className="wv-panel wv-country-panel wv-country-panel-brief">
          <div className="wv-country-panel-header">
            <div className="wv-country-panel-title">INTELLIGENCE BRIEF</div>
            <div className="wv-country-panel-controls">
              {topHeadline ? (
                <IconButton
                  label="View full brief"
                  text="VIEW"
                  onClick={() => {
                    setSelectedArticle(topHeadline);
                  }}
                />
              ) : null}
            </div>
          </div>
          <PanelBody>
            {apiLoading && !topHeadline ? (
              <div className="wv-panel-state">
                <div className="wv-skeleton-row" />
                <div className="wv-skeleton-row" />
              </div>
            ) : topHeadline ? (
              <div className="wv-country-brief">
                <div className="wv-country-brief-line" title={topHeadline.headline}>
                  {topHeadline.headline}
                </div>
                <div className="wv-country-brief-meta">
                  <span>{topHeadline.source}</span>
                  <span className="wv-country-sep">|</span>
                  <span>{relativeTime(topHeadline.publishedAt)}</span>
                  <span className="wv-country-sep">|</span>
                  <span>{topHeadline.domain}</span>
                </div>
                {apiData?.acledSummary && apiData.acledSummary.totalEvents > 0 ? (
                  <div className="wv-country-brief-note">
                    {apiData.acledSummary.totalEvents} events / 30d • {apiData.acledSummary.totalFatalities} fatalities
                  </div>
                ) : (
                  <div className="wv-country-brief-note wv-country-muted">No ACLED summary available.</div>
                )}
              </div>
            ) : (
              <div className="wv-panel-state">
                <div className="wv-panel-state-line">No brief available (no recent articles).</div>
              </div>
            )}
          </PanelBody>
        </section>

        {/* Top News */}
        <section className="wv-panel wv-country-panel wv-country-panel-news">
          <div className="wv-country-panel-header">
            <div className="wv-country-panel-title">TOP NEWS</div>
            <div className="wv-country-panel-meta">{sortedArticles.length ? `${sortedArticles.length} items` : "EMPTY"}</div>
            <div className="wv-country-panel-controls">
              <DenseSelect
                ariaLabel="News sort"
                value={newsSort}
                onChange={(value) => setNewsSort(value as "relevance" | "time")}
                options={[
                  { value: "relevance", label: "RELEVANCE" },
                  { value: "time", label: "TIME" },
                ]}
              />
              <IconButton label="Refresh news" text="REFRESH" onClick={() => void fetchCountryNews()} disabled={newsLoading} />
            </div>
          </div>
          <PanelBody noPadding>
            <div className="wv-country-news">
              <div className="wv-country-news-scroll">
                <div className="wv-country-news-head">
                  <span>SRC</span>
                  <span>HEADLINE</span>
                  <span>AGE</span>
                  <span>REL</span>
                </div>
                {newsLoading ? (
                  <div className="wv-country-news-state">
                    <div className="wv-skeleton-row" />
                    <div className="wv-skeleton-row" />
                    <div className="wv-skeleton-row" />
                    <div className="wv-skeleton-row" />
                  </div>
                ) : newsError ? (
                  <div className="wv-panel-state" style={{ padding: 6 }}>
                    <div className="wv-panel-state-line">{newsError}</div>
                    <button type="button" className="wv-inline-action" onClick={() => void fetchCountryNews()}>
                      RETRY
                    </button>
                  </div>
                ) : !sortedNews.length ? (
                  <div className="wv-panel-state" style={{ padding: 6 }}>
                    <div className="wv-panel-state-line">No news articles found for this country.</div>
                  </div>
                ) : (
                  <div className="wv-country-news-body">
                    {sortedNews.slice(0, 60).map((article) => {
                      const selected = selectedArticle?.id === article.id;
                      const score = article.score ?? 0;
                      return (
                        <button
                          key={article.id}
                          type="button"
                          className={`wv-country-news-row ${selected ? "is-selected" : ""}`.trim()}
                          onClick={() => setSelectedArticle(article)}
                          title={article.headline}
                        >
                          <span className="wv-country-news-src" aria-hidden="true">
                            {article.source.slice(0, 2).toUpperCase()}
                          </span>
                          <span className="wv-country-news-headline">{article.headline}</span>
                          <span className="wv-country-news-age">{relativeTime(article.publishedAt)}</span>
                          <span className="wv-country-news-rel">
                            <span className="wv-country-rel-dot" style={{ background: CATEGORY_COLORS[article.category] }} />
                            <span className="wv-country-rel-tag">{article.category.toUpperCase()}</span>
                            <span className="wv-country-rel-score">{score.toFixed(0)}</span>
                          </span>
                          <span className="wv-country-row-actions" aria-hidden="true">
                            <span
                              role="button"
                              tabIndex={-1}
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(article.url, "_blank", "noopener,noreferrer");
                              }}
                            >
                              OPEN
                            </span>
                            <span
                              role="button"
                              tabIndex={-1}
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  await navigator.clipboard.writeText(article.url);
                                  setNewsUiStateRef.current({ statusLine: "Link copied." });
                                } catch {
                                  setNewsUiStateRef.current({ statusLine: "Copy failed." });
                                }
                              }}
                            >
                              COPY
                            </span>
                            <span
                              role="button"
                              tabIndex={-1}
                              onClick={(e) => {
                                e.stopPropagation();
                                const id = `country-${normalizedCountryCode}`;
                                if (savedSearches.some((s) => s.id === id)) {
                                  deleteNewsSearch(id);
                                  setNewsUiStateRef.current({ statusLine: "Removed from tracked list." });
                                } else {
                                  saveNewsSearch({
                                    id,
                                    name: `COUNTRY ${normalizedCountryCode}`,
                                    query: `country:${normalizedCountryCode}`,
                                    createdAt: Date.now(),
                                    alertEnabled: false,
                                  });
                                  setNewsUiStateRef.current({ statusLine: "Saved to tracked list." });
                                }
                              }}
                            >
                              SAVE
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </PanelBody>
          <PanelFooter
            updatedAt={Date.now()}
            source="NEWS"
            health={newsLoading ? "loading" : newsError ? "error" : "ok"}
            message={newsError ? "news fetch failed" : `sort ${newsSort}`}
          />
        </section>

        {/* Prediction Markets */}
        <section className="wv-panel wv-country-panel wv-country-panel-markets">
          <div className="wv-country-panel-header">
            <div className="wv-country-panel-title">PREDICTION MARKETS</div>
            <div className="wv-country-panel-meta">{predictionMarkets.length ? `${predictionMarkets.length} mkts` : "EMPTY"}</div>
            <div className="wv-country-panel-controls">
              <DenseSelect
                ariaLabel="Market sort"
                value={marketsSort}
                onChange={(value) => setMarketsSort(value as "volume" | "yes" | "updated")}
                options={[
                  { value: "volume", label: "VOLUME" },
                  { value: "yes", label: "YES%" },
                  { value: "updated", label: "UPDATED" },
                ]}
              />
              <DenseSelect
                ariaLabel="Sort direction"
                value={marketsDir}
                onChange={(value) => setMarketsDir(value as "desc" | "asc")}
                options={[
                  { value: "desc", label: "DESC" },
                  { value: "asc", label: "ASC" },
                ]}
              />
            </div>
          </div>
          <PanelBody noPadding>
            {apiLoading && !sortedMarkets.length ? (
              <div className="wv-country-rows-pad">
                <div className="wv-skeleton-row" />
                <div className="wv-skeleton-row" />
                <div className="wv-skeleton-row" />
              </div>
            ) : marketsError && !sortedMarkets.length ? (
              <div className="wv-panel-state" style={{ padding: 6 }}>
                <div className="wv-panel-state-line">{marketsError}</div>
                <button type="button" className="wv-inline-action" onClick={() => void fetchCountryProfile()}>
                  RETRY
                </button>
              </div>
            ) : !sortedMarkets.length ? (
              <div className="wv-panel-state" style={{ padding: 6 }}>
                <div className="wv-panel-state-line">No active prediction markets found.</div>
              </div>
            ) : (
              <div className="wv-country-market-list">
                <div className="wv-country-market-scroll">
                  <div className="wv-country-market-body">
                    {sortedMarkets.slice(0, 18).map((market) => {
                      const { yesPct, noPct } = normalizeMarketSplit(market.yesPrice, market.noPrice);
                      return (
                        <button
                          key={market.id}
                          type="button"
                          className="wv-country-market-row"
                          onClick={() => window.open(`https://polymarket.com/event/${market.slug}`, "_blank", "noopener,noreferrer")}
                          title={market.question}
                        >
                          <span className="wv-country-market-q">{market.question}</span>
                          <div className="wv-country-market-prediction">
                            <span className="wv-country-market-vol">{formatVolume(market.volume)}</span>
                            <span className="wv-country-market-bar" role="img" aria-label={`Yes ${yesPct} percent, No ${noPct} percent`}>
                              <span className="wv-country-market-yes" style={{ width: `${yesPct}%` }}>
                                {yesPct}%
                              </span>
                              <span className="wv-country-market-no" style={{ width: `${noPct}%` }}>
                                {noPct}%
                              </span>
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </PanelBody>
          <PanelFooter
            updatedAt={Date.now()}
            source="POLYMARKET"
            health={
              apiLoading
                ? "loading"
                : marketsError && sortedMarkets.length
                  ? "stale"
                  : marketsError && !sortedMarkets.length
                    ? "error"
                    : "ok"
            }
            message={
              marketsError
                ? sortedMarkets.length
                  ? "markets fetch failed; showing last data"
                  : "markets unavailable"
                : undefined
            }
          />
        </section>

        {/* Infrastructure Exposure */}
        <section className="wv-panel wv-country-panel wv-country-panel-infra">
          <div className="wv-country-panel-header">
            <div className="wv-country-panel-title">INFRASTRUCTURE EXPOSURE</div>
            <div className="wv-country-panel-meta">{infraTabs.length ? `${infraTabs.reduce((a, t) => a + t.count, 0)} rows` : "EMPTY"}</div>
          </div>
          <PanelBody noPadding>
            {infraTabs.length ? (
              <div className="wv-country-infra">
                <PanelTabs
                  value={infraTab}
                  onChange={(value) => setInfraTab(value)}
                  options={infraTabs.map((t) => ({ value: t.value, label: `${t.label} ${t.count}` }))}
                />
                <div className="wv-country-infra-table">
                  <div className="wv-country-infra-scroll">
                    <div className="wv-country-infra-head">
                      <span>NAME</span>
                      <span className="is-right">LEN/DIST</span>
                    </div>
                    <div className="wv-country-infra-body">
                      {(infraTab === "pipelines"
                        ? infrastructure.pipelines
                        : infraTab === "dataCenters"
                          ? infrastructure.dataCenters
                          : infrastructure.nuclearFacilities
                      )
                        .slice(0, 80)
                        .map((item, idx) => {
                          const value =
                            "lengthKm" in item && item.lengthKm
                              ? `${item.lengthKm} km`
                              : "distanceKm" in item && item.distanceKm
                                ? `${item.distanceKm} km`
                                : "capacity" in item && item.capacity
                                  ? String(item.capacity)
                                  : "";
                          return (
                            <div key={`${infraTab}-${idx}`} className="wv-country-infra-row">
                              <span className="wv-country-infra-name" title={item.name}>
                                {item.name}
                              </span>
                              <span className="wv-country-infra-val">{value}</span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="wv-panel-state" style={{ padding: 6 }}>
                <div className="wv-panel-state-line">No infrastructure data available.</div>
              </div>
            )}
          </PanelBody>
        </section>
      </div>

      <div className="wv-country-dock-footer">
        <span>ARTICLES {profile.articles.length}</span>
        <span className="wv-country-sep">|</span>
        <span>24H {articles24h}</span>
        <span className="wv-country-sep">|</span>
        <span>SOURCES {sourcesCount}</span>
        <span className="wv-country-sep">|</span>
        <span>CATS {categoriesCount}</span>
      </div>
      </aside>
      {detailContent}
    </div>
  );
}
