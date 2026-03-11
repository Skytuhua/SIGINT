"use client";

import React from "react";
import { MiniSparkline } from "./shared/MiniSparkline";
import Term from "./shared/Term";

interface FomcRow {
  meeting: string;
  date: string;
  implied: number;
  cutProb: number;
  holdProb: number;
  hikeProb: number;
  cumCuts: number;
  hist: number[];
}

// Fed Funds implied rate per FOMC meeting (static — March 2026 context)
const FOMC: FomcRow[] = [
  { meeting: "Mar 20",  date: "Mar 2026",  implied: 5.33, cutProb:  4, holdProb: 94, hikeProb:  2, cumCuts: 0.0, hist: [5.38,5.36,5.35,5.34,5.34,5.33,5.33] },
  { meeting: "May 7",   date: "May 2026",  implied: 5.21, cutProb: 28, holdProb: 68, hikeProb:  4, cumCuts: 0.25, hist: [5.42,5.38,5.32,5.28,5.26,5.22,5.21] },
  { meeting: "Jun 18",  date: "Jun 2026",  implied: 5.08, cutProb: 52, holdProb: 44, hikeProb:  4, cumCuts: 0.5, hist: [5.45,5.38,5.26,5.18,5.12,5.09,5.08] },
  { meeting: "Jul 30",  date: "Jul 2026",  implied: 4.96, cutProb: 60, holdProb: 38, hikeProb:  2, cumCuts: 0.75, hist: [5.48,5.40,5.22,5.08,5.01,4.97,4.96] },
  { meeting: "Sep 17",  date: "Sep 2026",  implied: 4.83, cutProb: 65, holdProb: 33, hikeProb:  2, cumCuts: 1.0,  hist: [5.50,5.40,5.20,5.00,4.90,4.84,4.83] },
  { meeting: "Nov 5",   date: "Nov 2026",  implied: 4.72, cutProb: 58, holdProb: 40, hikeProb:  2, cumCuts: 1.25, hist: [5.50,5.38,5.16,4.95,4.82,4.73,4.72] },
  { meeting: "Dec 10",  date: "Dec 2026",  implied: 4.62, cutProb: 55, holdProb: 43, hikeProb:  2, cumCuts: 1.5,  hist: [5.50,5.36,5.12,4.90,4.74,4.63,4.62] },
];

const currentRate = 5.375;

interface Props {
  style?: React.CSSProperties;
}

export default function FedFuturesPanel({ style }: Props) {
  return (
    <div className="si-market-panel" style={style}>
      <div className="si-market-panel-header">
        <span className="si-market-panel-title">Fed Funds Futures</span>
        <span style={{ fontSize: 9, color: "var(--si-text-muted)" }}>
          Current: <span style={{ color: "#ffab40", fontWeight: 700 }}>{currentRate.toFixed(2)}%</span>
        </span>
        <span className="si-market-panel-badge is-reference">REFERENCE</span>
      </div>
      <div className="si-market-panel-body" style={{ padding: 0 }}>
        <div className="si-fed-header">
          <span><Term id="FOMC">MEETING</Term></span><span style={{ textAlign: "right" }}><Term id="FED_FUNDS">IMPLIED</Term></span>
          <span style={{ textAlign: "right" }}><Term id="CUT_HIKE">CUT%</Term></span>
          <span style={{ textAlign: "right" }}>HOLD%</span>
          <span style={{ textAlign: "right" }}><Term id="SIGMA_CUTS">{"\u03a3Cuts"}</Term></span>
          <span>TREND</span>
        </div>
        {FOMC.map((r) => {
          const delta = r.implied - currentRate;
          const isCurrent = r.meeting === "Mar 20";
          return (
            <div key={r.meeting} className={`si-fed-row${isCurrent ? " is-current" : ""}`}>
              <span style={{ color: isCurrent ? "#89e5ff" : "var(--si-text)", fontWeight: isCurrent ? 700 : 400 }}>{r.meeting}</span>
              <span style={{ textAlign: "right", color: "var(--si-text)", fontWeight: 600 }}>{r.implied.toFixed(2)}%</span>
              <span style={{ textAlign: "right", color: r.cutProb > 50 ? "#36b37e" : "var(--si-text-muted)" }}>{r.cutProb}%</span>
              <span style={{ textAlign: "right", color: "var(--si-text-muted)" }}>{r.holdProb}%</span>
              <span style={{ textAlign: "right", color: r.cumCuts > 0 ? "#36b37e" : "var(--si-text-muted)" }}>
                {r.cumCuts === 0 ? "—" : `-${r.cumCuts.toFixed(2)}%`}
              </span>
              <span>
                <MiniSparkline prices={r.hist} up={false} width={40} height={12} />
              </span>
            </div>
          );
        })}
      </div>
      <div className="si-market-panel-footer"><Term id="FEDWATCH">CME FedWatch</Term> · <Term id="SOFR">SOFR</Term> futures · Curated reference data</div>
    </div>
  );
}
