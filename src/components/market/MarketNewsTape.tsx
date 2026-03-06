"use client";

import React from "react";

interface NewsTapeItem {
  category: string;
  categoryColor: string;
  ticker?: string;
  headline: string;
  ts: string;
}

const HEADLINES: NewsTapeItem[] = [
  { category: "MACRO",     categoryColor: "#89e5ff", ticker: "DXY",  headline: "Fed's Powell reiterates 'no rush' to cut rates; markets push back first cut to July", ts: "14:32" },
  { category: "EQUITIES",  categoryColor: "#36b37e", ticker: "NVDA", headline: "NVIDIA data center revenue surges 279% YoY; raises Q1 guidance well above consensus", ts: "14:18" },
  { category: "ENERGY",    categoryColor: "#ffab40", ticker: "WTI",  headline: "EIA crude inventories +3.5M bbls vs -1.2M expected; WTI drops below $80", ts: "14:05" },
  { category: "RATES",     categoryColor: "#89e5ff", ticker: "10Y",  headline: "US 10Y Treasury auction demand strong; yield slips 2bp to 4.28%", ts: "13:58" },
  { category: "FX",        categoryColor: "#b9cde0", ticker: "USD",  headline: "Dollar extends gains vs EM basket on risk-off positioning; DXY at 104.23", ts: "13:45" },
  { category: "EARNINGS",  categoryColor: "#36b37e", ticker: "AAPL", headline: "Apple Q1 EPS $2.40 vs est $2.21; iPhone revenue beats but China sales below forecast", ts: "13:30" },
  { category: "GEOPOLITICAL", categoryColor: "#ff5a5f", headline: "Red Sea shipping disruptions persist; Maersk extends Cape of Good Hope routing", ts: "13:12" },
  { category: "CRYPTO",    categoryColor: "#76ff03", ticker: "BTC",  headline: "Bitcoin ETF net inflows reach $12B cumulative; BTC consolidates above $67K", ts: "13:01" },
  { category: "CREDIT",    categoryColor: "#ffab40", headline: "IG credit spreads widen 4bp on rate uncertainty; HY market quiet; CDX IG at 58bp", ts: "12:47" },
  { category: "EQUITIES",  categoryColor: "#36b37e", ticker: "AMD",  headline: "AMD raises AI accelerator shipment forecast; competing directly with Nvidia MI300X", ts: "12:35" },
  { category: "MACRO",     categoryColor: "#89e5ff", headline: "ISM Services PMI 52.6 vs 53.0 est; prices paid sub-index hottest in 12 months", ts: "12:20" },
  { category: "FX",        categoryColor: "#b9cde0", ticker: "JPY",  headline: "BOJ board member signals spring wage data may justify rate path review", ts: "12:08" },
  { category: "ENERGY",    categoryColor: "#ffab40", ticker: "NG",   headline: "Natural gas futures spike 2.1% on cold weather forecast; storage draw ahead of schedule", ts: "11:55" },
  { category: "RATES",     categoryColor: "#89e5ff", ticker: "2Y",   headline: "2Y Treasury yield falls 3bp; market prices 75bp of cuts in 2025 vs 50bp last week", ts: "11:40" },
  { category: "EQUITIES",  categoryColor: "#36b37e", ticker: "XLK",  headline: "Tech sector leads broader market higher; semis index up 2.1% on AI spend cycle narrative", ts: "11:28" },
  { category: "MACRO",     categoryColor: "#89e5ff", ticker: "CPI",  headline: "Cleveland Fed CPI Nowcast: March +0.31% MoM; core +0.29%; on track for annual 3.1%", ts: "11:15" },
  { category: "COMMODITIES", categoryColor: "#ffab40", ticker: "GC", headline: "Gold steady near $2,330 as real yields fall; central bank demand continues at record pace", ts: "10:52" },
  { category: "CREDIT",    categoryColor: "#ffab40", ticker: "HYG", headline: "High-yield ETF outflows $240M; spreads widen 8bp; CCC tier underperforms", ts: "10:38" },
  { category: "EARNINGS",  categoryColor: "#ff5a5f", ticker: "META", headline: "Meta CFO guides capex $35-40B for 2025; AI infra investment timeline extended", ts: "10:20" },
  { category: "GEOPOLITICAL", categoryColor: "#ff5a5f", ticker: "XLE", headline: "OPEC+ monitoring compliance; Libya supply restoration threatens Q2 production targets", ts: "10:05" },
];

interface Props {
  style?: React.CSSProperties;
}

export default function MarketNewsTape({ style }: Props) {
  return (
    <div className="wv-market-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">Market Tape</span>
        <span style={{ fontSize: 9, color: "var(--wv-text-muted)", letterSpacing: "0.04em" }}>INTRADAY HEADLINES · UTC</span>
      </div>
      <div className="wv-market-panel-body" style={{ padding: 0, overflowY: "auto" }}>
        {HEADLINES.map((item, i) => (
          <div key={i} className="wv-market-tape-item">
            <div className="wv-market-tape-meta">
              <span className="wv-market-tape-category" style={{ color: item.categoryColor }}>
                [{item.category}]
              </span>
              {item.ticker && (
                <span className="wv-market-tape-ticker">{item.ticker}</span>
              )}
              <span className="wv-market-tape-ts">{item.ts}</span>
            </div>
            <div className="wv-market-tape-headline">{item.headline}</div>
          </div>
        ))}
      </div>
      <div className="wv-market-panel-footer">Reuters · Bloomberg · AP · placeholder data</div>
    </div>
  );
}
