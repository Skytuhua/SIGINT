"use client";

import React from "react";

type Scenario = "BASELINE" | "RISK-OFF" | "RATES UP" | "OIL SHOCK";

interface SnapshotRow {
  sym: string;
  label: string;
  price: string;
  dayPct: number;
  col3: string;
  col3Pct?: number;
  highlight?: Scenario[];
}

interface SnapshotGroup {
  id: string;
  label: string;
  col3Label: string;
  rows: SnapshotRow[];
}

const GROUPS: SnapshotGroup[] = [
  {
    id: "indices",
    label: "INDICES",
    col3Label: "YTD%",
    rows: [
      { sym: "ES",   label: "S&P 500 Fut",   price: "5,672",   dayPct:  0.41, col3: "+8.2%",  col3Pct:  8.2 },
      { sym: "NQ",   label: "Nasdaq 100 Fut", price: "19,840",  dayPct:  0.68, col3: "+12.1%", col3Pct: 12.1 },
      { sym: "RTY",  label: "Russell 2000",   price: "2,048",   dayPct: -0.32, col3: "+2.4%",  col3Pct:  2.4, highlight: ["RISK-OFF"] },
      { sym: "DAX",  label: "Germany 30",     price: "23,140",  dayPct: -0.11, col3: "+5.4%",  col3Pct:  5.4 },
      { sym: "N225", label: "Nikkei 225",     price: "36,720",  dayPct:  0.88, col3: "+4.1%",  col3Pct:  4.1 },
    ],
  },
  {
    id: "fx",
    label: "FX",
    col3Label: "1W%",
    rows: [
      { sym: "EUR",  label: "EUR / USD",      price: "1.0834",  dayPct: -0.24, col3: "+0.1%", col3Pct:  0.1, highlight: ["RISK-OFF"] },
      { sym: "USD",  label: "USD / JPY",      price: "149.24",  dayPct:  0.38, col3: "+1.2%", col3Pct:  1.2, highlight: ["RATES UP"] },
      { sym: "GBP",  label: "GBP / USD",      price: "1.2648",  dayPct: -0.19, col3: "-0.3%", col3Pct: -0.3 },
      { sym: "DXY",  label: "USD Index",      price: "104.23",  dayPct:  0.09, col3: "+0.8%", col3Pct:  0.8, highlight: ["RISK-OFF", "RATES UP"] },
    ],
  },
  {
    id: "commodities",
    label: "COMMODITIES",
    col3Label: "1W%",
    rows: [
      { sym: "XAU",  label: "Gold",           price: "2,331",   dayPct:  0.22, col3: "+1.1%", col3Pct:  1.1, highlight: ["RISK-OFF"] },
      { sym: "XAG",  label: "Silver",         price: "27.45",   dayPct: -0.51, col3: "+0.4%", col3Pct:  0.4 },
      { sym: "WTI",  label: "Crude Oil WTI",  price: "79.85",   dayPct: -1.03, col3: "-3.2%", col3Pct: -3.2, highlight: ["OIL SHOCK"] },
      { sym: "NG",   label: "Natural Gas",    price: "1.824",   dayPct:  2.14, col3: "+5.6%", col3Pct:  5.6, highlight: ["OIL SHOCK"] },
    ],
  },
  {
    id: "rates",
    label: "RATES (UST)",
    col3Label: "1W Δ",
    rows: [
      { sym: "2Y",   label: "US 2Y Treasury", price: "4.68%",   dayPct: -0.03, col3: "-8bp",  highlight: ["RATES UP"] },
      { sym: "5Y",   label: "US 5Y Treasury", price: "4.38%",   dayPct: -0.02, col3: "-6bp",  highlight: ["RATES UP"] },
      { sym: "10Y",  label: "US 10Y Treasury",price: "4.28%",   dayPct: -0.02, col3: "-5bp",  highlight: ["RATES UP"] },
      { sym: "30Y",  label: "US 30Y Treasury",price: "4.52%",   dayPct: -0.01, col3: "-3bp",  highlight: ["RATES UP", "RISK-OFF"] },
    ],
  },
];

interface Props {
  scenario?: Scenario;
  style?: React.CSSProperties;
  onTickerClick?: (sym: string) => void;
}

export default function GlobalSnapshotPanel({ scenario = "BASELINE", style, onTickerClick }: Props) {
  return (
    <div className="wv-market-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">Global Snapshot</span>
        <span className="wv-market-panel-badge is-static">STATIC</span>
      </div>
      <div className="wv-market-panel-body" style={{ padding: 0 }}>
        {GROUPS.map((group) => (
          <div key={group.id}>
            <div className="wv-market-snap-group-label">
              <span>{group.label}</span>
              <span style={{ marginLeft: "auto" }}>{group.col3Label}</span>
            </div>
            {group.rows.map((row) => {
              const isHighlighted = scenario !== "BASELINE" && row.highlight?.includes(scenario);
              const up = row.dayPct >= 0;
              const sign = row.dayPct > 0 ? "+" : "";
              const chgClass = row.dayPct > 0 ? "is-up" : row.dayPct < 0 ? "is-down" : "is-flat";
              return (
                <div
                  key={row.sym}
                  className="wv-market-snap-row"
                  style={{ ...(isHighlighted ? { background: "rgba(255,171,64,0.07)" } : {}), cursor: onTickerClick ? "pointer" : "default" }}
                  onClick={() => onTickerClick?.(row.sym)}
                >
                  <span className="wv-market-snap-sym">{row.sym}</span>
                  <span className="wv-market-snap-name" title={row.label}>{row.label}</span>
                  <span className="wv-market-snap-price">{row.price}</span>
                  <span className={`wv-market-snap-chg ${chgClass}`}>{sign}{row.dayPct.toFixed(2)}%</span>
                  <span className="wv-market-snap-col3">
                    {row.col3Pct !== undefined
                      ? <span className={row.col3Pct >= 0 ? "is-up" : "is-down"}>{row.col3}</span>
                      : <span style={{ color: "var(--wv-text-muted)" }}>{row.col3}</span>
                    }
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="wv-market-panel-footer">Bloomberg · Yahoo Finance · placeholder data</div>
    </div>
  );
}
