"use client";

import React from "react";

interface OBLevel {
  price: number;
  size: number;
  depthPct: number; // 0–1 relative to max size in side
}

const ASKS: OBLevel[] = [
  { price: 67985, size: 0.842, depthPct: 0.35 },
  { price: 67960, size: 1.120, depthPct: 0.47 },
  { price: 67940, size: 0.521, depthPct: 0.22 },
  { price: 67920, size: 2.341, depthPct: 0.98 },
  { price: 67905, size: 0.788, depthPct: 0.33 },
  { price: 67890, size: 1.654, depthPct: 0.69 },
  { price: 67875, size: 0.399, depthPct: 0.17 },
  { price: 67860, size: 2.391, depthPct: 1.00 },
  { price: 67850, size: 0.901, depthPct: 0.38 },
  { price: 67843, size: 1.234, depthPct: 0.52 },
];

const BIDS: OBLevel[] = [
  { price: 67840, size: 1.556, depthPct: 0.65 },
  { price: 67825, size: 2.391, depthPct: 1.00 },
  { price: 67810, size: 0.722, depthPct: 0.30 },
  { price: 67795, size: 1.883, depthPct: 0.79 },
  { price: 67780, size: 0.441, depthPct: 0.18 },
  { price: 67762, size: 1.201, depthPct: 0.50 },
  { price: 67745, size: 0.665, depthPct: 0.28 },
  { price: 67730, size: 2.108, depthPct: 0.88 },
  { price: 67715, size: 0.343, depthPct: 0.14 },
  { price: 67698, size: 1.774, depthPct: 0.74 },
];

const SPREAD = (ASKS[ASKS.length - 1].price - BIDS[0].price).toFixed(2);
const SPREAD_PCT = ((ASKS[ASKS.length - 1].price - BIDS[0].price) / BIDS[0].price * 100).toFixed(4);

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

interface Props {
  style?: React.CSSProperties;
}

export default function OrderBookPanel({ style }: Props = {}) {
  return (
    <div className="wv-market-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">Order Book</span>
        <span className="wv-market-panel-badge is-static">STATIC</span>
      </div>

      <div className="wv-market-panel-body">
        {/* column headers */}
        <div className="wv-market-ob-header">
          <span>PRICE (USD)</span>
          <span style={{ textAlign: "right" }}>SIZE (BTC)</span>
        </div>

        {/* asks — reversed so best ask is closest to spread */}
        <div className="wv-market-ob-asks">
          {[...ASKS].reverse().map((lvl) => (
            <div key={lvl.price} className="wv-market-ob-row is-ask">
              <div
                className="wv-market-ob-depth-bar"
                style={{ width: `${lvl.depthPct * 100}%` }}
              />
              <span className="wv-market-ob-price">{fmt(lvl.price)}</span>
              <span className="wv-market-ob-size">{lvl.size.toFixed(3)}</span>
            </div>
          ))}
        </div>

        {/* spread */}
        <div className="wv-market-ob-spread">
          <span>SPREAD</span>
          <span className="wv-market-ob-spread-value">${SPREAD}</span>
          <span>({SPREAD_PCT}%)</span>
        </div>

        {/* bids */}
        <div className="wv-market-ob-bids">
          {BIDS.map((lvl) => (
            <div key={lvl.price} className="wv-market-ob-row is-bid">
              <div
                className="wv-market-ob-depth-bar"
                style={{ width: `${lvl.depthPct * 100}%` }}
              />
              <span className="wv-market-ob-price">{fmt(lvl.price)}</span>
              <span className="wv-market-ob-size">{lvl.size.toFixed(3)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="wv-market-panel-footer">BTC/USD · Binance · placeholder depth</div>
    </div>
  );
}
