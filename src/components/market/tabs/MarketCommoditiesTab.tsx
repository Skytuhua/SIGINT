"use client";

import CommoditiesBoard from "../CommoditiesBoard";
import CommodityStoragePanel from "../CommodityStoragePanel";
import ShippingPanel from "../ShippingPanel";
import MarketNewsTape from "../MarketNewsTape";
import SectionLabel from "../shared/SectionLabel";

export default function MarketCommoditiesTab() {
  return (
    <div className="wv-overview-scroll">

      {/* ── SECTION 1: PRICES ───────────────────────────────────── */}
      <SectionLabel label="COMMODITY PRICES" sub="Energy · Metals · Agriculture · Softs" />
      <div className="wv-overview-row-full">
        <CommoditiesBoard style={{ minHeight: 260 }} />
      </div>

      {/* ── SECTION 2: STORAGE & SHIPPING ───────────────────────── */}
      <SectionLabel label="INVENTORIES & FREIGHT" sub="Storage vs 5yr avg · Baltic indices · Shipping rates" />
      <div className="wv-overview-row-2col">
        <CommodityStoragePanel style={{ minHeight: 340 }} />
        <ShippingPanel style={{ minHeight: 340 }} />
      </div>

      {/* ── SECTION 3: NEWS ─────────────────────────────────────── */}
      <SectionLabel label="COMMODITIES NEWS" sub="Supply disruptions · OPEC · Weather · Macro demand" />
      <div className="wv-overview-row-full">
        <MarketNewsTape style={{ minHeight: 240 }} />
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}
