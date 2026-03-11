"use client";

import React from "react";
import TradingViewWidget from "./shared/TradingViewWidget";
import Term from "./shared/Term";

interface Props {
  style?: React.CSSProperties;
}

export default function FxMatrixPanel({ style }: Props) {
  return (
    <div className="si-market-panel" style={style}>
      <div className="si-market-panel-header">
        <span className="si-market-panel-title">FX <Term id="CROSS_RATE">Cross-Rate</Term> Matrix</span>
        <span style={{ fontSize: 9, color: "var(--si-text-muted)", letterSpacing: "0.04em" }}>
          LIVE RATES
        </span>
        <span className="si-market-panel-badge is-live">LIVE</span>
      </div>
      <div className="si-market-panel-body" style={{ padding: 0, overflow: "hidden" }}>
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
      <div className="si-market-panel-footer">TradingView · FX Cross Rates · real-time</div>
    </div>
  );
}
