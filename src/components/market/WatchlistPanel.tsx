"use client";

import React from "react";
import { MiniSparkline } from "./shared/MiniSparkline";

interface WatchItem {
  sym: string;
  name: string;
  price: string;
  chg: number;
  spark: number[];
}

const WATCHLIST: WatchItem[] = [
  { sym: "BTC",   name: "Bitcoin",      price: "$67,842",  chg:  2.34, spark: [61000,63500,62000,65000,64200,67200,67842] },
  { sym: "ETH",   name: "Ethereum",     price: "$3,522",   chg:  1.12, spark: [3300,3380,3290,3450,3410,3490,3522] },
  { sym: "SOL",   name: "Solana",       price: "$182.44",  chg: -0.87, spark: [195,190,188,185,184,183,182] },
  { sym: "BNB",   name: "BNB",          price: "$581.30",  chg:  0.54, spark: [565,570,572,576,578,580,581] },
  { sym: "SPY",   name: "S&P 500 ETF",  price: "$528.61",  chg:  0.41, spark: [524,525,526,526,527,528,529] },
  { sym: "QQQ",   name: "Nasdaq ETF",   price: "$452.19",  chg:  0.68, spark: [446,447,448,449,450,451,452] },
  { sym: "GC=F",  name: "Gold",         price: "$2,331",   chg:  0.22, spark: [2310,2315,2318,2325,2328,2330,2331] },
  { sym: "CL=F",  name: "Crude Oil",    price: "$79.85",   chg: -1.03, spark: [82,81.5,81,80.5,80.2,80,79.85] },
  { sym: "DXY",   name: "USD Index",    price: "104.23",   chg:  0.09, spark: [103.8,103.9,104,104.1,104.2,104.2,104.23] },
  { sym: "VIX",   name: "Volatility",   price: "14.82",    chg: -3.11, spark: [16.5,16,15.5,15.2,15,14.9,14.82] },
];

interface Props {
  onTickerClick?: (sym: string) => void;
  style?: React.CSSProperties;
}

export default function WatchlistPanel({ onTickerClick, style }: Props = {}) {
  return (
    <div className="wv-market-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">Watchlist</span>
        <span className="wv-market-panel-badge is-static">STATIC</span>
      </div>

      <div className="wv-market-panel-body">
        {WATCHLIST.map((item) => {
          const up = item.chg >= 0;
          const chgClass = item.chg > 0 ? "is-up" : item.chg < 0 ? "is-down" : "is-flat";
          const sign = item.chg > 0 ? "+" : "";
          return (
            <div key={item.sym} className="wv-market-watchlist-row" style={{ cursor: onTickerClick ? "pointer" : "default" }} onClick={() => onTickerClick?.(item.sym)}>
              <span className="wv-market-watchlist-sym">{item.sym}</span>
              <span className="wv-market-watchlist-price">{item.price}</span>
              <MiniSparkline prices={item.spark} up={up} />
              <span className={`wv-market-watchlist-chg ${chgClass}`}>
                {sign}{item.chg.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>

      <div className="wv-market-panel-footer">CoinGecko · Yahoo Finance · placeholder data</div>
    </div>
  );
}
