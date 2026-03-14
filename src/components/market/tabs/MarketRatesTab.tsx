"use client";

import YieldCurvePanel from "../YieldCurvePanel";
import EconCalendarPanel from "../EconCalendarPanel";
import CentralBankPanel from "../CentralBankPanel";
import FedFuturesPanel from "../FedFuturesPanel";
import CreditSpreadPanel from "../CreditSpreadPanel";
import VolatilityPanel from "../VolatilityPanel";
import BreakevenInflationPanel from "../BreakevenInflationPanel";
import MarketNewsTape from "../MarketNewsTape";
import TradingViewWidget from "../shared/TradingViewWidget";
import SectionLabel from "../shared/SectionLabel";
import { useIsMobile } from "../../../hooks/useIsMobile";

export default function MarketRatesTab() {
  const isMobile = useIsMobile();
  return (
    <div className="si-overview-scroll">

      {/* ── 1: YIELD CURVE ───────────────────────────────────────── */}
      <SectionLabel label="YIELD CURVE" sub="US Treasuries · 2Y-10Y spread · Inversion indicator" />
      <div className="si-overview-row-2col">
        <YieldCurvePanel style={{ minHeight: 320 }} />
        <FedFuturesPanel style={{ minHeight: 300 }} />
      </div>

      {/* ── BOND CHART ───────────────────────────────────────────── */}
      <SectionLabel label="BOND MARKET CHART" sub="Live US 10Y Treasury yield · TradingView" />
      <div className="si-overview-row-full">
        <div className="si-market-panel" style={{ minHeight: 380 }}>
          <div className="si-market-panel-header">
            <span className="si-market-panel-title">US 10Y Treasury Yield</span>
            <span className="si-market-panel-badge is-live">LIVE</span>
          </div>
          <div className="si-market-panel-body" style={{ padding: 0, overflow: "hidden" }}>
            <TradingViewWidget
              scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"
              config={{
                symbol: "TVC:US10Y",
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
              style={{ minHeight: 320 }}
            />
          </div>
          <div className="si-market-panel-footer">TradingView · Advanced Chart · real-time</div>
        </div>
      </div>

      {/* ── 2: CENTRAL BANKS ─────────────────────────────────────── */}
      <SectionLabel label="CENTRAL BANKS" sub="Global policy rates · Meeting schedule · Stance" />
      <div className="si-overview-row-full">
        <CentralBankPanel style={{ minHeight: 340 }} />
      </div>

      {/* ── 3: CREDIT & VOLATILITY ───────────────────────────────── */}
      <SectionLabel label="CREDIT MARKETS & VOLATILITY" sub="IG / HY / EM spreads · CDS · Fear gauges" />
      <div className="si-overview-row-2col">
        <CreditSpreadPanel style={{ minHeight: 260 }} />
        <VolatilityPanel style={{ minHeight: 260 }} />
      </div>

      {/* ── 4: BREAKEVEN INFLATION ───────────────────────────────── */}
      <SectionLabel label="BREAKEVEN INFLATION & REAL YIELDS" sub="TIPS · Nominal vs Real rates · Inflation expectations" />
      <div className="si-overview-row-full">
        <BreakevenInflationPanel />
      </div>

      {/* ── 5: ECONOMIC CALENDAR ─────────────────────────────────── */}
      <SectionLabel label="ECONOMIC CALENDAR" sub="Upcoming data releases · Consensus estimates" />
      <div className="si-overview-row-full">
        <EconCalendarPanel style={{ minHeight: 540 }} />
      </div>

      {/* ── 6: NEWS ──────────────────────────────────────────────── */}
      <SectionLabel label="RATES NEWS" sub="Fed watch · Treasury · Central bank commentary" />
      <div className="si-overview-row-full">
        <MarketNewsTape style={{ minHeight: 240 }} />
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}
