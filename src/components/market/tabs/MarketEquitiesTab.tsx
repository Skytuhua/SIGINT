"use client";

import EarningsTracker from "../EarningsTracker";
import TopMoversPanel from "../TopMoversPanel";
import InsiderFlowPanel from "../InsiderFlowPanel";
import AnalystRatingsPanel from "../AnalystRatingsPanel";
import DividendCalendarPanel from "../DividendCalendarPanel";
import IpoCalendarPanel from "../IpoCalendarPanel";
import MarketNewsTape from "../MarketNewsTape";
import MarketBreadthPanel from "../MarketBreadthPanel";
import SectorRotationPanel from "../SectorRotationPanel";
import FactorPerformancePanel from "../FactorPerformancePanel";
import OptionsFlowPanel from "../OptionsFlowPanel";
import ShortInterestPanel from "../ShortInterestPanel";
import SectionLabel from "../shared/SectionLabel";
import EquityWatchlistPanel from "../EquityWatchlistPanel";
import TradingViewWidget from "../shared/TradingViewWidget";
import { useIsMobile } from "../../../hooks/useIsMobile";

interface Props {
  onTickerClick?: (sym: string) => void;
}

export default function MarketEquitiesTab({ onTickerClick }: Props) {
  const isMobile = useIsMobile();
  return (
    <div className="si-overview-scroll">

      {/* ── 1: ROTATION & FACTORS ────────────────────────────────── */}
      <SectionLabel label="SECTOR ROTATION & FACTOR RETURNS" sub="Multi-timeframe relative performance · Momentum signals" />
      <div className="si-overview-row-2col">
        <SectorRotationPanel />
        <FactorPerformancePanel />
      </div>

      {/* ── LIVE CHART ───────────────────────────────────────────── */}
      <SectionLabel label="EQUITY CHART" sub="Live TradingView chart · Change symbol with search" />
      <div className="si-overview-row-full">
        <div className="si-market-panel" style={{ minHeight: 420 }}>
          <div className="si-market-panel-header">
            <span className="si-market-panel-title">Equity Chart</span>
            <span className="si-market-panel-badge is-live">LIVE</span>
          </div>
          <div className="si-market-panel-body" style={{ padding: 0, overflow: "hidden" }}>
            <TradingViewWidget
              scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"
              config={{
                symbol: "AMEX:SPY",
                interval: "D",
                style: "1",
                allow_symbol_change: true,
                hide_top_toolbar: false,
                hide_side_toolbar: isMobile,
                withdateranges: true,
                save_image: false,
                details: true,
                calendar: false,
                width: "100%",
                height: "100%",
              }}
              height="100%"
              width="100%"
              style={{ minHeight: 360 }}
            />
          </div>
          <div className="si-market-panel-footer">TradingView · Advanced Chart · real-time</div>
        </div>
      </div>

      {/* ── WATCHLIST ──────────────────────────────────────────── */}
      <SectionLabel label="WATCHLIST" sub="Your personal equity tracker · Add tickers to follow" />
      <div className="si-overview-row-full">
        <EquityWatchlistPanel style={{ minHeight: 200 }} onTickerClick={onTickerClick} />
      </div>

      {/* ── 2: MOVERS & BREADTH ──────────────────────────────────── */}
      <SectionLabel label="MARKET INTERNALS" sub="Top movers · NYSE / Nasdaq breadth" />
      <div className="si-overview-row-2col">
        <TopMoversPanel style={{ minHeight: 340 }} onTickerClick={onTickerClick} />
        <MarketBreadthPanel style={{ minHeight: 400 }} />
      </div>

      {/* ── 3: OPTIONS & SHORT INTEREST ──────────────────────────── */}
      <SectionLabel label="OPTIONS FLOW & SHORT INTEREST" sub="Unusual sweeps · Dark pool prints · Squeeze screener" />
      <div className="si-overview-row-2col">
        <OptionsFlowPanel />
        <ShortInterestPanel onTickerClick={onTickerClick} />
      </div>

      {/* ── 4: EARNINGS ──────────────────────────────────────────── */}
      <SectionLabel label="EARNINGS" sub="Calendar · Beat/miss tracker · EPS surprise" />
      <div className="si-overview-row-full">
        <EarningsTracker style={{ minHeight: 340 }} onTickerClick={onTickerClick} />
      </div>

      {/* ── 5: ANALYST ACTIVITY ──────────────────────────────────── */}
      <SectionLabel label="ANALYST ACTIVITY" sub="Upgrades · Downgrades · Price targets · Insider filing" />
      <div className="si-overview-row-2col">
        <AnalystRatingsPanel style={{ minHeight: 380 }} onTickerClick={onTickerClick} />
        <InsiderFlowPanel style={{ minHeight: 380 }} onTickerClick={onTickerClick} />
      </div>

      {/* ── 6: CORPORATE EVENTS ──────────────────────────────────── */}
      <SectionLabel label="CORPORATE EVENTS" sub="Dividends · IPO pipeline" />
      <div className="si-overview-row-2col">
        <DividendCalendarPanel style={{ minHeight: 360 }} onTickerClick={onTickerClick} />
        <IpoCalendarPanel style={{ minHeight: 300 }} />
      </div>

      {/* ── 7: NEWS ──────────────────────────────────────────────── */}
      <SectionLabel label="EQUITY NEWS" sub="Latest market headlines" />
      <div className="si-overview-row-full">
        <MarketNewsTape style={{ minHeight: 240 }} />
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}
