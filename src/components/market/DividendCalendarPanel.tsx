"use client";

import React from "react";
import Term from "./shared/Term";

interface DivRow {
  exDate: string;
  payDate: string;
  sym: string;
  company: string;
  amount: string;
  freq: string;
  yld: number;
  chgYoy: number;
}

const DIVIDENDS: DivRow[] = [
  { exDate: "Mar 8",  payDate: "Mar 28", sym: "AAPL",  company: "Apple",           amount: "$0.24",  freq: "Qtrly",  yld: 0.56, chgYoy:  0.0 },
  { exDate: "Mar 8",  payDate: "Mar 22", sym: "MSFT",  company: "Microsoft",        amount: "$0.75",  freq: "Qtrly",  yld: 0.80, chgYoy: 10.3 },
  { exDate: "Mar 8",  payDate: "Mar 15", sym: "XOM",   company: "ExxonMobil",       amount: "$0.95",  freq: "Qtrly",  yld: 3.42, chgYoy:  4.4 },
  { exDate: "Mar 11", payDate: "Apr 1",  sym: "JNJ",   company: "Johnson & Johnson", amount: "$1.19",  freq: "Qtrly",  yld: 3.12, chgYoy:  4.2 },
  { exDate: "Mar 12", payDate: "Apr 5",  sym: "KO",    company: "Coca-Cola",        amount: "$0.485", freq: "Qtrly",  yld: 3.18, chgYoy:  5.4 },
  { exDate: "Mar 13", payDate: "Apr 8",  sym: "PEP",   company: "PepsiCo",          amount: "$1.265", freq: "Qtrly",  yld: 2.96, chgYoy:  7.1 },
  { exDate: "Mar 14", payDate: "Apr 1",  sym: "JPM",   company: "JPMorgan",         amount: "$1.15",  freq: "Qtrly",  yld: 2.34, chgYoy: 10.0 },
  { exDate: "Mar 14", payDate: "Apr 1",  sym: "VZ",    company: "Verizon",          amount: "$0.665", freq: "Qtrly",  yld: 6.62, chgYoy:  0.0 },
  { exDate: "Mar 18", payDate: "Apr 12", sym: "CVX",   company: "Chevron",          amount: "$1.63",  freq: "Qtrly",  yld: 4.19, chgYoy:  8.0 },
  { exDate: "Mar 19", payDate: "Apr 10", sym: "T",     company: "AT&T",             amount: "$0.2775",freq: "Qtrly",  yld: 6.20, chgYoy:  0.0 },
  { exDate: "Mar 20", payDate: "Apr 15", sym: "PG",    company: "Procter & Gamble", amount: "$0.9407",freq: "Qtrly",  yld: 2.34, chgYoy:  5.0 },
  { exDate: "Mar 21", payDate: "Apr 10", sym: "WMT",   company: "Walmart",          amount: "$0.2075",freq: "Qtrly",  yld: 1.30, chgYoy: 10.0 },
];

interface Props {
  style?: React.CSSProperties;
  onTickerClick?: (sym: string) => void;
}

export default function DividendCalendarPanel({ style, onTickerClick }: Props) {
  return (
    <div className="si-market-panel" style={style}>
      <div className="si-market-panel-header">
        <span className="si-market-panel-title">Dividend Calendar</span>
        <span style={{ fontSize: 9, color: "var(--si-text-muted)" }}>Next 30 days · <Term id="EX_DATE">Ex-Date</Term></span>
        <span className="si-market-panel-badge is-reference">REFERENCE</span>
      </div>
      <div className="si-market-panel-body" style={{ padding: 0 }}>
        <div className="si-div-header">
          <span>EX</span><span>PAY</span><span>SYM</span><span>AMT</span>
          <span style={{ textAlign: "right" }}><Term id="DIV_YIELD">YIELD</Term></span><span style={{ textAlign: "right" }}>YoY</span>
        </div>
        {DIVIDENDS.map((d, i) => (
          <div key={i} className="si-div-row" onClick={() => onTickerClick?.(d.sym)} style={{ cursor: onTickerClick ? "pointer" : "default" }}>
            <span style={{ color: "var(--si-text-muted)" }}>{d.exDate}</span>
            <span style={{ color: "var(--si-text-muted)" }}>{d.payDate}</span>
            <span style={{ color: "#89e5ff", fontWeight: 700 }}>{d.sym}</span>
            <span style={{ color: "#36b37e", fontWeight: 600 }}>{d.amount}</span>
            <span style={{ textAlign: "right", color: d.yld > 4 ? "#ffab40" : "var(--si-text)" }}>{d.yld.toFixed(2)}%</span>
            <span style={{ textAlign: "right", color: d.chgYoy > 0 ? "#36b37e" : d.chgYoy < 0 ? "#ff5a5f" : "var(--si-text-muted)" }}>
              {d.chgYoy === 0 ? "—" : `+${d.chgYoy.toFixed(1)}%`}
            </span>
          </div>
        ))}
      </div>
      <div className="si-market-panel-footer">NASDAQ · Bloomberg · Curated reference data</div>
    </div>
  );
}
