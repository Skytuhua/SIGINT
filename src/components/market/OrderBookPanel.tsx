"use client";

import React from "react";
import TradingViewWidget from "./shared/TradingViewWidget";

interface Props {
  style?: React.CSSProperties;
}

export default function OrderBookPanel({ style }: Props = {}) {
  return (
    <div className="si-market-panel" style={style}>
      <div className="si-market-panel-header">
        <span className="si-market-panel-title">Market Depth — BTC/USD</span>
        <span className="si-market-panel-badge is-live">LIVE</span>
      </div>
      <div className="si-market-panel-body" style={{ padding: 0, overflow: "hidden" }}>
        <TradingViewWidget
          scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js"
          config={{
            symbols: [
              ["Bitcoin", "BINANCE:BTCUSDT|1D"],
              ["Ethereum", "BINANCE:ETHUSDT|1D"],
              ["Solana", "BINANCE:SOLUSDT|1D"],
            ],
            chartOnly: false,
            width: "100%",
            height: "100%",
            showVolume: true,
            showMA: true,
            hideDateRanges: false,
            scalePosition: "right",
            scaleMode: "Normal",
            fontFamily: "monospace",
            gridLineColor: "rgba(255, 255, 255, 0.04)",
            fontColor: "rgba(255, 255, 255, 0.6)",
            lineWidth: 2,
            lineType: 0,
            dateRanges: ["1d|1", "1m|30", "3m|60", "12m|1D", "60m|1W", "all|1M"],
          }}
          height="100%"
          width="100%"
          style={{ minHeight: 280 }}
        />
      </div>
      <div className="si-market-panel-footer">TradingView · Symbol Overview · real-time</div>
    </div>
  );
}
