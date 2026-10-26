"use client";

import React from "react";
import { MiniSparkline } from "./shared/MiniSparkline";
import { useMarketData } from "../../hooks/useMarketData";
import Term from "./shared/Term";
import type { MarketAssetContext } from "./shared/assetIdentity";

interface CoinGeckoMarket {
  id: string;
  symbol: string;
  name: string;
  currentPrice: number;
  priceChangePercent24h: number;
  marketCap: number;
  volume24h: number;
  sparkline7d?: number[];
}

interface CoinGeckoResponse {
  markets: CoinGeckoMarket[];
  degraded: boolean;
}

interface CryptoRow {
  coinId: string;
  rank: number;
  sym: string;
  name: string;
  price: string;
  numPrice: number;
  chg1h: number | null;
  chg1d: number;
  chg7d: number | null;
  chg30d: number | null;
  mcapB: number;
  fdvB: number | null;
  dominance: number;
  vol24hB: number;
  athPct: number | null;
  hist7d: number[];
  hist1m: number[];
  hist1y: number[];
  hist5y: number[];
  category: string;
}

const CAT_LOOKUP: Record<string, string> = {
  btc: "L1", eth: "L1", bnb: "Exchange", sol: "L1", xrp: "Payment",
  usdc: "Stablecoin", usdt: "Stablecoin", usds: "Stablecoin", dai: "Stablecoin",
  busd: "Stablecoin", tusd: "Stablecoin", fdusd: "Stablecoin",
  ada: "L1", avax: "L1", doge: "Meme", dot: "L0", link: "Oracle",
  matic: "L2", pol: "L2", uni: "DeFi", atom: "L0", op: "L2", arb: "L2",
  ton: "L1", shib: "Meme", trx: "L1", near: "L1", ftm: "L1", apt: "L1",
  sei: "L1", sui: "L1", stx: "L1", inj: "DeFi", aave: "DeFi",
  wbt: "Exchange", leo: "Exchange", hbar: "L1", bch: "L1", ltc: "L1",
  pepe: "Meme", fet: "AI", rndr: "AI", imx: "L2", fil: "Storage",
};

const CAT_COLOR: Record<string, string> = {
  L1: "#89e5ff", L2: "#6ee7b7", L0: "#c4b5fd", DeFi: "#fbbf24",
  Exchange: "#f97316", Oracle: "#34d399", Payment: "#60a5fa",
  Stablecoin: "var(--si-text-muted)", Meme: "#fb7185",
  AI: "#a78bfa", Storage: "#38bdf8",
};

function downsample(arr: number[], target: number): number[] {
  if (arr.length <= target) return arr;
  const step = (arr.length - 1) / (target - 1);
  const result: number[] = [];
  for (let i = 0; i < target; i++) {
    result.push(arr[Math.floor(i * step)]);
  }
  return result;
}

function formatPrice(p: number): string {
  if (p >= 10000) return `$${p.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (p >= 1) return `$${p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${p.toFixed(4)}`;
}

function fmtB(v: number | null): string {
  if (v == null) return "—";
  if (v >= 1000) return `$${(v / 1000).toFixed(2)}T`;
  if (v >= 1) return `$${v.toFixed(0)}B`;
  return `$${(v * 1000).toFixed(0)}M`;
}

function pctColor(v: number | null): string {
  if (v == null) return "var(--si-text-muted)";
  return v >= 0 ? "#36b37e" : "#ff5a5f";
}

function fmtPct(v: number | null, decimals = 2): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(decimals)}%`;
}

const EMPTY: CoinGeckoResponse = { markets: [], degraded: true };

interface Props {
  style?: React.CSSProperties;
  onTickerClick?: (sym: string, context?: MarketAssetContext) => void;
}

export default function CryptoMarketPanel({ style, onTickerClick }: Props) {
  const { data, isLive } = useMarketData<CoinGeckoResponse>(
    "/api/news/coingecko?mode=markets&limit=15",
    120_000,
    EMPTY,
  );

  const rows: CryptoRow[] = data.markets.length > 0
    ? data.markets.map((c, i) => {
        const raw = (c.sparkline7d ?? []).filter((price) => Number.isFinite(price) && price > 0);
        const sparkline = downsample(raw, 7);
        const chg7d = raw.length >= 2
          ? ((raw[raw.length - 1] - raw[0]) / raw[0]) * 100
          : null;
        const totalMcap = data.markets.reduce((s, m) => s + (m.marketCap ?? 0), 0);
        const dom = totalMcap > 0 ? ((c.marketCap ?? 0) / totalMcap) * 100 : 0;
        const sym = c.symbol.toUpperCase();
        const price = c.currentPrice;
        const mcapB = (c.marketCap ?? 0) / 1e9;
        const cat = CAT_LOOKUP[c.symbol] ?? "L1";
        return {
          coinId: c.id,
          rank: i + 1,
          sym,
          name: c.name,
          price: formatPrice(price),
          numPrice: price,
          chg1h: null,
          chg1d: c.priceChangePercent24h ?? 0,
          chg7d,
          chg30d: null,
          mcapB,
          fdvB: null,
          dominance: dom,
          vol24hB: (c.volume24h ?? 0) / 1e9,
          athPct: null,
          hist7d: sparkline,
          hist1m: [],
          hist1y: [],
          hist5y: [],
          category: cat,
        };
      })
    : [];

  const totalMcap = rows.reduce((s, c) => s + c.mcapB, 0);
  const btc = rows.find((row) => row.sym === "BTC");
  const btcDom = btc && totalMcap > 0 ? `${((btc.mcapB / totalMcap) * 100).toFixed(1)}%` : "—";

  // 16 columns: #  SYM  NAME  TAG  PRICE  1H%  1D%  7D%  30D%  MCAP  FDV  DOM  VOL24H  V/MC  ATH%  7D CHART
  return (
    <div className="si-market-panel" style={style}>
      <div className="si-market-panel-header">
        <span className="si-market-panel-title">Crypto Market</span>
        <span style={{ fontSize: 9, color: "var(--si-text-muted)" }}>
          Shown assets total: <span style={{ color: "var(--si-text)" }}>${totalMcap >= 1000 ? `${(totalMcap / 1000).toFixed(2)}T` : `${totalMcap.toFixed(0)}B`}</span>
          &nbsp;· BTC share of shown: <span style={{ color: "#ffab40" }}>{btcDom}</span>
        </span>
        <span className={`si-market-panel-badge ${isLive && rows.length > 0 ? "is-live" : "is-static"}`}>
          {rows.length === 0 ? "UNAVAILABLE" : isLive ? "LIVE" : "STALE"}
        </span>
      </div>
      <div className="si-market-panel-body" style={{ padding: 0 }}>
        <div className="si-crypto-header">
          <span>#</span>
          <span>SYM</span>
          <span style={{ paddingLeft: 8 }}>NAME</span>
          <span style={{ textAlign: "center" }}>TAG</span>
          <span style={{ textAlign: "right" }}>PRICE</span>
          <span style={{ textAlign: "right" }}>1H%</span>
          <span style={{ textAlign: "right" }}>1D%</span>
          <span style={{ textAlign: "right" }}>7D%</span>
          <span style={{ textAlign: "right" }}>30D%</span>
          <span style={{ textAlign: "right" }}><Term id="MKTCAP">MCAP</Term></span>
          <span style={{ textAlign: "right" }}><Term id="FDV">FDV</Term></span>
          <span style={{ textAlign: "right" }}><span title="Share of returned assets only">SHARE*</span></span>
          <span style={{ textAlign: "right" }}><Term id="VOL">VOL 24H</Term></span>
          <span style={{ textAlign: "right" }}>V/MC</span>
          <span style={{ textAlign: "right" }}><Term id="ATH">ATH%</Term></span>
          <span style={{ textAlign: "center" }}>7D</span>
          <span style={{ textAlign: "center" }}>1M</span>
          <span style={{ textAlign: "center" }}>1Y</span>
          <span style={{ textAlign: "center" }}>5Y</span>
        </div>
        {rows.length === 0 && <div style={{ padding: 12 }}>Crypto data unavailable</div>}
        {rows.map((c) => {
          const vmcRatio = c.mcapB > 0 ? (c.vol24hB / c.mcapB) : 0;
          return (
            <div
              key={c.coinId}
              className="si-crypto-row"
              onClick={() => onTickerClick?.(c.sym, { kind: "crypto", coinId: c.coinId })}
              style={{ cursor: onTickerClick ? "pointer" : "default" }}
            >
              <span style={{ color: "var(--si-text-muted)", fontSize: 9 }}>{c.rank}</span>
              <span style={{ color: CAT_COLOR[c.category] ?? "#89e5ff", fontWeight: 700 }}>{c.sym}</span>
              <span style={{ color: "var(--si-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 9.5, paddingLeft: 8 }}>{c.name}</span>
              <span style={{
                textAlign: "center", fontSize: 8, fontWeight: 600, letterSpacing: "0.03em",
                color: CAT_COLOR[c.category] ?? "#89e5ff",
                background: "rgba(185,205,224,0.07)",
                padding: "1px 4px", borderRadius: 2, whiteSpace: "nowrap",
              }}>{c.category}</span>
              <span style={{ textAlign: "right", fontWeight: 600, color: "var(--si-text)" }}>{c.price}</span>
              <span style={{ textAlign: "right", fontSize: 9, color: pctColor(c.chg1h) }}>
                {fmtPct(c.chg1h)}
              </span>
              <span style={{ textAlign: "right", color: pctColor(c.chg1d) }}>
                {fmtPct(c.chg1d)}
              </span>
              <span style={{ textAlign: "right", color: pctColor(c.chg7d) }}>
                {fmtPct(c.chg7d, 1)}
              </span>
              <span style={{ textAlign: "right", color: pctColor(c.chg30d) }}>
                {fmtPct(c.chg30d, 1)}
              </span>
              <span style={{ textAlign: "right", color: "var(--si-text)" }}>
                {fmtB(c.mcapB)}
              </span>
              <span style={{ textAlign: "right", color: "var(--si-text-muted)", fontSize: 9 }}>
                {fmtB(c.fdvB)}
              </span>
              <span style={{ textAlign: "right", color: "var(--si-text-muted)", fontSize: 9 }}>{c.dominance.toFixed(1)}%</span>
              <span style={{ textAlign: "right", color: "var(--si-text-muted)", fontSize: 9 }}>${c.vol24hB.toFixed(1)}B</span>
              <span style={{ textAlign: "right", fontFamily: "monospace", fontSize: 9, color: vmcRatio > 0.1 ? "#ffab40" : "var(--si-text-muted)" }}>
                {c.mcapB > 0 ? `${(vmcRatio * 100).toFixed(1)}%` : "—"}
              </span>
              <span style={{ textAlign: "right", fontSize: 9, color: c.athPct != null && c.athPct > -10 ? "#36b37e" : c.athPct != null && c.athPct > -50 ? "#ffab40" : "#ff5a5f" }}>
                {c.athPct != null ? `${c.athPct.toFixed(0)}%` : "—"}
              </span>
              <span style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                {c.hist7d.length >= 2 ? <MiniSparkline prices={c.hist7d} up={(c.chg7d ?? 0) >= 0} width={36} height={14} /> : "—"}
              </span>
              <span style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                —
              </span>
              <span style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                —
              </span>
              <span style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                —
              </span>
            </div>
          );
        })}
      </div>
      <div className="si-market-panel-footer">
        {isLive ? "CoinGecko · 2min refresh" : "CoinGecko · stale or unavailable"} · Share of shown assets only. 1H, 30D, FDV, ATH and longer histories unavailable.
      </div>
    </div>
  );
}
