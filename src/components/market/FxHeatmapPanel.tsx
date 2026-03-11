"use client";

import React from "react";
import TradingViewWidget from "./shared/TradingViewWidget";

interface Props {
  style?: React.CSSProperties;
}

export default function FxHeatmapPanel({ style }: Props) {
  return (
    <div className="si-market-panel" style={style}>
      <div className="si-market-panel-header">
        <span className="si-market-panel-title">Forex Heat Map</span>
        <span className="si-market-panel-badge is-live">LIVE</span>
      </div>
      <div className="si-market-panel-body" style={{ padding: 0, overflow: "hidden" }}>
        <TradingViewWidget
          scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-forex-heat-map.js"
          config={{
            width: "100%",
            height: "100%",
            currencies: ["EUR", "USD", "JPY", "GBP", "CHF", "AUD", "CAD", "NZD"],
          }}
          height="100%"
          width="100%"
          style={{ minHeight: 300 }}
        />
      </div>
      <div className="si-market-panel-footer">TradingView · Forex Heat Map · real-time</div>
    </div>
  );
}
