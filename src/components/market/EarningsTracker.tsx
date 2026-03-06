"use client";

import React from "react";

type Surprise = "beat" | "miss" | "in-line" | null;

interface EarningsEntry {
  time: string;
  sym: string;
  company: string;
  epsEst: string;
  epsAct?: string;
  surprise?: Surprise;
  mktCapB: string;
}

interface EarningsBucket {
  label: string;
  status: "today" | "future" | "past";
  entries: EarningsEntry[];
}

const BUCKETS: EarningsBucket[] = [
  {
    label: "TODAY",
    status: "today",
    entries: [
      { time: "BMO", sym: "AAPL",  company: "Apple Inc.",       epsEst: "$2.10", mktCapB: "2,820B" },
      { time: "AMC", sym: "COST",  company: "Costco Wholesale", epsEst: "$3.88", mktCapB: "344B"  },
      { time: "AMC", sym: "MRVL",  company: "Marvell Tech",     epsEst: "$0.46", mktCapB: "63B"   },
    ],
  },
  {
    label: "TOMORROW",
    status: "future",
    entries: [
      { time: "AMC", sym: "NVDA",  company: "NVIDIA Corp.",     epsEst: "$5.55", mktCapB: "2,090B" },
      { time: "AMC", sym: "MSFT",  company: "Microsoft Corp.",  epsEst: "$2.82", mktCapB: "3,110B" },
      { time: "BMO", sym: "AVGO",  company: "Broadcom Inc.",    epsEst: "$10.34", mktCapB: "714B"  },
    ],
  },
  {
    label: "NEXT WEEK",
    status: "future",
    entries: [
      { time: "AMC", sym: "AMZN",  company: "Amazon.com",       epsEst: "$1.14", mktCapB: "1,910B" },
      { time: "AMC", sym: "META",  company: "Meta Platforms",   epsEst: "$4.98", mktCapB: "1,250B" },
      { time: "AMC", sym: "TSLA",  company: "Tesla Inc.",       epsEst: "$0.52", mktCapB: "572B"  },
      { time: "BMO", sym: "GOOGL", company: "Alphabet Inc.",    epsEst: "$1.72", mktCapB: "2,140B" },
    ],
  },
];

const RECENT_SURPRISES: EarningsEntry[] = [
  { time: "Feb 01", sym: "AAPL",  company: "Apple Inc.",      epsEst: "$2.21", epsAct: "$2.40", surprise: "beat",    mktCapB: "2,820B" },
  { time: "Jan 30", sym: "GOOGL", company: "Alphabet",        epsEst: "$1.72", epsAct: "$1.89", surprise: "beat",    mktCapB: "2,140B" },
  { time: "Jan 29", sym: "META",  company: "Meta Platforms",  epsEst: "$5.35", epsAct: "$5.12", surprise: "miss",    mktCapB: "1,250B" },
  { time: "Jan 28", sym: "MSFT",  company: "Microsoft",       epsEst: "$2.78", epsAct: "$2.94", surprise: "beat",    mktCapB: "3,110B" },
  { time: "Jan 24", sym: "NFLX",  company: "Netflix Inc.",    epsEst: "$4.20", epsAct: "$4.27", surprise: "in-line", mktCapB: "268B"  },
];

const SURPRISE_STYLE: Record<NonNullable<Surprise>, { cls: string; label: string }> = {
  "beat":    { cls: "is-beat",   label: "BEAT" },
  "miss":    { cls: "is-miss",   label: "MISS" },
  "in-line": { cls: "is-inline", label: "≈LINE" },
};

const STATUS_COLOR: Record<EarningsBucket["status"], string> = {
  today:  "#89e5ff",
  future: "var(--wv-text-muted)",
  past:   "var(--wv-text-muted)",
};

interface Props {
  style?: React.CSSProperties;
  onTickerClick?: (sym: string) => void;
}

export default function EarningsTracker({ style, onTickerClick }: Props) {
  return (
    <div className="wv-market-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">Earnings Tracker</span>
        <span style={{ fontSize: 9, color: "var(--wv-text-muted)", letterSpacing: "0.04em" }}>BMO = pre-market · AMC = after-market</span>
        <span className="wv-market-panel-badge is-static">STATIC</span>
      </div>
      <div className="wv-market-panel-body" style={{ padding: 0 }}>
        {BUCKETS.map((bucket) => (
          <div key={bucket.label}>
            <div className="wv-market-earn-section-label" style={{ color: STATUS_COLOR[bucket.status] }}>
              {bucket.label}
            </div>
            {bucket.entries.map((e) => (
              <div key={e.sym} className="wv-market-earn-row" style={{ cursor: onTickerClick ? "pointer" : "default" }} onClick={() => onTickerClick?.(e.sym)}>
                <span className="wv-market-earn-time">{e.time}</span>
                <span
                  className="wv-market-earn-dot"
                  style={{ background: "var(--wv-text-muted)", width: 5, height: 5, borderRadius: "50%", display: "inline-block", flexShrink: 0 }}
                />
                <span className="wv-market-earn-sym">{e.sym}</span>
                <span className="wv-market-earn-company" title={e.company}>{e.company}</span>
                <span className="wv-market-earn-eps-est">EST {e.epsEst}</span>
              </div>
            ))}
          </div>
        ))}

        {/* Recent Surprises */}
        <div className="wv-market-earn-section-label" style={{ color: "var(--wv-text-muted)", marginTop: 2 }}>
          RECENT SURPRISES
        </div>
        {RECENT_SURPRISES.map((e) => {
          const s = e.surprise ? SURPRISE_STYLE[e.surprise] : null;
          return (
            <div key={`${e.sym}-${e.time}`} className="wv-market-earn-row" style={{ cursor: onTickerClick ? "pointer" : "default" }} onClick={() => onTickerClick?.(e.sym)}>
              <span className="wv-market-earn-time">{e.time}</span>
              <span
                className="wv-market-earn-dot"
                style={{
                  background: e.surprise === "beat" ? "#36b37e" : e.surprise === "miss" ? "#ff5a5f" : "var(--wv-text-muted)",
                  width: 5, height: 5, borderRadius: "50%", display: "inline-block", flexShrink: 0,
                }}
              />
              <span className="wv-market-earn-sym">{e.sym}</span>
              <span className="wv-market-earn-company">{e.epsAct}</span>
              {s && <span className={`wv-market-earn-surprise ${s.cls}`}>{s.label}</span>}
            </div>
          );
        })}
      </div>
      <div className="wv-market-panel-footer">I/B/E/S · FactSet · placeholder data</div>
    </div>
  );
}
