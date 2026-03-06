"use client";

import React from "react";

interface EconEvent {
  date: string;
  name: string;
  prior: string;
  forecast: string;
  actual: string | null; // null = upcoming
  impact: "high" | "med" | "low";
  status: "past" | "today" | "future";
}

const EVENTS: EconEvent[] = [
  { date: "Feb 28", name: "PCE Price Index m/m",    prior: "0.3%",  forecast: "0.3%",  actual: "0.3%",  impact: "high", status: "past"   },
  { date: "Feb 28", name: "Chicago PMI",             prior: "39.5",  forecast: "41.0",  actual: "45.5",  impact: "med",  status: "past"   },
  { date: "Mar 03", name: "ISM Manufacturing PMI",   prior: "49.1",  forecast: "49.5",  actual: "50.3",  impact: "high", status: "past"   },
  { date: "Mar 04", name: "JOLTS Job Openings",      prior: "8.89M", forecast: "8.75M", actual: null,    impact: "high", status: "today"  },
  { date: "Mar 05", name: "ADP Non-Farm Employment", prior: "183K",  forecast: "148K",  actual: null,    impact: "high", status: "future" },
  { date: "Mar 06", name: "Initial Jobless Claims",  prior: "215K",  forecast: "213K",  actual: null,    impact: "med",  status: "future" },
  { date: "Mar 07", name: "Non-Farm Payrolls",       prior: "256K",  forecast: "160K",  actual: null,    impact: "high", status: "future" },
  { date: "Mar 07", name: "Unemployment Rate",       prior: "4.1%",  forecast: "4.1%",  actual: null,    impact: "high", status: "future" },
  { date: "Mar 12", name: "CPI m/m",                 prior: "0.4%",  forecast: "0.3%",  actual: null,    impact: "high", status: "future" },
  { date: "Mar 12", name: "Core CPI m/m",            prior: "0.4%",  forecast: "0.3%",  actual: null,    impact: "high", status: "future" },
  { date: "Mar 19", name: "FOMC Rate Decision",      prior: "4.50%", forecast: "4.50%", actual: null,    impact: "high", status: "future" },
];

const IMPACT_DOT: Record<EconEvent["impact"], string> = {
  high: "#ff5a5f",
  med:  "#ffab40",
  low:  "#36b37e",
};

function ActualCell({ actual, prior, forecast }: { actual: string | null; prior: string; forecast: string }) {
  if (actual === null) {
    return <span className="wv-market-ecal-act is-pending">—</span>;
  }
  // naive beat/miss: compare numeric prefix
  const aNum = parseFloat(actual);
  const fNum = parseFloat(forecast);
  const cls = Number.isNaN(aNum) || Number.isNaN(fNum)
    ? ""
    : aNum >= fNum
      ? "is-beat"
      : "is-miss";
  return <span className={`wv-market-ecal-act ${cls}`}>{actual}</span>;
}

export default function EconCalendarPanel({ style }: { style?: React.CSSProperties }) {
  return (
    <div className="wv-market-panel" style={style ?? { flex: "0 0 auto", maxHeight: "50%" }}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">Economic Calendar</span>
        <span className="wv-market-panel-badge is-static">STATIC</span>
      </div>

      <div className="wv-market-panel-body">
        <div className="wv-market-ecal-col-header">
          <span>DATE</span>
          <span>EVENT</span>
          <span style={{ textAlign: "right" }}>PRIOR</span>
          <span style={{ textAlign: "right" }}>FCST</span>
          <span style={{ textAlign: "right" }}>ACT</span>
        </div>

        {EVENTS.map((ev, i) => (
          <div
            key={i}
            className={`wv-market-ecal-row${ev.status !== "past" ? ` is-${ev.status}` : " is-past"}`}
          >
            <span className="wv-market-ecal-date">{ev.date}</span>
            <span className="wv-market-ecal-name" title={ev.name}>
              <span
                style={{
                  display: "inline-block",
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: IMPACT_DOT[ev.impact],
                  marginRight: 5,
                  verticalAlign: "middle",
                  flexShrink: 0,
                }}
              />
              {ev.name}
            </span>
            <span className="wv-market-ecal-val">{ev.prior}</span>
            <span className="wv-market-ecal-val">{ev.forecast}</span>
            <ActualCell actual={ev.actual} prior={ev.prior} forecast={ev.forecast} />
          </div>
        ))}
      </div>

      <div className="wv-market-panel-footer">BLS · Fed · placeholder data</div>
    </div>
  );
}
