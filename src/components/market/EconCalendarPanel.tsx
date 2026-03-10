"use client";

import React from "react";
import TradingViewWidget from "./shared/TradingViewWidget";

interface Props {
  style?: React.CSSProperties;
}

export default function EconCalendarPanel({ style }: Props) {
  return (
    <div className="wv-market-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">Economic Calendar</span>
        <span className="wv-market-panel-badge is-live">LIVE</span>
      </div>
      <div className="wv-market-panel-body" style={{ padding: 0, overflow: "hidden" }}>
        <TradingViewWidget
          scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-events.js"
          config={{
            width: "100%",
            height: "100%",
            importanceFilter: "-1,0,1",
            countryFilter: "us,eu,gb,jp,cn,de,au,ca,ch",
          }}
          height="100%"
          width="100%"
          style={{ minHeight: 260 }}
        />
      </div>
      <div className="wv-market-panel-footer">TradingView · Economic Calendar · real-time</div>
    </div>
  );
}
