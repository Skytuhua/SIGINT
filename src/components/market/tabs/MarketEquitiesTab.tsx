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

interface Props {
  onTickerClick?: (sym: string) => void;
}

export default function MarketEquitiesTab({ onTickerClick }: Props) {
  return (
    <div className="wv-overview-scroll">

      {/* ── 1: ROTATION & FACTORS ────────────────────────────────── */}
      <SectionLabel label="SECTOR ROTATION & FACTOR RETURNS" sub="Multi-timeframe relative performance · Momentum signals" />
      <div className="wv-overview-row-2col">
        {/* auto-height via wv-market-panel-body-auto — no minHeight needed */}
        <SectorRotationPanel />
        <FactorPerformancePanel />
      </div>

      {/* ── 2: MOVERS & BREADTH ──────────────────────────────────── */}
      <SectionLabel label="MARKET INTERNALS" sub="Top movers · NYSE / Nasdaq breadth" />
      <div className="wv-overview-row-2col">
        <TopMoversPanel style={{ minHeight: 340 }} onTickerClick={onTickerClick} />
        <MarketBreadthPanel style={{ minHeight: 400 }} />
      </div>

      {/* ── 3: OPTIONS & SHORT INTEREST ──────────────────────────── */}
      <SectionLabel label="OPTIONS FLOW & SHORT INTEREST" sub="Unusual sweeps · Dark pool prints · Squeeze screener" />
      <div className="wv-overview-row-2col">
        <OptionsFlowPanel />
        <ShortInterestPanel onTickerClick={onTickerClick} />
      </div>

      {/* ── 4: EARNINGS ──────────────────────────────────────────── */}
      <SectionLabel label="EARNINGS" sub="Calendar · Beat/miss tracker · EPS surprise" />
      <div className="wv-overview-row-full">
        <EarningsTracker style={{ minHeight: 340 }} onTickerClick={onTickerClick} />
      </div>

      {/* ── 5: ANALYST ACTIVITY ──────────────────────────────────── */}
      <SectionLabel label="ANALYST ACTIVITY" sub="Upgrades · Downgrades · Price targets · Insider filing" />
      <div className="wv-overview-row-2col">
        <AnalystRatingsPanel style={{ minHeight: 380 }} onTickerClick={onTickerClick} />
        <InsiderFlowPanel style={{ minHeight: 380 }} onTickerClick={onTickerClick} />
      </div>

      {/* ── 6: CORPORATE EVENTS ──────────────────────────────────── */}
      <SectionLabel label="CORPORATE EVENTS" sub="Dividends · IPO pipeline" />
      <div className="wv-overview-row-2col">
        <DividendCalendarPanel style={{ minHeight: 360 }} onTickerClick={onTickerClick} />
        <IpoCalendarPanel style={{ minHeight: 300 }} />
      </div>

      {/* ── 7: NEWS ──────────────────────────────────────────────── */}
      <SectionLabel label="EQUITY NEWS" sub="Latest market headlines" />
      <div className="wv-overview-row-full">
        <MarketNewsTape style={{ minHeight: 240 }} />
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}
