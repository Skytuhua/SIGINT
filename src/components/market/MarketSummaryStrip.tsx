"use client";

import React from "react";

interface StripItem {
  sym: string;
  label: string;
  price: string;
  chg: number;
  chgAbs?: string;
  sub?: string;
}

const STRIP: StripItem[] = [
  { sym: "SPY",   label: "S&P 500",   price: "482.50",    chg:  0.41, chgAbs: "+1.97",  sub: "4,682 pts" },
  { sym: "QQQ",   label: "NASDAQ",    price: "408.22",    chg:  0.68, chgAbs: "+2.76",  sub: "NDX 17,854" },
  { sym: "IWM",   label: "RUSSELL",   price: "196.78",    chg: -0.31, chgAbs: "-0.61",  sub: "RUT 1,964" },
  { sym: "VIX",   label: "VIX",       price: "14.82",     chg: -3.11, chgAbs: "-0.48",  sub: "Fear gauge" },
  { sym: "DXY",   label: "DXY",       price: "104.23",    chg:  0.09, chgAbs: "+0.09",  sub: "USD Index" },
  { sym: "TNX",   label: "US 10Y",    price: "4.318%",    chg:  1.24, chgAbs: "+5.3bp", sub: "Treasury" },
  { sym: "GC",    label: "GOLD",      price: "$2,328",    chg:  0.22, chgAbs: "+5.2",   sub: "$/oz" },
  { sym: "WTI",   label: "CRUDE",     price: "$79.42",    chg: -1.03, chgAbs: "-0.83",  sub: "WTI $/bbl" },
  { sym: "BTC",   label: "BITCOIN",   price: "$67,420",   chg:  2.34, chgAbs: "+1,545", sub: "Crypto" },
  { sym: "ETH",   label: "ETHEREUM",  price: "$3,521",    chg:  1.12, chgAbs: "+39.0",  sub: "Crypto" },
];

interface Props {
  onTickerClick?: (sym: string) => void;
}

export default function MarketSummaryStrip({ onTickerClick }: Props) {
  return (
    <div className="wv-summary-strip">
      {STRIP.map((item) => {
        const up = item.chg >= 0;
        const flat = Math.abs(item.chg) < 0.05;
        const color = flat ? "var(--wv-text-muted)" : up ? "#36b37e" : "#ff5a5f";
        const sign = item.chg > 0 ? "+" : "";
        return (
          <div
            key={item.sym}
            className="wv-summary-strip-item"
            onClick={() => onTickerClick?.(item.sym)}
            style={{ cursor: onTickerClick ? "pointer" : "default" }}
          >
            <div className="wv-summary-strip-label">{item.label}</div>
            <div className="wv-summary-strip-price">{item.price}</div>
            <div className="wv-summary-strip-chg" style={{ color }}>
              {sign}{item.chg.toFixed(2)}%
              {item.chgAbs && <span className="wv-summary-strip-abs"> ({item.chgAbs})</span>}
            </div>
            {item.sub && <div className="wv-summary-strip-sub">{item.sub}</div>}
          </div>
        );
      })}
    </div>
  );
}
