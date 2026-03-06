"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StreamItem, SourceHealthEntry, StreamFilterParams } from "../lib/news/stream/types";
import type { StreamEvent } from "../lib/news/stream/events";

interface NewsStreamState {
  items: StreamItem[];
  sourceHealth: Record<string, SourceHealthEntry>;
  expectedFlowPerMin: number;
  connected: boolean;
  error: string | null;
}

/**
 * Build the SSE URL from server-side filter params only (time window + entity watchlist).
 * Tab/category/importance filtering is applied client-side so switching tabs never
 * triggers a reconnect and items are not lost.
 */
function buildUrl(timeWindow?: StreamFilterParams["timeWindow"], entityWatchlist?: string[]): string {
  const params = new URLSearchParams();
  if (timeWindow) params.set("window", timeWindow);
  if (entityWatchlist?.length) params.set("entityWatchlist", entityWatchlist.join(","));
  return `/api/news/stream?${params.toString()}`;
}

const MAX_CLIENT_ITEMS = 2_000;

export function useNewsStream(filters: StreamFilterParams) {
  const [state, setState] = useState<NewsStreamState>({
    items: [],
    sourceHealth: {},
    expectedFlowPerMin: 0,
    connected: false,
    error: null,
  });

  const itemsRef = useRef<Map<string, StreamItem>>(new Map());
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Only reconnect when the server-side params that actually change the stream change.
  const timeWindow = filters.timeWindow;
  const entityWatchlistKey = (filters.entityWatchlist ?? []).slice().sort().join(",");

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }

    const url = buildUrl(timeWindow, filters.entityWatchlist);
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      setState((s) => ({ ...s, connected: true, error: null }));
    };

    es.onmessage = (event: MessageEvent) => {
      try {
        const data: StreamEvent = JSON.parse(event.data as string);
        handleEvent(data);
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => {
      setState((s) => ({ ...s, connected: false, error: "Connection lost" }));
      es.close();
      eventSourceRef.current = null;
      reconnectTimer.current = setTimeout(connect, 3_000);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeWindow, entityWatchlistKey]);

  function handleEvent(event: StreamEvent) {
    switch (event.type) {
      case "snapshot": {
        const map = new Map<string, StreamItem>();
        for (const item of event.items) map.set(item.id, item);
        itemsRef.current = map;
        setState((s) => ({
          ...s,
          items: event.items.slice().sort((a, b) => b.timestamp - a.timestamp),
          sourceHealth: event.sourceHealth,
          expectedFlowPerMin: event.expectedFlowPerMin,
          connected: true,
          error: null,
        }));
        break;
      }
      case "insert": {
        const map = itemsRef.current;
        for (const item of event.items) {
          map.set(item.id, item);
        }
        enforceCapacity(map);
        const sorted = Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
        itemsRef.current = map;
        setState((s) => ({ ...s, items: sorted }));
        break;
      }
      case "update": {
        const map = itemsRef.current;
        let changed = false;
        for (const partial of event.items) {
          const existing = map.get(partial.id);
          if (existing) {
            map.set(partial.id, { ...existing, ...partial });
            changed = true;
          }
        }
        if (changed) {
          const sorted = Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
          setState((s) => ({ ...s, items: sorted }));
        }
        break;
      }
      case "status": {
        setState((s) => ({
          ...s,
          sourceHealth: event.sourceHealth,
          expectedFlowPerMin: event.expectedFlowPerMin,
        }));
        break;
      }
      case "heartbeat":
        break;
    }
  }

  // Reconnect when server-side params change (time window or entity watchlist).
  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  const searchLocal = useCallback((query: string): StreamItem[] => {
    if (!query) return Array.from(itemsRef.current.values()).sort((a, b) => b.timestamp - a.timestamp);
    const q = query.toLowerCase();
    return Array.from(itemsRef.current.values())
      .filter((item) => {
        const text = `${item.headline} ${item.summary ?? ""} ${item.entities.map((e) => e.name).join(" ")} ${item.tickers.join(" ")} ${item.sourceDomain} ${item.geo?.placeName ?? ""}`.toLowerCase();
        return text.includes(q);
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }, []);

  return {
    ...state,
    searchLocal,
  };
}

function enforceCapacity(map: Map<string, StreamItem>) {
  if (map.size <= MAX_CLIENT_ITEMS) return;
  const entries = Array.from(map.entries()).sort((a, b) => b[1].timestamp - a[1].timestamp);
  const toRemove = entries.slice(MAX_CLIENT_ITEMS);
  for (const [key] of toRemove) map.delete(key);
}
