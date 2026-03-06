"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useWorldViewStore } from "../../store";

interface CoinMarket {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
  market_cap: number;
  sparkline_in_7d?: { price: number[] };
}

const REFRESH_MS = 60_000;

const panelStyle: React.CSSProperties = {
  fontFamily:
    'var(--font-tech-mono), ui-monospace, Menlo, Monaco, Consolas, "Courier New", monospace',
  color: "#b9cde0",
  fontSize: 11,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  height: "100%",
};

const headerStyle: React.CSSProperties = {
  padding: "8px 10px 6px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  borderBottom: "1px solid rgba(80,100,125,0.22)",
  letterSpacing: 2,
  fontSize: 10,
  color: "#6e849d",
  textTransform: "uppercase",
};

function MiniSparkline({ prices }: { prices: number[] }) {
  if (!prices || prices.length < 2) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const h = 16;
  const w = 50;
  const step = w / (prices.length - 1);

  const points = prices.map((p, i) => `${(i * step).toFixed(1)},${(h - ((p - min) / range) * h).toFixed(1)}`).join(" ");

  const trending = prices[prices.length - 1] >= prices[0];
  const color = trending ? "#36b37e" : "#ff5a5f";

  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function MarketsPanel() {
  const marketsEnabled = useWorldViewStore((s) => s.layers.markets);
  const [coins, setCoins] = useState<CoinMarket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMarkets = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/news/coingecko?mode=markets&limit=10");
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setCoins(data.markets ?? []);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!marketsEnabled) return;
    fetchMarkets();
    timerRef.current = setInterval(fetchMarkets, REFRESH_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [marketsEnabled, fetchMarkets]);

  if (!marketsEnabled) return null;

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span>MARKETS</span>
        <span style={{ color: loading ? "#20d2ff" : error ? "#ff5a5f" : "#36b37e" }}>
          {loading ? "LOADING" : error ? "ERROR" : "LIVE"}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {coins.map((c) => {
          const pct = c.price_change_percentage_24h ?? 0;
          const pctColor = pct >= 0 ? "#36b37e" : "#ff5a5f";
          const pctSign = pct >= 0 ? "+" : "";

          return (
            <div
              key={c.id}
              style={{
                display: "grid",
                gridTemplateColumns: "44px 1fr 50px 60px",
                gap: 6,
                padding: "5px 10px",
                alignItems: "center",
                borderBottom: "1px solid rgba(80,100,125,0.12)",
              }}
            >
              <span style={{ color: "#89e5ff", fontWeight: 600, fontSize: 10, letterSpacing: 1 }}>
                {c.symbol.toUpperCase()}
              </span>
              <span style={{ color: "#8da3b8", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                ${c.current_price?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? "—"}
              </span>
              <MiniSparkline prices={c.sparkline_in_7d?.price ?? []} />
              <span
                style={{
                  color: pctColor,
                  fontSize: 10,
                  textAlign: "right",
                  fontWeight: 600,
                }}
              >
                {pctSign}{pct.toFixed(1)}%
              </span>
            </div>
          );
        })}

        {coins.length === 0 && !loading && (
          <div style={{ padding: "12px 10px", color: "#5f7488", fontSize: 10 }}>
            No market data available
          </div>
        )}
      </div>

      <div
        style={{
          padding: "4px 10px",
          fontSize: 9,
          color: "#5f7488",
          borderTop: "1px solid rgba(80,100,125,0.18)",
          letterSpacing: 1,
        }}
      >
        CoinGecko Free API · {REFRESH_MS / 1000}s refresh
      </div>
    </div>
  );
}
