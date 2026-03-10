"use client";

import React from "react";
import TradingViewWidget from "./shared/TradingViewWidget";

interface Props {
  onTickerClick?: (sym: string) => void;
}

const SYMBOLS = [
  { proName: "AMEX:SPY", title: "S&P 500" },
  { proName: "NASDAQ:QQQ", title: "NASDAQ" },
  { proName: "AMEX:IWM", title: "RUSSELL" },
  { proName: "TVC:VIX", title: "VIX" },
  { proName: "TVC:DXY", title: "DXY" },
  { proName: "TVC:US10Y", title: "US 10Y" },
  { proName: "COMEX:GC1!", title: "GOLD" },
  { proName: "NYMEX:CL1!", title: "CRUDE" },
  { proName: "BITSTAMP:BTCUSD", title: "BITCOIN" },
  { proName: "BITSTAMP:ETHUSD", title: "ETHEREUM" },
];

export default function MarketSummaryStrip({ onTickerClick }: Props) {
  return (
    <div className="wv-summary-strip" style={{ padding: 0, overflow: "hidden" }}>
      <TradingViewWidget
        scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js"
        config={{
          symbols: SYMBOLS,
          showSymbolLogo: true,
          displayMode: "adaptive",
          largeChartUrl: "",
        }}
        height={46}
        width="100%"
        style={{ margin: 0 }}
      />
    </div>
  );
}
