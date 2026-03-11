"use client";

import CryptoMarketPanel from "../CryptoMarketPanel";
import CryptoMetricsPanel from "../CryptoMetricsPanel";
import WatchlistPanel from "../WatchlistPanel";
import ChartPanel from "../ChartPanel";
import OrderBookPanel from "../OrderBookPanel";
import TradingViewWidget from "../shared/TradingViewWidget";
import SectionLabel from "../shared/SectionLabel";

interface Props {
  onTickerClick?: (sym: string) => void;
}

export default function MarketCryptoTab({ onTickerClick }: Props) {
  return (
    <div className="si-overview-scroll">

      {/* ── 1: CRYPTO MARKETS ────────────────────────────────────── */}
      <SectionLabel label="CRYPTO MARKETS" sub="Ranked by market cap · Price · Volume · Dominance" />
      <div className="si-overview-row-full">
        <CryptoMarketPanel style={{ minHeight: 460 }} />
      </div>

      {/* ── 2: ON-CHAIN METRICS & WATCHLIST ──────────────────────── */}
      <SectionLabel label="ON-CHAIN METRICS & WATCHLIST" sub="Network health · Derivatives · DeFi · Funding rates" />
      <div className="si-overview-row-2col">
        <CryptoMetricsPanel style={{ minHeight: 380 }} />
        <WatchlistPanel style={{ minHeight: 380 }} onTickerClick={onTickerClick} />
      </div>

      {/* ── 3: CHART & MARKET DEPTH ────────────────────────────── */}
      <SectionLabel label="PRICE ACTION & MARKET DEPTH" sub="Live TradingView charts · Real-time data" />
      <div className="si-overview-row-2col">
        <ChartPanel style={{ minHeight: 360 }} />
        <OrderBookPanel style={{ minHeight: 360 }} />
      </div>

      {/* ── 4: CRYPTO NEWS ─────────────────────────────────────── */}
      <SectionLabel label="CRYPTO NEWS" sub="Bitcoin · Ethereum · DeFi · Regulation · Real-time" />
      <div className="si-overview-row-full">
        <div className="si-market-panel" style={{ minHeight: 400 }}>
          <div className="si-market-panel-header">
            <span className="si-market-panel-title">Crypto News Feed</span>
            <span className="si-market-panel-badge is-live">LIVE</span>
          </div>
          <div className="si-market-panel-body" style={{ padding: 0, overflow: "hidden" }}>
            <TradingViewWidget
              scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-timeline.js"
              config={{
                feedMode: "market",
                market: "crypto",
                width: "100%",
                height: "100%",
                displayMode: "regular",
              }}
              height="100%"
              width="100%"
              style={{ minHeight: 340 }}
            />
          </div>
          <div className="si-market-panel-footer">TradingView · Crypto News Timeline · real-time</div>
        </div>
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}
