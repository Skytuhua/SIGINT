"use client";

import React from "react";
import { MiniSparkline } from "./shared/MiniSparkline";

interface SpreadRow {
  id: string;
  label: string;
  desc: string;
  spread: number;
  chg1d: number;
  chg1w: number;
  hi1y: number;
  lo1y: number;
  hist: number[];
  signal: "TIGHT" | "NORMAL" | "WIDE" | "STRESS";
}

const SPREADS: SpreadRow[] = [
  {
    id: "cdx-ig",   label: "CDX IG",     desc: "Investment Grade CDS",
    spread: 62,  chg1d: -1, chg1w: -3,  hi1y: 98,  lo1y: 54,
    hist: [82, 78, 74, 70, 68, 64, 62],
    signal: "TIGHT",
  },
  {
    id: "cdx-hy",   label: "CDX HY",     desc: "High Yield CDS",
    spread: 315, chg1d: +4, chg1w: +8,  hi1y: 462, lo1y: 298,
    hist: [380, 360, 345, 330, 322, 318, 315],
    signal: "NORMAL",
  },
  {
    id: "embig",    label: "EMBIG",      desc: "EM Sovereign Spread",
    spread: 368, chg1d: +2, chg1w: +6,  hi1y: 485, lo1y: 348,
    hist: [420, 405, 390, 382, 374, 370, 368],
    signal: "NORMAL",
  },
  {
    id: "ig-oas",   label: "IG OAS",     desc: "US IG Corp Bond OAS",
    spread: 108, chg1d: -2, chg1w: -4,  hi1y: 168, lo1y: 98,
    hist: [145, 136, 128, 122, 116, 111, 108],
    signal: "TIGHT",
  },
  {
    id: "hy-oas",   label: "HY OAS",     desc: "US HY Corp Bond OAS",
    spread: 310, chg1d: +3, chg1w: +9,  hi1y: 488, lo1y: 288,
    hist: [390, 370, 352, 338, 325, 315, 310],
    signal: "NORMAL",
  },
  {
    id: "tib-ois",  label: "TIB/OIS",   desc: "Libor-OIS Spread",
    spread: 12,  chg1d:  0, chg1w: +1,  hi1y: 22,  lo1y: 10,
    hist: [14, 13, 13, 12, 12, 12, 12],
    signal: "NORMAL",
  },
  {
    id: "ted",      label: "TED Spread", desc: "3M LIBOR – T-Bill",
    spread: 28,  chg1d: +1, chg1w: +2,  hi1y: 48,  lo1y: 22,
    hist: [36, 34, 32, 31, 30, 29, 28],
    signal: "NORMAL",
  },
];

const SIGNAL_COLOR: Record<string, string> = {
  TIGHT:  "#36b37e",
  NORMAL: "#ffab40",
  WIDE:   "#ff5a5f",
  STRESS: "#ff0040",
};

interface Props {
  style?: React.CSSProperties;
}

export default function CreditSpreadPanel({ style }: Props) {
  return (
    <div className="wv-market-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">Credit Spreads</span>
        <span style={{ fontSize: 9, color: "var(--wv-text-muted)" }}>OAS / bps</span>
        <span className="wv-market-panel-badge is-static">STATIC</span>
      </div>
      <div className="wv-market-panel-body" style={{ padding: 0 }}>
        <div className="wv-credit-header">
          <span>INDEX</span>
          <span style={{ textAlign: "right" }}>SPREAD</span>
          <span style={{ textAlign: "right" }}>1D</span>
          <span style={{ textAlign: "right" }}>1W</span>
          <span style={{ textAlign: "right" }}>52H</span>
          <span style={{ textAlign: "right" }}>52L</span>
          <span>TREND</span>
          <span>SIGNAL</span>
        </div>
        {SPREADS.map((s) => (
          <div key={s.id} className="wv-credit-row" title={s.desc}>
            <span style={{ color: "#89e5ff", fontWeight: 700 }}>{s.label}</span>
            <span style={{ textAlign: "right", fontWeight: 600, color: "var(--wv-text)" }}>{s.spread}</span>
            <span style={{ textAlign: "right", color: s.chg1d <= 0 ? "#36b37e" : "#ff5a5f" }}>
              {s.chg1d > 0 ? "+" : ""}{s.chg1d}
            </span>
            <span style={{ textAlign: "right", color: s.chg1w <= 0 ? "#36b37e" : "#ff5a5f" }}>
              {s.chg1w > 0 ? "+" : ""}{s.chg1w}
            </span>
            <span style={{ textAlign: "right", color: "var(--wv-text-muted)", fontSize: 9 }}>{s.hi1y}</span>
            <span style={{ textAlign: "right", color: "var(--wv-text-muted)", fontSize: 9 }}>{s.lo1y}</span>
            <span>
              <MiniSparkline prices={s.hist} up={s.hist[s.hist.length - 1] <= s.hist[0]} width={38} height={12} />
            </span>
            <span style={{ color: SIGNAL_COLOR[s.signal], fontSize: 9, fontWeight: 700 }}>{s.signal}</span>
          </div>
        ))}
      </div>
      <div className="wv-market-panel-footer">Markit CDX · BAML MOVE · placeholder data</div>
    </div>
  );
}
