"use client";

import React from "react";
import { MiniSparkline } from "./shared/MiniSparkline";
import Term from "./shared/Term";

interface ShippingRow {
  id: string;
  label: string;
  desc: string;
  value: string;
  numVal: number;
  chg1d: number;
  chg1w: number;
  ytd: number;
  hist: number[];
  unit: string;
  signal: "Rising" | "Falling" | "Stable" | "Elevated" | "Depressed";
}

const SHIPPING: ShippingRow[] = [
  {
    id: "bdi",  label: "Baltic Dry",     desc: "Global dry bulk shipping",
    value: "1,842", numVal: 1842, chg1d: +0.87, chg1w: +2.4, ytd: +12.3,
    hist: [1640, 1680, 1720, 1760, 1800, 1828, 1842], unit: "pts",
    signal: "Rising",
  },
  {
    id: "bcsi", label: "Baltic Capesize", desc: "Capesize vessel rates",
    value: "2,118", numVal: 2118, chg1d: +1.2, chg1w: +3.1, ytd: +18.4,
    hist: [1800, 1860, 1920, 1980, 2040, 2090, 2118], unit: "pts",
    signal: "Rising",
  },
  {
    id: "vlcc", label: "VLCC (TD3)",     desc: "Very Large Crude Carrier",
    value: "$28,400", numVal: 28400, chg1d: +1.1, chg1w: +0.8, ytd: -4.2,
    hist: [29800, 29400, 29100, 28800, 28600, 28450, 28400], unit: "$/day",
    signal: "Falling",
  },
  {
    id: "scfi", label: "SCFI (Container)", desc: "Shanghai Container Freight",
    value: "2,840", numVal: 2840, chg1d: +0.8, chg1w: +2.1, ytd: +82.4,
    hist: [1550, 1800, 2100, 2400, 2620, 2760, 2840], unit: "USD/TEU",
    signal: "Elevated",
  },
  {
    id: "wci",  label: "Drewry WCI",     desc: "World Container Index",
    value: "$3,120", numVal: 3120, chg1d: +1.4, chg1w: +3.8, ytd: +124,
    hist: [1380, 1640, 1980, 2340, 2720, 3000, 3120], unit: "$/40ft",
    signal: "Elevated",
  },
  {
    id: "suez", label: "Suezmax",        desc: "Suezmax tanker spot rates",
    value: "$22,100", numVal: 22100, chg1d: -0.4, chg1w: -1.2, ytd: +3.8,
    hist: [21200, 21400, 21600, 21800, 22000, 22100, 22100], unit: "$/day",
    signal: "Stable",
  },
  {
    id: "lngfr",label: "LNG Freight",    desc: "Pacific LNG vessel rate",
    value: "$38,200", numVal: 38200, chg1d: +0.3, chg1w: +1.8, ytd: -18.2,
    hist: [46500, 44200, 42800, 41000, 39800, 38600, 38200], unit: "$/day",
    signal: "Falling",
  },
];

const SIGNAL_COLOR: Record<string, string> = {
  Rising:    "#36b37e",
  Falling:   "#ff5a5f",
  Stable:    "var(--si-text-muted)",
  Elevated:  "#ffab40",
  Depressed: "#ff5a5f",
};

interface Props {
  style?: React.CSSProperties;
}

export default function ShippingPanel({ style }: Props) {
  return (
    <div className="si-market-panel" style={style}>
      <div className="si-market-panel-header">
        <span className="si-market-panel-title">Shipping & Freight</span>
        <span style={{ fontSize: 9, color: "var(--si-text-muted)" }}>Global trade proxy</span>
        <span className="si-market-panel-badge is-reference">REFERENCE</span>
      </div>
      <div className="si-market-panel-body" style={{ padding: 0 }}>
        <div className="si-shipping-header">
          <span>INDEX</span>
          <span style={{ textAlign: "right" }}>VALUE</span>
          <span style={{ textAlign: "right" }}>1D%</span>
          <span style={{ textAlign: "right" }}>1W%</span>
          <span style={{ textAlign: "right" }}>YTD%</span>
          <span>TREND</span>
          <span>SIGNAL</span>
        </div>
        {SHIPPING.map((s) => (
          <div key={s.id} className="si-shipping-row" title={`${s.desc} · ${s.unit}`}>
            <span style={{ color: "#89e5ff", fontWeight: 700 }}>{s.label.startsWith("Baltic") ? <><Term id="BALTIC">Baltic</Term>{s.label.slice(6)}</> : s.label}</span>
            <span style={{ textAlign: "right", fontWeight: 600, color: "var(--si-text)" }}>{s.value}</span>
            <span style={{ textAlign: "right", color: s.chg1d >= 0 ? "#36b37e" : "#ff5a5f" }}>
              {s.chg1d >= 0 ? "+" : ""}{s.chg1d.toFixed(1)}%
            </span>
            <span style={{ textAlign: "right", color: s.chg1w >= 0 ? "#36b37e" : "#ff5a5f" }}>
              {s.chg1w >= 0 ? "+" : ""}{s.chg1w.toFixed(1)}%
            </span>
            <span style={{ textAlign: "right", color: s.ytd >= 0 ? "#36b37e" : "#ff5a5f" }}>
              {s.ytd >= 0 ? "+" : ""}{s.ytd.toFixed(1)}%
            </span>
            <span><MiniSparkline prices={s.hist} up={s.hist[s.hist.length-1] >= s.hist[0]} width={38} height={12} /></span>
            <span style={{ color: SIGNAL_COLOR[s.signal], fontSize: 9, fontWeight: 600 }}>{s.signal}</span>
          </div>
        ))}
      </div>
      <div className="si-market-panel-footer">Baltic Exchange · Drewry · Shanghai Exchange · Curated reference data</div>
    </div>
  );
}
