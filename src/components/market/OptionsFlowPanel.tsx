"use client";

import React from "react";

interface FlowRow {
  time: string;
  sym: string;
  spot: string;
  type: "CALL" | "PUT";
  strike: string;
  exp: string;
  premium: string; // in $M
  premiumNum: number; // numeric for summary calc
  vol: number;
  oi: number;
  sentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
}

const ROWS: FlowRow[] = [
  { time: "14:52", sym: "NVDA", spot: "$878",  type: "CALL", strike: "$900",  exp: "Apr 19", premium: "$12.4M", premiumNum: 12.4, vol: 28400, oi: 14200, sentiment: "BULLISH" },
  { time: "14:48", sym: "SPY",  spot: "$518",  type: "PUT",  strike: "$520",  exp: "Mar 28", premium: "$8.1M",  premiumNum: 8.1,  vol: 42100, oi: 89300, sentiment: "BEARISH" },
  { time: "14:41", sym: "AAPL", spot: "$192",  type: "CALL", strike: "$195",  exp: "Apr 5",  premium: "$6.8M",  premiumNum: 6.8,  vol: 18600, oi: 9400,  sentiment: "BULLISH" },
  { time: "14:33", sym: "META", spot: "$502",  type: "CALL", strike: "$520",  exp: "Apr 19", premium: "$5.2M",  premiumNum: 5.2,  vol: 12300, oi: 6700,  sentiment: "BULLISH" },
  { time: "14:29", sym: "QQQ",  spot: "$441",  type: "PUT",  strike: "$445",  exp: "Mar 28", premium: "$4.9M",  premiumNum: 4.9,  vol: 34700, oi: 112000, sentiment: "BEARISH" },
  { time: "14:21", sym: "TSLA", spot: "$188",  type: "CALL", strike: "$200",  exp: "Apr 26", premium: "$4.1M",  premiumNum: 4.1,  vol: 22100, oi: 18400, sentiment: "BULLISH" },
  { time: "14:18", sym: "AMZN", spot: "$186",  type: "CALL", strike: "$190",  exp: "Apr 12", premium: "$3.8M",  premiumNum: 3.8,  vol: 9800,  oi: 5200,  sentiment: "BULLISH" },
  { time: "14:12", sym: "AMD",  spot: "$170",  type: "PUT",  strike: "$165",  exp: "Mar 28", premium: "$3.4M",  premiumNum: 3.4,  vol: 16200, oi: 24600, sentiment: "BEARISH" },
  { time: "14:05", sym: "MSFT", spot: "$416",  type: "CALL", strike: "$420",  exp: "May 17", premium: "$2.9M",  premiumNum: 2.9,  vol: 7400,  oi: 3800,  sentiment: "BULLISH" },
  { time: "13:58", sym: "GLD",  spot: "$224",  type: "CALL", strike: "$230",  exp: "Jun 20", premium: "$2.6M",  premiumNum: 2.6,  vol: 8100,  oi: 11200, sentiment: "BULLISH" },
  { time: "13:44", sym: "IWM",  spot: "$198",  type: "PUT",  strike: "$195",  exp: "Apr 19", premium: "$2.2M",  premiumNum: 2.2,  vol: 19300, oi: 44500, sentiment: "BEARISH" },
  { time: "13:31", sym: "GOOGL",spot: "$172",  type: "CALL", strike: "$170",  exp: "Apr 5",  premium: "$1.8M",  premiumNum: 1.8,  vol: 6700,  oi: 3100,  sentiment: "NEUTRAL" },
];

const BULLISH_TOTAL = ROWS.filter(r => r.sentiment === "BULLISH").length;
const BEARISH_TOTAL = ROWS.filter(r => r.sentiment === "BEARISH").length;
const BULL_PREMIUM = ROWS.filter(r => r.sentiment === "BULLISH").reduce((a, r) => a + r.premiumNum, 0);
const BEAR_PREMIUM = ROWS.filter(r => r.sentiment === "BEARISH").reduce((a, r) => a + r.premiumNum, 0);
const TOTAL_PREMIUM = BULL_PREMIUM + BEAR_PREMIUM;
const BULL_PCT = TOTAL_PREMIUM > 0 ? (BULL_PREMIUM / TOTAL_PREMIUM) * 100 : 50;

function fmtVol(v: number) {
  return v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v);
}

interface Props {
  style?: React.CSSProperties;
  onTickerClick?: (sym: string) => void;
}

export default function OptionsFlowPanel({ style, onTickerClick }: Props) {
  return (
    <div className="wv-market-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">Unusual Options Flow</span>
        <span style={{ fontSize: 9, color: "var(--wv-text-muted)", letterSpacing: "0.04em" }}>
          Large Premium · Sweep Orders · Dark Pool Prints
        </span>
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 9, color: "#36b37e" }}>{BULLISH_TOTAL}B</span>
          <span style={{ fontSize: 9, color: "var(--wv-text-muted)" }}>/</span>
          <span style={{ fontSize: 9, color: "#ff5a5f" }}>{BEARISH_TOTAL}S</span>
        </span>
        <span className="wv-market-panel-badge is-static">STATIC</span>
      </div>
      <div className="wv-market-panel-body-auto" style={{ padding: 0 }}>
        {/* Column header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "44px 48px 48px 44px 54px 58px 1fr 52px 52px 44px 68px",
          padding: "4px 10px",
          borderBottom: "1px solid var(--wv-line)",
          fontSize: 8.5,
          color: "var(--wv-text-muted)",
          fontWeight: 600,
          letterSpacing: "0.06em",
        }}>
          <span>TIME</span>
          <span>SYM</span>
          <span style={{ textAlign: "right" }}>SPOT</span>
          <span>TYPE</span>
          <span style={{ textAlign: "right" }}>STRIKE</span>
          <span style={{ textAlign: "right" }}>EXP</span>
          <span style={{ textAlign: "right" }}>PREMIUM</span>
          <span style={{ textAlign: "right" }}>VOL</span>
          <span style={{ textAlign: "right" }}>OI</span>
          <span style={{ textAlign: "right" }}>V/OI</span>
          <span style={{ textAlign: "center" }}>SENTIMENT</span>
        </div>

        {ROWS.map((r, i) => {
          const typeColor  = r.type === "CALL" ? "#36b37e" : "#ff5a5f";
          const typeBg     = r.type === "CALL" ? "rgba(54,179,126,0.12)" : "rgba(255,90,95,0.10)";
          const sentColor  = r.sentiment === "BULLISH" ? "#36b37e" : r.sentiment === "BEARISH" ? "#ff5a5f" : "#b9cde0";
          const sentBg     = r.sentiment === "BULLISH" ? "rgba(54,179,126,0.12)" : r.sentiment === "BEARISH" ? "rgba(255,90,95,0.10)" : "rgba(185,205,224,0.07)";
          const voi = r.oi > 0 ? r.vol / r.oi : 0;
          const voiColor = voi > 2 ? "#ff5a5f" : voi > 1 ? "#ffab40" : "var(--wv-text-muted)";
          return (
            <div key={i} style={{
              display: "grid",
              gridTemplateColumns: "44px 48px 48px 44px 54px 58px 1fr 52px 52px 44px 68px",
              padding: "4px 10px",
              borderBottom: "1px solid rgba(185,205,224,0.05)",
              fontSize: 10,
              alignItems: "center",
            }}>
              <span style={{ color: "var(--wv-text-muted)", fontFamily: "monospace", fontSize: 9 }}>{r.time}</span>
              <span
                style={{ color: "#89e5ff", fontWeight: 700, fontFamily: "monospace", cursor: onTickerClick ? "pointer" : "default" }}
                onClick={() => onTickerClick?.(r.sym)}
              >{r.sym}</span>
              <span style={{ textAlign: "right", fontFamily: "monospace", fontSize: 9, color: "var(--wv-text-muted)" }}>{r.spot}</span>
              <span style={{
                fontSize: 8, fontWeight: 700, padding: "1px 4px", borderRadius: 2,
                color: typeColor, background: typeBg, letterSpacing: "0.04em",
              }}>
                {r.type}
              </span>
              <span style={{ textAlign: "right", fontFamily: "monospace", color: "var(--wv-text-bright)" }}>{r.strike}</span>
              <span style={{ textAlign: "right", fontFamily: "monospace", color: "var(--wv-text-muted)", fontSize: 9 }}>{r.exp}</span>
              <span style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "var(--wv-text-bright)" }}>{r.premium}</span>
              <span style={{ textAlign: "right", fontFamily: "monospace", fontSize: 9, color: "var(--wv-text-muted)" }}>{fmtVol(r.vol)}</span>
              <span style={{ textAlign: "right", fontFamily: "monospace", fontSize: 9, color: "var(--wv-text-muted)" }}>{fmtVol(r.oi)}</span>
              <span style={{ textAlign: "right", fontFamily: "monospace", fontSize: 9, color: voiColor, fontWeight: voi > 1 ? 700 : 400 }}>
                {voi.toFixed(1)}x
              </span>
              <span style={{
                textAlign: "center", fontSize: 8, fontWeight: 700, letterSpacing: "0.04em",
                padding: "1px 5px", borderRadius: 2,
                color: sentColor, background: sentBg,
                margin: "0 4px",
              }}>
                {r.sentiment}
              </span>
            </div>
          );
        })}

        {/* Premium summary bar */}
        <div style={{
          padding: "6px 10px",
          borderTop: "1px solid var(--wv-line)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 9,
        }}>
          <span style={{ color: "#36b37e", fontWeight: 700 }}>BULL ${BULL_PREMIUM.toFixed(1)}M</span>
          <div style={{ flex: 1, height: 4, background: "rgba(185,205,224,0.1)", borderRadius: 2, overflow: "hidden", display: "flex" }}>
            <div style={{ width: `${BULL_PCT}%`, height: "100%", background: "#36b37e", borderRadius: "2px 0 0 2px" }} />
            <div style={{ width: `${100 - BULL_PCT}%`, height: "100%", background: "#ff5a5f", borderRadius: "0 2px 2px 0" }} />
          </div>
          <span style={{ color: "#ff5a5f", fontWeight: 700 }}>BEAR ${BEAR_PREMIUM.toFixed(1)}M</span>
        </div>
      </div>
      <div className="wv-market-panel-footer">CBOE · Nasdaq options feed · placeholder data</div>
    </div>
  );
}
