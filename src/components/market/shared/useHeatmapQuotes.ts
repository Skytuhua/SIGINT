"use client";

import { useEffect, useState } from "react";
import { SCREENER_UNIVERSE } from "./screenerData";

const REFRESH_MS = 60_000;
const BATCH_SIZE = 50;
const BATCHES = Array.from({ length: Math.ceil(SCREENER_UNIVERSE.length / BATCH_SIZE) }, (_, index) =>
  SCREENER_UNIVERSE.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE).map(stock => stock.sym));

/** All quote batches share one polling cycle, so retries cannot overlap normal refreshes. */
export function useHeatmapQuotes() {
  const [snapshot, setSnapshot] = useState({ changes: {} as Record<string, number>, isLive: false });
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      const changes: Record<string, number> = {};
      let nextDelay = REFRESH_MS;
      let complete = true;
      await Promise.all(BATCHES.map(async symbols => {
        try {
          const response = await fetch(`/api/market/quotes?symbols=${symbols.join(",")}`, { signal: controller.signal, cache: "no-store" });
          if (!response.ok) {
            if (response.status === 429) {
              const retry = response.headers.get("Retry-After");
              const seconds = Number(retry);
              const delay = retry && Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retry ?? "") - Date.now();
              if (Number.isFinite(delay)) nextDelay = Math.max(nextDelay, delay);
            }
            complete = false;
            return;
          }
          const data = await response.json();
          if (data.degraded) complete = false;
          const quotes = Array.isArray(data.quotes) ? data.quotes : Object.values(data.quotes ?? {});
          for (const quote of quotes as { symbol: string; changePercent: number }[]) {
            if (symbols.includes(quote.symbol) && Number.isFinite(quote.changePercent)) changes[quote.symbol] = quote.changePercent;
          }
        } catch {
          complete = false;
        }
      }));
      if (controller.signal.aborted) return;
      setSnapshot({ changes, isLive: complete && SCREENER_UNIVERSE.every(stock => changes[stock.sym] != null) });
      timer = setTimeout(poll, Math.min(nextDelay, 2_147_483_647));
    }
    void poll();
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, []);
  return snapshot;
}
