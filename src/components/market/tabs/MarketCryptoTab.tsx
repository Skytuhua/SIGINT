"use client";

import CryptoMarketPanel from "../CryptoMarketPanel";
import CryptoMetricsPanel from "../CryptoMetricsPanel";
import WatchlistPanel from "../WatchlistPanel";
import ChartPanel from "../ChartPanel";
import OrderBookPanel from "../OrderBookPanel";
import MarketNewsTape from "../MarketNewsTape";
import SectionLabel from "../shared/SectionLabel";

interface Props {
  onTickerClick?: (sym: string) => void;
}

export default function MarketCryptoTab({ onTickerClick }: Props) {
  return (
    <div className="wv-overview-scroll">

      {/* ── 1: CRYPTO MARKETS ────────────────────────────────────── */}
      <SectionLabel label="CRYPTO MARKETS" sub="Ranked by market cap · Price · Volume · Dominance" />
      <div className="wv-overview-row-full">
        <CryptoMarketPanel style={{ minHeight: 460 }} />
      </div>

      {/* ── 2: ON-CHAIN METRICS & WATCHLIST ──────────────────────── */}
      <SectionLabel label="ON-CHAIN METRICS & WATCHLIST" sub="Network health · Derivatives · DeFi · Funding rates" />
      <div className="wv-overview-row-2col">
        <CryptoMetricsPanel style={{ minHeight: 380 }} />
        <WatchlistPanel style={{ minHeight: 340 }} onTickerClick={onTickerClick} />
      </div>

      {/* ── 3: CHART & ORDER BOOK ────────────────────────────────── */}
      <SectionLabel label="PRICE ACTION & MARKET DEPTH" sub="Candlestick chart · Bid/ask depth" />
      <div className="wv-overview-row-2col">
        <ChartPanel style={{ minHeight: 300 }} />
        <OrderBookPanel style={{ minHeight: 300 }} />
      </div>

      {/* ── 4: NEWS ──────────────────────────────────────────────── */}
      <SectionLabel label="CRYPTO NEWS" sub="Bitcoin · Ethereum · DeFi · Regulation" />
      <div className="wv-overview-row-full">
        <MarketNewsTape style={{ minHeight: 240 }} />
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}
