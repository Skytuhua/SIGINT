"use client";

import { useEffect } from "react";
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
import MarketBreadthPanel from "../MarketBreadthPanel";
import CorrelationMatrixPanel from "../CorrelationMatrixPanel";
import CentralBankPanel from "../CentralBankPanel";
import SectorRotationPanel from "../SectorRotationPanel";
import OptionsFlowPanel from "../OptionsFlowPanel";
import ShortInterestPanel from "../ShortInterestPanel";
import CryptoMarketPanel from "../CryptoMarketPanel";
import FedFuturesPanel from "../FedFuturesPanel";
import CreditSpreadPanel from "../CreditSpreadPanel";
import MarketRegimePanel from "../MarketRegimePanel";

type Scenario = "BASELINE" | "RISK-OFF" | "RATES UP" | "OIL SHOCK";

interface Props {
  scenario: Scenario;
  onTickerClick?: (sym: string) => void;
}

function SectionLabel({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="si-overview-section-label">
      <span className="si-overview-section-title">{label}</span>
      {sub && <span className="si-overview-section-sub">{sub}</span>}
      <div className="si-overview-section-rule" />
    </div>
  );
}

export default function MarketOverviewTab({ scenario, onTickerClick }: Props) {
  // Prefetch all market data in one batch call to warm server caches
  useEffect(() => {
    fetch("/api/market/prefetch").catch(() => {});
  }, []);

  return (
    <div className="si-overview-scroll">

      {/* ── SECTION 1: SECTOR HEATMAP ──────────────────────────────── */}
      <SectionLabel label="SECTOR HEATMAP" sub="S&P 500 individual stocks · 1D performance" />
      <div className="si-overview-row-full">
        <MarketHeatmapPanel style={{ minHeight: 500 }} onTickerClick={onTickerClick} />
      </div>

      {/* ── SECTION 2: SNAPSHOT & MOVERS ───────────────────────────── */}
      <SectionLabel label="EQUITY MARKETS" sub="Snapshot · Top movers" />
      <div className="si-overview-row-2col">
        <GlobalSnapshotPanel
          scenario={scenario}
          style={{ minHeight: 340 }}
          onTickerClick={onTickerClick}
        />
        <TopMoversPanel style={{ minHeight: 300 }} onTickerClick={onTickerClick} />
      </div>

      {/* ── SECTION 3: SECTOR PERFORMANCE ─────────────────────────── */}
      <SectionLabel label="SECTOR PERFORMANCE" sub="Sector ETF returns across timeframes" />
      <div className="si-overview-row-full">
        <SectorRotationPanel style={{ minHeight: 320 }} onTickerClick={onTickerClick} />
      </div>

      {/* ── SECTION 4: SENTIMENT & REGIME ────────────────────────── */}
      <SectionLabel label="SENTIMENT & BREADTH" sub="Fear & Greed regime · Risk gauges · Market internals · Correlations" />
      <div className="si-overview-row-full">
        <MarketRegimePanel style={{ minHeight: 280 }} />
      </div>
      <div className="si-overview-row-3col">
        <VolatilityPanel style={{ minHeight: 260 }} />
        <MarketBreadthPanel style={{ minHeight: 280 }} />
        <CorrelationMatrixPanel style={{ minHeight: 280 }} />
      </div>

      {/* ── SECTION 5: MARKET ACTIVITY ─────────────────────────────── */}
      <SectionLabel label="MARKET ACTIVITY" sub="Options flow · Short interest" />
      <div className="si-overview-row-2col">
        <OptionsFlowPanel style={{ minHeight: 340 }} onTickerClick={onTickerClick} />
        <ShortInterestPanel style={{ minHeight: 340 }} onTickerClick={onTickerClick} />
      </div>

      {/* ── SECTION 6: RATES & MACRO ───────────────────────────────── */}
      <SectionLabel label="RATES & MACRO" sub="Yield curve · Fed futures · Credit spreads" />
      <div className="si-overview-row-3col">
        <YieldCurvePanel style={{ minHeight: 300 }} />
        <FedFuturesPanel style={{ minHeight: 300 }} />
        <CreditSpreadPanel style={{ minHeight: 300 }} />
      </div>

      {/* ── SECTION 7: CENTRAL BANKS & ECON ────────────────────────── */}
      <SectionLabel label="CENTRAL BANKS & ECONOMIC CALENDAR" sub="Policy rates · Upcoming events" />
      <div className="si-overview-row-2col">
        <CentralBankPanel style={{ minHeight: 320 }} />
        <EconCalendarPanel style={{ minHeight: 320 }} />
      </div>

      {/* ── SECTION 8: FX ──────────────────────────────────────────── */}
      <SectionLabel label="FOREIGN EXCHANGE" sub="Cross-rate matrix · FX movers" />
      <div className="si-overview-row-2col">
        <FxMatrixPanel style={{ minHeight: 280 }} />
        <TopMoversPanel filter="fx" style={{ minHeight: 260 }} onTickerClick={onTickerClick} />
      </div>

      {/* ── SECTION 9: COMMODITIES ─────────────────────────────────── */}
      <SectionLabel label="COMMODITIES" sub="Energy · Metals · Agriculture" />
      <div className="si-overview-row-full">
        <CommoditiesBoard style={{ minHeight: 240 }} />
      </div>

      {/* ── SECTION 10: CRYPTO ─────────────────────────────────────── */}
      <SectionLabel label="CRYPTO MARKETS" sub="Top cryptocurrencies by market cap" />
      <div className="si-overview-row-full">
        <CryptoMarketPanel style={{ minHeight: 360 }} onTickerClick={onTickerClick} />
      </div>

      {/* ── SECTION 11: EARNINGS & NEWS ────────────────────────────── */}
      <SectionLabel label="EARNINGS & NEWS" sub="Calendar · Market tape" />
      <div className="si-overview-row-2col">
        <EarningsTracker style={{ minHeight: 300 }} onTickerClick={onTickerClick} />
        <MarketNewsTape style={{ minHeight: 300 }} />
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}
