"use client";

import React from "react";
import TradingViewWidget from "./shared/TradingViewWidget";

interface Props {
  onTickerClick?: (sym: string) => void;
  style?: React.CSSProperties;
}

export default function WatchlistPanel({ style }: Props = {}) {
  return (
    <div className="si-market-panel" style={style}>
      <div className="si-market-panel-header">
        <span className="si-market-panel-title">Crypto Watchlist</span>
        <span className="si-market-panel-badge is-live">LIVE</span>
      </div>
      <div className="si-market-panel-body" style={{ padding: 0, overflow: "hidden" }}>
        <TradingViewWidget
          scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js"
          config={{
            showChart: true,
            width: "100%",
            height: "100%",
            plotLineColorGrowing: "rgba(54, 179, 126, 1)",
            plotLineColorFalling: "rgba(255, 90, 95, 1)",
            gridLineColor: "rgba(255, 255, 255, 0.04)",
            scaleFontColor: "rgba(255, 255, 255, 0.5)",
            belowLineFillColorGrowing: "rgba(54, 179, 126, 0.1)",
            belowLineFillColorFalling: "rgba(255, 90, 95, 0.1)",
            belowLineFillColorGrowingBottom: "rgba(54, 179, 126, 0)",
            belowLineFillColorFallingBottom: "rgba(255, 90, 95, 0)",
            symbolActiveColor: "rgba(54, 179, 126, 0.12)",
            tabs: [
              {
                title: "Crypto",
                symbols: [
                  { s: "BINANCE:BTCUSDT", d: "Bitcoin" },
                  { s: "BINANCE:ETHUSDT", d: "Ethereum" },
                  { s: "BINANCE:SOLUSDT", d: "Solana" },
                  { s: "BINANCE:BNBUSDT", d: "BNB" },
                  { s: "BINANCE:XRPUSDT", d: "XRP" },
                  { s: "BINANCE:ADAUSDT", d: "Cardano" },
                  { s: "BINANCE:AVAXUSDT", d: "Avalanche" },
                  { s: "BINANCE:DOGEUSDT", d: "Dogecoin" },
                  { s: "BINANCE:DOTUSDT", d: "Polkadot" },
                  { s: "BINANCE:LINKUSDT", d: "Chainlink" },
                ],
              },
              {
                title: "Indices",
                symbols: [
                  { s: "FOREXCOM:SPXUSD", d: "S&P 500" },
                  { s: "FOREXCOM:NSXUSD", d: "Nasdaq 100" },
                  { s: "INDEX:DXY", d: "USD Index" },
                  { s: "TVC:GOLD", d: "Gold" },
                  { s: "TVC:USOIL", d: "Crude Oil" },
                ],
              },
            ],
          }}
          height="100%"
          width="100%"
          style={{ minHeight: 320 }}
        />
      </div>
      <div className="si-market-panel-footer">TradingView · Market Overview · real-time</div>
    </div>
  );
}
