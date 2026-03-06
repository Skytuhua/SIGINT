"use client";

import React from "react";

interface InsiderTrade {
  date: string;
  sym: string;
  company: string;
  insider: string;
  role: string;
  type: "Buy" | "Sell";
  shares: string;
  value: string;
  price: string;
}

const TRADES: InsiderTrade[] = [
  { date: "Mar 4",  sym: "NVDA", company: "NVIDIA",       insider: "Jensen Huang",    role: "CEO",   type: "Sell", shares: "250K", value: "$178M", price: "$712" },
  { date: "Mar 4",  sym: "META", company: "Meta",          insider: "Mark Zuckerberg", role: "CEO",   type: "Sell", shares: "40K",  value: "$20.1M", price: "$502" },
  { date: "Mar 3",  sym: "JPM",  company: "JPMorgan",      insider: "Jamie Dimon",     role: "CEO",   type: "Buy",  shares: "50K",  value: "$9.9M", price: "$198" },
  { date: "Mar 3",  sym: "MSFT", company: "Microsoft",     insider: "Satya Nadella",   role: "CEO",   type: "Sell", shares: "55K",  value: "$20.8M", price: "$379" },
  { date: "Mar 2",  sym: "TSLA", company: "Tesla",         insider: "Elon Musk",       role: "CEO",   type: "Sell", shares: "800K", value: "$199M", price: "$248" },
  { date: "Mar 2",  sym: "AAPL", company: "Apple",         insider: "Luca Maestri",    role: "CFO",   type: "Sell", shares: "30K",  value: "$5.5M", price: "$182" },
  { date: "Mar 1",  sym: "AMZN", company: "Amazon",        insider: "Andy Jassy",      role: "CEO",   type: "Sell", shares: "62K",  value: "$11.1M", price: "$178" },
  { date: "Mar 1",  sym: "XOM",  company: "ExxonMobil",    insider: "Darren Woods",    role: "CEO",   type: "Buy",  shares: "35K",  value: "$3.9M", price: "$112" },
  { date: "Feb 29", sym: "GOOGL",company: "Alphabet",      insider: "Sundar Pichai",   role: "CEO",   type: "Sell", shares: "28K",  value: "$3.9M", price: "$140" },
  { date: "Feb 29", sym: "BAC",  company: "Bank of America",insider: "Brian Moynihan", role: "CEO",   type: "Buy",  shares: "200K", value: "$7.7M", price: "$38.7" },
  { date: "Feb 28", sym: "COP",  company: "ConocoPhillips",insider: "Ryan Lance",      role: "CEO",   type: "Buy",  shares: "40K",  value: "$4.7M", price: "$118" },
  { date: "Feb 28", sym: "LLY",  company: "Eli Lilly",     insider: "David Ricks",     role: "CEO",   type: "Sell", shares: "10K",  value: "$7.5M", price: "$754" },
];

interface Props {
  style?: React.CSSProperties;
  onTickerClick?: (sym: string) => void;
}

export default function InsiderFlowPanel({ style, onTickerClick }: Props) {
  const netBuys = TRADES.filter((t) => t.type === "Buy").length;
  const netSells = TRADES.filter((t) => t.type === "Sell").length;

  return (
    <div className="wv-market-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">Insider Transactions</span>
        <span style={{ fontSize: 9, color: "#36b37e" }}>{netBuys}B</span>
        <span style={{ fontSize: 9, color: "var(--wv-text-muted)" }}> / </span>
        <span style={{ fontSize: 9, color: "#ff5a5f" }}>{netSells}S</span>
        <span className="wv-market-panel-badge is-static">STATIC</span>
      </div>
      <div className="wv-market-panel-body" style={{ padding: 0 }}>
        <div className="wv-insider-header">
          <span>DATE</span><span>SYM</span><span>INSIDER</span><span>ROLE</span>
          <span style={{ textAlign: "center" }}>TYPE</span>
          <span style={{ textAlign: "right" }}>SHARES</span><span style={{ textAlign: "right" }}>VALUE</span>
        </div>
        {TRADES.map((t, i) => (
          <div key={i} className="wv-insider-row" onClick={() => onTickerClick?.(t.sym)} style={{ cursor: onTickerClick ? "pointer" : "default" }}>
            <span style={{ color: "var(--wv-text-muted)" }}>{t.date}</span>
            <span style={{ color: "#89e5ff", fontWeight: 700 }}>{t.sym}</span>
            <span style={{ color: "var(--wv-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.insider}</span>
            <span style={{ color: "var(--wv-text-muted)" }}>{t.role}</span>
            <span style={{ textAlign: "center" }}>
              <span className={`wv-insider-badge ${t.type === "Buy" ? "buy" : "sell"}`}>{t.type}</span>
            </span>
            <span style={{ textAlign: "right", color: "var(--wv-text)" }}>{t.shares}</span>
            <span style={{ textAlign: "right", fontWeight: 600, color: t.type === "Buy" ? "#36b37e" : "#ff5a5f" }}>{t.value}</span>
          </div>
        ))}
      </div>
      <div className="wv-market-panel-footer">SEC Form 4 · placeholder data</div>
    </div>
  );
}
