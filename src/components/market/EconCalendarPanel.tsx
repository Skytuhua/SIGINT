"use client";

import React from "react";
import TradingViewWidget from "./shared/TradingViewWidget";

interface Props {
  style?: React.CSSProperties;
}

export default function EconCalendarPanel({ style }: Props) {
  return (
    <div className="si-market-panel" style={style}>
      <div className="si-market-panel-header">
        <span className="si-market-panel-title">Economic Calendar</span>
        <span className="si-market-panel-badge is-live">LIVE</span>
      </div>
      <div className="si-market-panel-body" style={{ padding: 0, overflow: "hidden" }}>
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
          style={{ minHeight: 500 }}
        />
      </div>
      <div className="si-market-panel-footer">TradingView · Economic Calendar · real-time</div>
    </div>
  );
}
