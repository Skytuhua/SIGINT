"use client";

import { useIsMobile } from "../../../hooks/useIsMobile";
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
  const isMobile = useIsMobile();

  return (
    <div className="si-overview-scroll">
      <SectionLabel label="CROSS-RATE MATRIX" sub="Major pairs  G10 spot rates" />
      <div className="si-overview-row-2col">
        <FxMatrixPanel style={{ minHeight: 280 }} />
        <TopMoversPanel filter="fx" style={{ minHeight: 280 }} onTickerClick={onTickerClick} />
      </div>

      <SectionLabel label="CURRENCY TOOLS" sub="Convert between currencies  Forex heat map" />
      <div className="si-overview-row-2col">
        <CurrencyConverterPanel style={{ minHeight: 320 }} />
        <FxHeatmapPanel style={{ minHeight: 320 }} />
      </div>

      <SectionLabel label="EMERGING MARKETS FX" sub="EM currencies  Spot  CB rates" />
      <div className="si-overview-row-full">
        <EmCurrenciesPanel style={{ minHeight: 340 }} />
      </div>

      <SectionLabel label="CARRY TRADES" sub="Rate differentials  Carry Sharpe" />
      <div className="si-overview-row-2col">
        <FxCarryPanel style={{ minHeight: 300 }} />
        {!isMobile ? <CorrelationMatrixPanel style={{ minHeight: 280 }} /> : null}
      </div>

      {isMobile ? (
        <>
          <SectionLabel label="FX NEWS" sub="Central bank commentary  Currency moves  Trade flows" />
          <div className="si-overview-row-full">
            <MarketNewsTape style={{ minHeight: 240 }} />
          </div>
        </>
      ) : (
        <>
          <SectionLabel label="FX NEWS" sub="Central bank commentary  Currency moves  Trade flows" />
          <div className="si-overview-row-full">
            <MarketNewsTape style={{ minHeight: 240 }} />
          </div>
        </>
      )}

      <div style={{ height: 24 }} />
    </div>
  );
}
