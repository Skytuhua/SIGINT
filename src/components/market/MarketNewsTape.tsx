"use client";

import React, { useMemo } from "react";
import { useMarketData } from "../../hooks/useMarketData";
import type { NewsResponse, NewsHeadline } from "../../lib/server/news/providers/marketTypes";

const STATIC_HEADLINES: NewsHeadline[] = [
  { category: "MARKETS", categoryColor: "#89e5ff", ticker: "SPY", headline: "S&P 500 hits fresh record as tech rally extends into second week", ts: "14:32" },
  { category: "EARNINGS", categoryColor: "#fbbf24", ticker: "NVDA", headline: "Nvidia beats Q4 estimates, data center revenue surges 409% YoY", ts: "14:28" },
  { category: "MACRO", categoryColor: "#c4b5fd", headline: "Fed holds rates steady, signals potential cut in June meeting", ts: "14:15" },
  { category: "TECH", categoryColor: "#6ee7b7", ticker: "AAPL", headline: "Apple unveils new AI features for iPhone, shares rally 3%", ts: "14:02" },
  { category: "CRYPTO", categoryColor: "#f97316", ticker: "BTC", headline: "Bitcoin surpasses $67,000 amid spot ETF inflows topping $1.2B weekly", ts: "13:55" },
  { category: "COMMODITIES", categoryColor: "#34d399", headline: "Gold climbs to $2,340/oz on safe-haven demand, central bank buying", ts: "13:48" },
  { category: "EARNINGS", categoryColor: "#fbbf24", ticker: "MSFT", headline: "Microsoft cloud revenue tops $33.7B, Azure growth accelerates to 31%", ts: "13:41" },
  { category: "FX", categoryColor: "#60a5fa", headline: "Dollar index slips below 104 as ECB signals rate divergence", ts: "13:35" },
  { category: "MARKETS", categoryColor: "#89e5ff", ticker: "TSLA", headline: "Tesla shares jump 8% on better-than-expected delivery numbers", ts: "13:22" },
  { category: "ENERGY", categoryColor: "#fb7185", headline: "Crude oil rises to $78/bbl on OPEC+ production cut extension", ts: "13:15" },
  { category: "MACRO", categoryColor: "#c4b5fd", headline: "US jobs report: 275K added in February, unemployment ticks to 3.9%", ts: "13:08" },
  { category: "EARNINGS", categoryColor: "#fbbf24", ticker: "META", headline: "Meta platforms beats on revenue, announces $50B buyback program", ts: "12:55" },
  { category: "MARKETS", categoryColor: "#89e5ff", ticker: "AMD", headline: "AMD gains 5% as AI chip orders exceed $3.5B annual run rate", ts: "12:48" },
  { category: "CRYPTO", categoryColor: "#f97316", ticker: "ETH", headline: "Ethereum approaches $3,500 ahead of Dencun upgrade activation", ts: "12:40" },
  { category: "COMMODITIES", categoryColor: "#34d399", headline: "Copper futures hit 14-month high on China stimulus expectations", ts: "12:32" },
  { category: "TECH", categoryColor: "#6ee7b7", ticker: "GOOGL", headline: "Alphabet shares rise on Gemini AI integration across Google products", ts: "12:25" },
  { category: "MACRO", categoryColor: "#c4b5fd", headline: "US CPI comes in at 3.2% YoY, core inflation eases for fifth month", ts: "12:18" },
  { category: "FX", categoryColor: "#60a5fa", headline: "Japanese yen weakens past 150/$ as BOJ maintains ultra-loose policy", ts: "12:10" },
  { category: "MARKETS", categoryColor: "#89e5ff", ticker: "AMZN", headline: "Amazon added to Dow Jones Industrial Average, replaces Walgreens", ts: "12:02" },
  { category: "ENERGY", categoryColor: "#fb7185", headline: "Natural gas plunges 8% on warmer weather forecasts, storage surplus", ts: "11:55" },
];

const EMPTY: NewsResponse = { headlines: STATIC_HEADLINES, degraded: true };

interface Props {
  style?: React.CSSProperties;
}

export default function MarketNewsTape({ style }: Props) {
  const { data, isLive } = useMarketData<NewsResponse>("/api/market/news?limit=20", 120_000, EMPTY);
  const headlines = useMemo(() => {
    const h = data.headlines;
    return (h && h.length > 0) ? h : STATIC_HEADLINES;
  }, [data.headlines]);

  return (
    <div className="wv-market-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">Market Tape</span>
        <span style={{ fontSize: 9, color: "var(--wv-text-muted)", letterSpacing: "0.04em" }}>
          HEADLINES · UTC
        </span>
        <span className={`wv-market-panel-badge ${isLive ? "is-live" : "is-static"}`}>
          {isLive ? "LIVE" : "STATIC"}
        </span>
      </div>
      <div className="wv-market-panel-body" style={{ padding: 0, overflowY: "auto" }}>
        {headlines.map((item: NewsHeadline, i: number) => (
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
            <div className="wv-market-tape-headline">
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "inherit", textDecoration: "none" }}
                >
                  {item.headline}
                </a>
              ) : (
                item.headline
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="wv-market-panel-footer">
        {isLive ? "Yahoo Finance RSS · 2min refresh" : "Yahoo Finance RSS · static data"}
      </div>
    </div>
  );
}
