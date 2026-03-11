"use client";

import FxMatrixPanel from "../FxMatrixPanel";
import TopMoversPanel from "../TopMoversPanel";
import FxCarryPanel from "../FxCarryPanel";
import EmCurrenciesPanel from "../EmCurrenciesPanel";
import CorrelationMatrixPanel from "../CorrelationMatrixPanel";
import MarketNewsTape from "../MarketNewsTape";
import SectionLabel from "../shared/SectionLabel";
import CurrencyConverterPanel from "../CurrencyConverterPanel";
import FxHeatmapPanel from "../FxHeatmapPanel";

interface Props {
  onTickerClick?: (sym: string) => void;
}

export default function MarketFxTab({ onTickerClick }: Props) {
  return (
    <div className="si-overview-scroll">

      {/* ── 1: CROSS-RATE MATRIX ─────────────────────────────────── */}
      <SectionLabel label="CROSS-RATE MATRIX" sub="Major pairs · G10 spot rates" />
      <div className="si-overview-row-2col">
        <FxMatrixPanel style={{ minHeight: 280 }} />
        <TopMoversPanel filter="fx" style={{ minHeight: 280 }} onTickerClick={onTickerClick} />
      </div>

      {/* ── CURRENCY CONVERTER & HEAT MAP ────────────────────────── */}
      <SectionLabel label="CURRENCY TOOLS" sub="Convert between currencies · Forex heat map" />
      <div className="si-overview-row-2col">
        <CurrencyConverterPanel style={{ minHeight: 320 }} />
        <FxHeatmapPanel style={{ minHeight: 320 }} />
      </div>

      {/* ── 2: EM CURRENCIES ─────────────────────────────────────── */}
      <SectionLabel label="EMERGING MARKETS FX" sub="EM currencies · Spot · CB rates" />
      <div className="si-overview-row-full">
        <EmCurrenciesPanel style={{ minHeight: 340 }} />
      </div>

      {/* ── 3: CARRY & CORRELATIONS ──────────────────────────────── */}
      <SectionLabel label="CARRY TRADES & CROSS-ASSET CORRELATIONS" sub="Rate differentials · Carry Sharpe · Cross-asset correlations" />
      <div className="si-overview-row-2col">
        <FxCarryPanel style={{ minHeight: 300 }} />
        <CorrelationMatrixPanel style={{ minHeight: 280 }} />
      </div>

      {/* ── 4: NEWS ──────────────────────────────────────────────── */}
      <SectionLabel label="FX NEWS" sub="Central bank commentary · Currency moves · Trade flows" />
      <div className="si-overview-row-full">
        <MarketNewsTape style={{ minHeight: 240 }} />
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}
