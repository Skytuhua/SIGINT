"use client";

import React from "react";
import { MiniSparkline } from "./shared/MiniSparkline";

interface CryptoRow {
  rank: number;
  sym: string;
  name: string;
  price: string;
  numPrice: number;
  chg1d: number;
  chg7d: number;
  mcapB: number;
  dominance: number;
  vol24hB: number;
  hist: number[];
  category: string;
}

const CRYPTO: CryptoRow[] = [
  { rank:1,  sym:"BTC",  name:"Bitcoin",       price:"$67,420",  numPrice:67420,  chg1d: 2.34, chg7d: 4.8,  mcapB:1320, dominance:52.4, vol24hB:28.2, hist:[62000,63500,65000,64200,66000,67000,67420], category:"L1" },
  { rank:2,  sym:"ETH",  name:"Ethereum",      price:"$3,521",   numPrice:3521,   chg1d: 1.12, chg7d: 3.2,  mcapB:423,  dominance:16.8, vol24hB:14.1, hist:[3300,3380,3420,3400,3470,3510,3521], category:"L1" },
  { rank:3,  sym:"BNB",  name:"BNB",           price:"$581.30",  numPrice:581,    chg1d: 0.54, chg7d: 2.1,  mcapB:89,   dominance: 3.5, vol24hB: 1.8, hist:[565,568,572,575,578,580,581], category:"Exchange" },
  { rank:4,  sym:"SOL",  name:"Solana",        price:"$182.44",  numPrice:182,    chg1d:-0.87, chg7d:-1.4,  mcapB:82,   dominance: 3.3, vol24hB: 3.2, hist:[195,191,188,185,184,183,182], category:"L1" },
  { rank:5,  sym:"XRP",  name:"XRP",           price:"$0.631",   numPrice:0.631,  chg1d: 0.42, chg7d: 1.8,  mcapB:35,   dominance: 1.4, vol24hB: 1.2, hist:[0.61,0.62,0.625,0.628,0.630,0.631,0.631], category:"Payment" },
  { rank:6,  sym:"USDC", name:"USD Coin",      price:"$1.000",   numPrice:1.000,  chg1d: 0.01, chg7d: 0.0,  mcapB:33,   dominance: 1.3, vol24hB: 5.8, hist:[1,1,1,1,1,1,1], category:"Stablecoin" },
  { rank:7,  sym:"ADA",  name:"Cardano",       price:"$0.628",   numPrice:0.628,  chg1d: 1.14, chg7d: 2.4,  mcapB:22,   dominance: 0.9, vol24hB: 0.6, hist:[0.58,0.59,0.60,0.61,0.62,0.625,0.628], category:"L1" },
  { rank:8,  sym:"AVAX", name:"Avalanche",     price:"$42.18",   numPrice:42.18,  chg1d: 2.81, chg7d: 5.2,  mcapB:17,   dominance: 0.7, vol24hB: 0.8, hist:[38,39,40,41,41.5,42,42.18], category:"L1" },
  { rank:9,  sym:"DOGE", name:"Dogecoin",      price:"$0.186",   numPrice:0.186,  chg1d:-1.21, chg7d:-2.8,  mcapB:27,   dominance: 1.1, vol24hB: 1.1, hist:[0.198,0.195,0.192,0.190,0.188,0.187,0.186], category:"Meme" },
  { rank:10, sym:"DOT",  name:"Polkadot",      price:"$9.82",    numPrice:9.82,   chg1d: 0.62, chg7d: 1.1,  mcapB:13,   dominance: 0.5, vol24hB: 0.3, hist:[9.4,9.5,9.6,9.7,9.75,9.80,9.82], category:"L0" },
  { rank:11, sym:"LINK", name:"Chainlink",     price:"$18.44",   numPrice:18.44,  chg1d: 1.88, chg7d: 4.2,  mcapB:11,   dominance: 0.4, vol24hB: 0.5, hist:[17.2,17.5,17.8,18.0,18.2,18.35,18.44], category:"Oracle" },
  { rank:12, sym:"MATIC",name:"Polygon",       price:"$1.024",   numPrice:1.024,  chg1d: 0.94, chg7d: 2.8,  mcapB:10,   dominance: 0.4, vol24hB: 0.4, hist:[0.96,0.97,0.985,0.995,1.005,1.018,1.024], category:"L2" },
  { rank:13, sym:"UNI",  name:"Uniswap",       price:"$11.82",   numPrice:11.82,  chg1d: 1.42, chg7d: 3.4,  mcapB: 9,   dominance: 0.3, vol24hB: 0.4, hist:[11.0,11.2,11.4,11.55,11.7,11.78,11.82], category:"DeFi" },
  { rank:14, sym:"ATOM", name:"Cosmos",        price:"$10.14",   numPrice:10.14,  chg1d:-0.44, chg7d:-0.8,  mcapB: 4,   dominance: 0.1, vol24hB: 0.2, hist:[10.5,10.4,10.3,10.25,10.2,10.15,10.14], category:"L0" },
  { rank:15, sym:"OP",   name:"Optimism",      price:"$3.42",    numPrice:3.42,   chg1d: 3.14, chg7d: 6.8,  mcapB: 4,   dominance: 0.1, vol24hB: 0.3, hist:[3.08,3.14,3.20,3.28,3.34,3.40,3.42], category:"L2" },
];

const CAT_COLOR: Record<string, string> = {
  L1: "#89e5ff", L2: "#6ee7b7", L0: "#c4b5fd", DeFi: "#fbbf24",
  Exchange: "#f97316", Oracle: "#34d399", Payment: "#60a5fa",
  Stablecoin: "var(--wv-text-muted)", Meme: "#fb7185",
};

interface Props {
  style?: React.CSSProperties;
  onTickerClick?: (sym: string) => void;
}

export default function CryptoMarketPanel({ style, onTickerClick }: Props) {
  const totalMcap = CRYPTO.reduce((s, c) => s + c.mcapB, 0);
  const btcDom = ((CRYPTO[0].mcapB / totalMcap) * 100).toFixed(1);

  return (
    <div className="wv-market-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">Crypto Market</span>
        <span style={{ fontSize: 9, color: "var(--wv-text-muted)" }}>
          Total: <span style={{ color: "var(--wv-text)" }}>${totalMcap.toFixed(0)}B</span>
          &nbsp;· BTC Dom: <span style={{ color: "#ffab40" }}>{btcDom}%</span>
        </span>
        <span className="wv-market-panel-badge is-static">STATIC</span>
      </div>
      <div className="wv-market-panel-body" style={{ padding: 0 }}>
        <div className="wv-crypto-mkt-header">
          <span>#</span><span>SYM</span><span>NAME</span>
          <span style={{ textAlign: "right" }}>PRICE</span>
          <span style={{ textAlign: "right" }}>1D%</span>
          <span style={{ textAlign: "right" }}>7D%</span>
          <span style={{ textAlign: "right" }}>MCAP</span>
          <span style={{ textAlign: "right" }}>DOM</span>
          <span style={{ textAlign: "right" }}>VOL 24H</span>
          <span>7D CHART</span>
        </div>
        {CRYPTO.map((c) => (
          <div
            key={c.sym}
            className="wv-crypto-mkt-row"
            onClick={() => onTickerClick?.(c.sym)}
            style={{ cursor: onTickerClick ? "pointer" : "default" }}
          >
            <span style={{ color: "var(--wv-text-muted)", fontSize: 9 }}>{c.rank}</span>
            <span style={{ color: CAT_COLOR[c.category] ?? "#89e5ff", fontWeight: 700 }}>{c.sym}</span>
            <span style={{ color: "var(--wv-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 9.5 }}>{c.name}</span>
            <span style={{ textAlign: "right", fontWeight: 600, color: "var(--wv-text)" }}>{c.price}</span>
            <span style={{ textAlign: "right", color: c.chg1d >= 0 ? "#36b37e" : "#ff5a5f" }}>
              {c.chg1d >= 0 ? "+" : ""}{c.chg1d.toFixed(2)}%
            </span>
            <span style={{ textAlign: "right", color: c.chg7d >= 0 ? "#36b37e" : "#ff5a5f" }}>
              {c.chg7d >= 0 ? "+" : ""}{c.chg7d.toFixed(1)}%
            </span>
            <span style={{ textAlign: "right", color: "var(--wv-text)" }}>
              {c.mcapB >= 100 ? `$${(c.mcapB/1000).toFixed(2)}T` : `$${c.mcapB}B`}
            </span>
            <span style={{ textAlign: "right", color: "var(--wv-text-muted)", fontSize: 9 }}>{c.dominance.toFixed(1)}%</span>
            <span style={{ textAlign: "right", color: "var(--wv-text-muted)", fontSize: 9 }}>${c.vol24hB.toFixed(1)}B</span>
            <span style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
              <MiniSparkline prices={c.hist} up={c.chg7d >= 0} width={44} height={14} />
            </span>
          </div>
        ))}
      </div>
      <div className="wv-market-panel-footer">CoinGecko · CoinMarketCap · placeholder data</div>
    </div>
  );
}
