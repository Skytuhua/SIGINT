"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CategoryPanelConfig } from "../../config/newsConfig";
import { CATEGORY_COLORS } from "../../config/newsConfig";
import type { NewsArticle, NewsCategory } from "../../lib/news/types";
import { useWorldViewStore } from "../../store";

interface Props {
  config: CategoryPanelConfig;
}

const LAZY_FETCH_DELAY_MS = 3_000;
const EMPTY_PANEL_STAGGER_MS = 400;

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

const panelStaggerIndex = new Map<string, number>();
function getStaggerOffset(panelId: string): number {
  if (!panelStaggerIndex.has(panelId)) {
    panelStaggerIndex.set(panelId, panelStaggerIndex.size);
  }
  return panelStaggerIndex.get(panelId)! * EMPTY_PANEL_STAGGER_MS;
}

export default function CategoryFeedPanel({ config }: Props) {
  const feedItems = useWorldViewStore((s) => s.news.feedItems);
  const [dedicatedItems, setDedicatedItems] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const hasFetchedRef = useRef(false);
  const [mainFeedSettled, setMainFeedSettled] = useState(false);

  useEffect(() => {
    if (feedItems.length > 0) {
      const t = setTimeout(() => setMainFeedSettled(true), LAZY_FETCH_DELAY_MS);
      return () => clearTimeout(t);
    }
    setMainFeedSettled(false);
  }, [feedItems.length]);

  const filteredFromFeed = feedItems.filter((item) => item.category === config.category);
  const needsDedicatedFetch =
    (config.dedicatedFeeds?.length || config.apiEndpoint) &&
    filteredFromFeed.length === 0 &&
    mainFeedSettled;

  const displayItems = dedicatedItems.length > 0
    ? dedicatedItems
    : filteredFromFeed;

  const sortedItems = [...displayItems]
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, 30);

  const fetchDedicated = useCallback(async () => {
    if (!config.dedicatedFeeds?.length && !config.apiEndpoint) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const url = new URL("/api/news/search", window.location.origin);
      url.searchParams.set("q", `cat:${config.category}`);
      url.searchParams.set("cat", config.category);
      url.searchParams.set("limit", "30");
      url.searchParams.set("timespan", "24h");

      const resp = await fetch(url.toString(), { signal: controller.signal });
      if (!resp.ok) throw new Error(`${resp.status}`);
      const data = await resp.json();
      if (!controller.signal.aborted && Array.isArray(data.items)) {
        setDedicatedItems(data.items);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [config.category, config.dedicatedFeeds, config.apiEndpoint]);

  useEffect(() => {
    if (!needsDedicatedFetch || hasFetchedRef.current) return;
    const stagger = getStaggerOffset(config.id);
    const timer = setTimeout(() => {
      hasFetchedRef.current = true;
      void fetchDedicated();
    }, stagger);
    return () => clearTimeout(timer);
  }, [needsDedicatedFetch, config.id, fetchDedicated]);

  useEffect(() => {
    if (!config.dedicatedFeeds?.length && !config.apiEndpoint) return;
    if (dedicatedItems.length === 0) return;
    const interval = setInterval(fetchDedicated, config.refreshMs ?? 12_000);
    return () => clearInterval(interval);
  }, [config.dedicatedFeeds, config.apiEndpoint, config.refreshMs, dedicatedItems.length, fetchDedicated]);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!loading) {
      useWorldViewStore.getState().setNewsCategoryPanelHasArticles(config.id, sortedItems.length > 0);
    }
  }, [config.id, loading, sortedItems.length]);

  const catColor = CATEGORY_COLORS[config.category as NewsCategory] ?? "#4caf50";

  return (
    <div className="wv-catfeed">
      <div className="wv-catfeed-body">
        {sortedItems.length === 0 && !loading && (
          <div className="wv-catfeed-empty">No articles yet</div>
        )}
        {loading && sortedItems.length === 0 && (
          <div className="wv-catfeed-empty">Loading...</div>
        )}
        {sortedItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className="wv-catfeed-item"
            onClick={() => useWorldViewStore.getState().setStoryPopupArticle(item)}
            onContextMenu={(e) => {
              e.preventDefault();
              window.open(item.url, "_blank", "noopener,noreferrer");
            }}
            title="Click to view | Right-click to open link"
          >
            <span className="wv-catfeed-dot" style={{ background: catColor }} />
            <div className="wv-catfeed-text">
              <div className="wv-catfeed-headline">{item.headline}</div>
              <div className="wv-catfeed-meta">
                {item.source} | {relativeTime(item.publishedAt)}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

