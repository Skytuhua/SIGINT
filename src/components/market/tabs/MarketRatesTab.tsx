"use client";

import YieldCurvePanel from "../YieldCurvePanel";
import EconCalendarPanel from "../EconCalendarPanel";
import CentralBankPanel from "../CentralBankPanel";
import FedFuturesPanel from "../FedFuturesPanel";
import CreditSpreadPanel from "../CreditSpreadPanel";
import VolatilityPanel from "../VolatilityPanel";
import BreakevenInflationPanel from "../BreakevenInflationPanel";
import MarketNewsTape from "../MarketNewsTape";
import SectionLabel from "../shared/SectionLabel";

export default function MarketRatesTab() {
  return (
    <div className="wv-overview-scroll">

      {/* ── 1: YIELD CURVE ───────────────────────────────────────── */}
      <SectionLabel label="YIELD CURVE" sub="US Treasuries · 2Y-10Y spread · Inversion indicator" />
      <div className="wv-overview-row-2col">
        <YieldCurvePanel style={{ minHeight: 320 }} />
        <FedFuturesPanel style={{ minHeight: 300 }} />
      </div>

      {/* ── 2: CENTRAL BANKS ─────────────────────────────────────── */}
      <SectionLabel label="CENTRAL BANKS" sub="Global policy rates · Meeting schedule · Stance" />
      <div className="wv-overview-row-full">
        <CentralBankPanel style={{ minHeight: 340 }} />
      </div>

      {/* ── 3: CREDIT & VOLATILITY ───────────────────────────────── */}
      <SectionLabel label="CREDIT MARKETS & VOLATILITY" sub="IG / HY / EM spreads · CDS · Fear gauges" />
      <div className="wv-overview-row-2col">
        <CreditSpreadPanel style={{ minHeight: 260 }} />
        <VolatilityPanel style={{ minHeight: 260 }} />
      </div>

      {/* ── 4: BREAKEVEN INFLATION ───────────────────────────────── */}
      <SectionLabel label="BREAKEVEN INFLATION & REAL YIELDS" sub="TIPS · Nominal vs Real rates · Inflation expectations" />
      <div className="wv-overview-row-full">
        {/* auto-height via wv-market-panel-body-auto */}
        <BreakevenInflationPanel />
      </div>

      {/* ── 5: ECONOMIC CALENDAR ─────────────────────────────────── */}
      <SectionLabel label="ECONOMIC CALENDAR" sub="Upcoming data releases · Consensus estimates" />
      <div className="wv-overview-row-full">
        <EconCalendarPanel style={{ minHeight: 300 }} />
      </div>

      {/* ── 6: NEWS ──────────────────────────────────────────────── */}
      <SectionLabel label="RATES NEWS" sub="Fed watch · Treasury · Central bank commentary" />
      <div className="wv-overview-row-full">
        <MarketNewsTape style={{ minHeight: 240 }} />
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}
