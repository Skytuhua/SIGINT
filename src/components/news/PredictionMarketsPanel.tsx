"use client";

import { useCallback, useEffect, useState } from "react";
import type { PredictionMarketItem } from "../../lib/news/types";
import Panel from "../dashboard/panel/Panel";
import PanelBody from "../dashboard/panel/PanelBody";
import PanelControls from "../dashboard/panel/PanelControls";
import PanelHeader from "../dashboard/panel/PanelHeader";

interface PredictionMarketsPanelProps {
  panelId: string;
  lockHeaderProps: { locked: boolean; onToggleLock: () => void };
}

interface PredictionMarketsResponse {
  data: PredictionMarketItem[];
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

export default function PredictionMarketsPanel({ panelId, lockHeaderProps }: PredictionMarketsPanelProps) {
  const [markets, setMarkets] = useState<PredictionMarketItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMarkets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/news/prediction-markets?limit=50");
      if (!resp.ok) throw new Error(`Request failed with status ${resp.status}`);
      const json = (await resp.json()) as PredictionMarketsResponse;
      setMarkets(Array.isArray(json.data) ? json.data : []);
    } catch (err) {
      console.error("Failed to fetch prediction markets", err);
      setError("Failed to load prediction markets.");
      setMarkets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMarkets();
  }, [fetchMarkets]);

  return (
    <Panel panelId={panelId} workspace="news">
      <PanelHeader
        title="PREDICTION MARKETS"
        subtitle="Top Polymarket events by volume"
        {...lockHeaderProps}
        controls={<PanelControls onRefresh={() => void fetchMarkets()} loading={loading} />}
      />
      <PanelBody>
        <div className="wv-pm-list">
          {markets.map((market) => {
            const { yesPct, noPct } = normalizeMarketSplit(market.yesPrice, market.noPrice);
            return (
              <article key={market.id} className="wv-pm-card">
                <a
                  href={`https://polymarket.com/event/${market.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="wv-pm-question"
                  title={market.question}
                >
                  {market.question} <span className="wv-pm-link">-&gt;</span>
                </a>
                <div className="wv-pm-meta">Vol: {formatVolume(market.volume)}</div>
                <div className="wv-pm-bar" role="img" aria-label={`Yes ${yesPct} percent, No ${noPct} percent`}>
                  <span className="wv-pm-yes" style={{ width: `${yesPct}%` }}>
                    Yes {yesPct}%
                  </span>
                  <span className="wv-pm-no" style={{ width: `${noPct}%` }}>
                    No {noPct}%
                  </span>
                </div>
              </article>
            );
          })}

          {!markets.length && loading && !error ? (
            <div className="wv-pm-empty">Loading...</div>
          ) : null}
          {!markets.length && !loading && error ? (
            <div className="wv-pm-empty">{error}</div>
          ) : null}
          {!markets.length && !loading && !error ? (
            <div className="wv-pm-empty">No active prediction markets found.</div>
          ) : null}
        </div>
      </PanelBody>
    </Panel>
  );
}
