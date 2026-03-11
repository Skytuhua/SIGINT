"use client";

import React from "react";
import TradingViewWidget from "./shared/TradingViewWidget";

interface Props {
  style?: React.CSSProperties;
}

export default function ChartPanel({ style }: Props = {}) {
  return (
    <div className="si-market-panel" style={style}>
      <div className="si-market-panel-header">
        <span className="si-market-panel-title">BTC / USD — Price Chart</span>
        <span className="si-market-panel-badge is-live">LIVE</span>
      </div>
      <div className="si-market-panel-body" style={{ padding: 0, overflow: "hidden" }}>
        <TradingViewWidget
          scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"
          config={{
            symbol: "BINANCE:BTCUSDT",
            interval: "240",
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
          style={{ minHeight: 280 }}
        />
      </div>
      <div className="si-market-panel-footer">TradingView · Advanced Chart · real-time</div>
    </div>
  );
}
