"use client";

import CommoditiesBoard from "../CommoditiesBoard";
import CommodityStoragePanel from "../CommodityStoragePanel";
import ShippingPanel from "../ShippingPanel";
import MarketNewsTape from "../MarketNewsTape";
import TradingViewWidget from "../shared/TradingViewWidget";
import SectionLabel from "../shared/SectionLabel";

export default function MarketCommoditiesTab() {
  return (
    <div className="si-overview-scroll">

      {/* ── SECTION 1: PRICES ───────────────────────────────────── */}
      <SectionLabel label="COMMODITY PRICES" sub="Energy · Metals · Agriculture · Softs" />
      <div className="si-overview-row-full">
        <CommoditiesBoard style={{ minHeight: 260 }} />
      </div>

      {/* ── COMMODITY CHART ─────────────────────────────────────── */}
      <SectionLabel label="COMMODITY CHART" sub="Live price chart · Change symbol with search" />
      <div className="si-overview-row-full">
        <div className="si-market-panel" style={{ minHeight: 380 }}>
          <div className="si-market-panel-header">
            <span className="si-market-panel-title">Commodity Chart — WTI Crude</span>
            <span className="si-market-panel-badge is-live">LIVE</span>
          </div>
          <div className="si-market-panel-body" style={{ padding: 0, overflow: "hidden" }}>
            <TradingViewWidget
              scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"
              config={{
                symbol: "TVC:USOIL",
                interval: "D",
                style: "1",
                allow_symbol_change: true,
                hide_top_toolbar: false,
                hide_side_toolbar: false,
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

      {/* ── SECTION 2: STORAGE & SHIPPING ───────────────────────── */}
      <SectionLabel label="INVENTORIES & FREIGHT" sub="Storage vs 5yr avg · Baltic indices · Shipping rates" />
      <div className="si-overview-row-2col">
        <CommodityStoragePanel style={{ minHeight: 340 }} />
        <ShippingPanel style={{ minHeight: 340 }} />
      </div>

      {/* ── SECTION 3: NEWS ─────────────────────────────────────── */}
      <SectionLabel label="COMMODITIES NEWS" sub="Supply disruptions · OPEC · Weather · Macro demand" />
      <div className="si-overview-row-full">
        <MarketNewsTape style={{ minHeight: 240 }} />
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}
