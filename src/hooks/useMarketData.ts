"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface UseMarketDataResult<T> {
  data: T;
  isLive: boolean;
  loading: boolean;
  error: string | null;
  /** Manually trigger a refresh */
  refresh: () => void;
}

/**
 * Generic polling hook for market data.
 * Fetches from an API endpoint on mount and at `intervalMs` intervals.
 * Falls back to `staticFallback` if the fetch fails.
 */
export function useMarketData<T>(
  endpoint: string,
  intervalMs: number,
  staticFallback: T,
): UseMarketDataResult<T> {
  const [data, setData] = useState<T>(staticFallback);
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    try {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      const res = await fetch(endpoint, {
        signal: controller.signal,
        cache: "no-store",
      });

      if (!mountedRef.current) return;

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();
      if (!mountedRef.current) return;

      // Check if the response indicates degraded data
      const isDegraded = json.degraded === true;

      setData(json as T);
      setIsLive(!isDegraded);
      setError(null);
      setLoading(false);
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      if (err instanceof DOMException && err.name === "AbortError") return;

      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      // Keep existing data (could be live from a previous successful fetch)
      // Only fall back to static if we never got live data
      if (!isLive) {
        setData(staticFallback);
      }
      setIsLive(false);
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();

    const timer = setInterval(fetchData, intervalMs);

    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      clearInterval(timer);
    };
  }, [fetchData, intervalMs]);

  return { data, isLive, loading, error, refresh: fetchData };
}
