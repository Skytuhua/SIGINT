"use client";

import { useEffect, useState } from "react";
import type { GdeltArticle, NewsArticle } from "../../lib/news/types";
import { formatUtc } from "../../lib/dashboard/format";
import { useWorldViewStore } from "../../store";

interface Props {
  article: NewsArticle | null;
  relatedItems?: GdeltArticle[];
  timeline?: Array<{ date: string; value: number }>;
  onClose: () => void;
}

type SummaryStatus = "idle" | "loading" | "ready" | "error" | "unsupported";
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

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json() as Promise<T>;
}

function getSummaryStatus(payload: ArticleSummaryResponse): SummaryStatus {
  if (payload.summary) return "ready";
  if (payload.unavailableReason === "unsupported_url" || payload.unavailableReason === "invalid_url") {
    return "unsupported";
  }
  return "error";
}

function putSummaryMemo(key: string, payload: ArticleSummaryResponse): void {
  if (summaryMemo.size >= SUMMARY_MEMO_MAX) {
    const oldestKey = summaryMemo.keys().next().value;
    if (oldestKey) summaryMemo.delete(oldestKey);
  }
  summaryMemo.set(key, payload);
}

function fetchSummaryWithDedup(cacheKey: string, params: URLSearchParams): Promise<ArticleSummaryResponse> {
  const existing = summaryInflight.get(cacheKey);
  if (existing) return existing;

  const request = fetch(`/api/news/article-summary?${params.toString()}`, {
    cache: "default",
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`summary returned ${response.status}`);
      }
      return (await response.json()) as ArticleSummaryResponse;
    })
    .finally(() => {
      summaryInflight.delete(cacheKey);
    });

  summaryInflight.set(cacheKey, request);
  return request;
}

export default function NewsPopupModal({
  article,
  relatedItems: providedRelated = [],
  timeline: providedTimeline = [],
  onClose,
}: Props) {
  const [relatedItems, setRelatedItems] = useState<GdeltArticle[]>(providedRelated);
  const [timeline, setTimeline] = useState<Array<{ date: string; value: number }>>(providedTimeline);
  const [summaryStatus, setSummaryStatus] = useState<SummaryStatus>("idle");
  const [summary, setSummary] = useState<ArticleSummaryResponse | null>(null);

  useEffect(() => {
    if (!article) {
      setRelatedItems([]);
      setTimeline([]);
      return;
    }
    if (providedRelated.length > 0 || providedTimeline.length > 0) {
      setRelatedItems(providedRelated);
      setTimeline(providedTimeline);
      return;
    }
    const query = [article.entity, article.placeName, article.headline.split(/\s+/g).slice(0, 4).join(" ")]
      .filter(Boolean)
      .join(" ");
    Promise.all([
      fetchJson<{ articles?: GdeltArticle[] }>(`/api/news/gdelt-context?q=${encodeURIComponent(query)}`),
      fetchJson<{ timeline?: Array<{ date: string; value: number }> }>(
        `/api/news/gdelt-timeline?q=${encodeURIComponent(query)}&timespan=7d`
      ),
    ])
      .then(([ctx, tl]) => {
        setRelatedItems((ctx.articles ?? []).slice(0, 8));
        setTimeline(tl.timeline ?? []);
      })
      .catch(() => {
        setRelatedItems([]);
        setTimeline([]);
      });
  }, [article?.id, article?.url, providedRelated, providedTimeline]);
  useEffect(() => {
    if (!article) {
      setSummaryStatus("idle");
      setSummary(null);
      return;
    }

    const cacheKey = `${article.id}:${article.url}`;
    const memoized = summaryMemo.get(cacheKey);
    if (memoized) {
      setSummary(memoized);
      setSummaryStatus(getSummaryStatus(memoized));
      return;
    }

    let cancelled = false;
    setSummaryStatus("loading");
    setSummary(null);

    const params = new URLSearchParams();
    params.set("url", article.url);
    if (article.headline) params.set("headline", article.headline);
    if (article.source) params.set("source", article.source);
    if (article.backendSource) params.set("backend", article.backendSource);

    fetchSummaryWithDedup(cacheKey, params)
      .then((response) => {
        if (cancelled) return;
        const payload = response;
        putSummaryMemo(cacheKey, payload);
        setSummary(payload);
        setSummaryStatus(getSummaryStatus(payload));
      })
      .catch(() => {
        if (cancelled) return;
        setSummaryStatus("error");
        setSummary(null);
      });

    return () => {
      cancelled = true;
    };
  }, [article?.id, article?.url]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!article) return null;

  const provenance = "provenance" in article ? article.provenance : undefined;
  const summaryEngineLabel =
    summary?.engine === "openai"
      ? `OPENAI${summary.model ? ` (${summary.model})` : ""}`
      : summary?.engine === "extractive"
        ? "EXTRACTIVE"
        : null;

  return (
    <div
      className="wv-news-popup-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="News story"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="wv-news-popup">
        <div className="wv-news-popup-header">
          <h2 className="wv-news-popup-title">STORY</h2>
          <button
            type="button"
            className="wv-news-popup-close"
            onClick={onClose}
            aria-label="Close"
          >
            x
          </button>
        </div>
        <div className="wv-news-popup-body">
          <div className="wv-sv-header">
            <h4 className="wv-sv-headline">{article.headline}</h4>
            <div className="wv-sv-meta">
              <span className="wv-sv-source">{article.source}</span>
              <span className="wv-sv-sep">|</span>
              <span>{formatUtc(article.publishedAt)}</span>
              <span className="wv-sv-sep">|</span>
              <span>{article.domain}</span>
              {article.entity && article.entity !== "none" ? (
                <>
                  <span className="wv-sv-sep">|</span>
                  <span className="wv-sv-entity">{article.entity}</span>
                </>
              ) : null}
            </div>
          </div>
          <div className="wv-sv-divider" />
          <div className="wv-sv-actions">
            <a
              href={article.url}
              target="_blank"
              rel="noreferrer"
              className="wv-sv-btn"
            >
              OPEN SOURCE
            </a>
            <button
              type="button"
              className="wv-sv-btn"
              onClick={() => {
                const news = useWorldViewStore.getState().news;
                const marker = news.markers.find((m) => m.articleId === article.id);
                useWorldViewStore.getState().setHighlightMarker(marker?.id ?? null);
              }}
            >
              HIGHLIGHT MARKER
            </button>
          </div>
          <div className="wv-sv-divider" />
          <div className="wv-sv-section">
            <div className="wv-sv-section-label">SUMMARY</div>
            {summaryStatus === "loading" ? (
              <div className="wv-sv-summary is-loading">
                Generating article summary...
              </div>
            ) : null}
            {summaryStatus === "ready" && summary?.summary ? (
              <div className="wv-sv-summary">{summary.summary}</div>
            ) : null}
            {summaryStatus === "unsupported" ? (
              <div className="wv-sv-summary-note">
                Summary is unavailable for this link type.
              </div>
            ) : null}
            {summaryStatus === "error" ? (
              <div className="wv-sv-summary-note">
                {summary?.unavailableReason === "low_relevance"
                  ? "Summary was skipped because the article content did not match the headline closely enough."
                  : "Could not generate a full-article summary right now."}
              </div>
            ) : null}
            {summaryEngineLabel ? (
              <div className="wv-sv-summary-meta">
                ENGINE {summaryEngineLabel}
                {summary?.degraded ? " | FALLBACK" : ""}
                {summary?.cacheHit === "stale" ? " | CACHED STALE" : ""}
              </div>
            ) : null}
          </div>
          {article.snippet ? (
            <>
              <div className="wv-sv-divider" />
              <div className="wv-sv-section">
                <div className="wv-sv-section-label">SOURCE SNIPPET</div>
                <div className="wv-sv-snippet">{article.snippet}</div>
                {summaryStatus !== "ready" ? (
                  <div className="wv-sv-snippet-note">
                    Showing source snippet fallback.
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
          {Number.isFinite(article.lat) && Number.isFinite(article.lon) ? (
            <>
              <div className="wv-sv-divider" />
              <div className="wv-sv-section">
                <div className="wv-sv-section-label">LOCATION</div>
                <div className="wv-sv-section-value">
                  {article.placeName ?? "Coordinates"} (
                  {(article.lat as number).toFixed(4)},{" "}
                  {(article.lon as number).toFixed(4)})
                </div>
              </div>
            </>
          ) : null}
          {relatedItems.length > 0 ? (
            <>
              <div className="wv-sv-divider" />
              <div className="wv-sv-section">
                <div className="wv-sv-section-label">
                  RELATED ({relatedItems.length})
                </div>
                <div className="wv-sv-related-list">
                  {relatedItems.map((entry) => (
                    <a
                      key={`${entry.url}-${entry.seendate ?? ""}`}
                      href={entry.url}
                      target="_blank"
                      rel="noreferrer"
                      className="wv-sv-related-item"
                    >
                      {entry.title || entry.url}
                    </a>
                  ))}
                </div>
              </div>
            </>
          ) : null}
          {timeline.length > 0 ? (
            <>
              <div className="wv-sv-divider" />
              <div className="wv-sv-section">
                <div className="wv-sv-section-label">TIMELINE (7D)</div>
                <div className="wv-sv-timeline">
                  {timeline.slice(-24).map((point) => (
                    <div
                      key={point.date}
                      className="wv-sv-timeline-col"
                      title={`${point.date}: ${point.value}`}
                    >
                      <div
                        className="wv-sv-timeline-bar"
                        style={{
                          height: `${Math.max(4, Math.min(56, point.value * 4))}px`,
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
          {provenance ? (
            <>
              <div className="wv-sv-divider" />
              <details className="wv-sv-provenance">
                <summary>PROVENANCE</summary>
                <div className="wv-sv-prov-grid">
                  <span>headline</span>
                  <span>{provenance.headlineSource}</span>
                  <span>coords</span>
                  <span>{provenance.coordsSource}</span>
                  <span>entity</span>
                  <span>{provenance.entitySource}</span>
                  <span>confidence</span>
                  <span>
                    {Math.round(
                      (typeof provenance.confidence === "number"
                        ? provenance.confidence
                        : 0) * 100
                    )}
                    %
                  </span>
                </div>
              </details>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

