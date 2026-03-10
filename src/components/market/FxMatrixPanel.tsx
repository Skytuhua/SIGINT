"use client";

import React from "react";
import TradingViewWidget from "./shared/TradingViewWidget";

interface Props {
  style?: React.CSSProperties;
}

export default function FxMatrixPanel({ style }: Props) {
  return (
    <div className="wv-market-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">FX Cross-Rate Matrix</span>
        <span style={{ fontSize: 9, color: "var(--wv-text-muted)", letterSpacing: "0.04em" }}>
          LIVE RATES
        </span>
        <span className="wv-market-panel-badge is-live">LIVE</span>
      </div>
      <div className="wv-market-panel-body" style={{ padding: 0, overflow: "hidden" }}>
        <TradingViewWidget
          scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-forex-cross-rates.js"
          config={{
            width: "100%",
            height: "100%",
            currencies: ["EUR", "USD", "JPY", "GBP", "CHF", "AUD", "CAD"],
          }}
          height="100%"
          width="100%"
          style={{ minHeight: 240 }}
        />
      </div>
      <div className="wv-market-panel-footer">TradingView · FX Cross Rates · real-time</div>
    </div>
  );
}
