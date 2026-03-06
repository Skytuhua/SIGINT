"use client";

import GlobalSnapshotPanel from "../GlobalSnapshotPanel";
import VolatilityPanel from "../VolatilityPanel";
import MarketHeatmapPanel from "../MarketHeatmapPanel";
import EarningsTracker from "../EarningsTracker";
import TopMoversPanel from "../TopMoversPanel";
import MarketNewsTape from "../MarketNewsTape";
import YieldCurvePanel from "../YieldCurvePanel";
import FxMatrixPanel from "../FxMatrixPanel";
import CommoditiesBoard from "../CommoditiesBoard";
import EconCalendarPanel from "../EconCalendarPanel";
import MarketSummaryStrip from "../MarketSummaryStrip";
import MarketBreadthPanel from "../MarketBreadthPanel";
import CorrelationMatrixPanel from "../CorrelationMatrixPanel";
import CentralBankPanel from "../CentralBankPanel";

type Scenario = "BASELINE" | "RISK-OFF" | "RATES UP" | "OIL SHOCK";

interface Props {
  scenario: Scenario;
  onTickerClick?: (sym: string) => void;
}

function SectionLabel({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="wv-overview-section-label">
      <span className="wv-overview-section-title">{label}</span>
      {sub && <span className="wv-overview-section-sub">{sub}</span>}
      <div className="wv-overview-section-rule" />
    </div>
  );
}

export default function MarketOverviewTab({ scenario, onTickerClick }: Props) {
  return (
    <div className="wv-overview-scroll">

      {/* ── HERO STRIP ─────────────────────────────────────────────── */}
      <MarketSummaryStrip onTickerClick={onTickerClick} />

      {/* ── SECTION 1: SECTOR HEATMAP ──────────────────────────────── */}
      <SectionLabel label="SECTOR HEATMAP" sub="S&P 500 individual stocks · 1D performance" />
      <div className="wv-overview-row-full">
        <MarketHeatmapPanel style={{ minHeight: 500 }} onTickerClick={onTickerClick} />
      </div>

      {/* ── SECTION 2: SNAPSHOT & MOVERS ───────────────────────────── */}
      <SectionLabel label="EQUITY MARKETS" sub="Snapshot · Top movers" />
      <div className="wv-overview-row-2col">
        <GlobalSnapshotPanel
          scenario={scenario}
          style={{ minHeight: 340 }}
          onTickerClick={onTickerClick}
        />
        <TopMoversPanel style={{ minHeight: 300 }} onTickerClick={onTickerClick} />
      </div>

      {/* ── SECTION 2: VOLATILITY & BREADTH ────────────────────────── */}
      <SectionLabel label="SENTIMENT & BREADTH" sub="Risk regime · Market internals · Correlations" />
      <div className="wv-overview-row-3col">
        <VolatilityPanel style={{ minHeight: 260 }} />
        <MarketBreadthPanel style={{ minHeight: 280 }} />
        <CorrelationMatrixPanel style={{ minHeight: 280 }} />
      </div>

      {/* ── SECTION 3: RATES & MACRO ───────────────────────────────── */}
      <SectionLabel label="RATES & MACRO" sub="Yield curve · Economic calendar · Central banks" />
      <div className="wv-overview-row-3col">
        <YieldCurvePanel style={{ minHeight: 300 }} />
        <EconCalendarPanel style={{ minHeight: 300 }} />
        <CentralBankPanel style={{ minHeight: 320 }} />
      </div>

      {/* ── SECTION 4: FX ──────────────────────────────────────────── */}
      <SectionLabel label="FOREIGN EXCHANGE" sub="Cross-rate matrix · FX movers" />
      <div className="wv-overview-row-2col">
        <FxMatrixPanel style={{ minHeight: 280 }} />
        <TopMoversPanel filter="fx" style={{ minHeight: 260 }} onTickerClick={onTickerClick} />
      </div>

      {/* ── SECTION 5: COMMODITIES ─────────────────────────────────── */}
      <SectionLabel label="COMMODITIES" sub="Energy · Metals · Agriculture" />
      <div className="wv-overview-row-full">
        <CommoditiesBoard style={{ minHeight: 240 }} />
      </div>

      {/* ── SECTION 6: EARNINGS & NEWS ─────────────────────────────── */}
      <SectionLabel label="EARNINGS & NEWS" sub="Calendar · Market tape" />
      <div className="wv-overview-row-2col">
        <EarningsTracker style={{ minHeight: 300 }} onTickerClick={onTickerClick} />
        <MarketNewsTape style={{ minHeight: 300 }} />
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}
