"use client";

import React from "react";
import Term from "./shared/Term";

interface StorageRow {
  commodity: string;
  unit: string;
  current: number;
  avg5y: number;
  lastYear: number;
  chgWeek: number;
  pctVsAvg: number;
  status: "Surplus" | "Normal" | "Deficit";
}

const STORAGE: StorageRow[] = [
  { commodity: "Crude Oil (WTI)",  unit: "mmbbl",   current: 448.5, avg5y: 432.1, lastYear: 461.2, chgWeek: +3.8, pctVsAvg:  3.8, status: "Surplus" },
  { commodity: "Gasoline",         unit: "mmbbl",   current: 232.4, avg5y: 238.8, lastYear: 228.1, chgWeek: -1.2, pctVsAvg: -2.7, status: "Normal"  },
  { commodity: "Distillates (HO)", unit: "mmbbl",   current: 118.9, avg5y: 128.4, lastYear: 116.3, chgWeek: +0.8, pctVsAvg: -7.4, status: "Deficit" },
  { commodity: "Natural Gas",      unit: "Bcf",     current:2412,   avg5y:2181,   lastYear:2200,   chgWeek: -84,  pctVsAvg: 10.6, status: "Surplus" },
  { commodity: "Heating Oil",      unit: "mmbbl",   current:  42.1, avg5y:  46.8, lastYear:  43.9, chgWeek: +0.3, pctVsAvg: -9.9, status: "Deficit" },
  { commodity: "Gold (COMEX)",     unit: "moz",     current: 283.4, avg5y: 261.2, lastYear: 270.8, chgWeek: +2.1, pctVsAvg:  8.5, status: "Surplus" },
  { commodity: "Silver (COMEX)",   unit: "moz",     current: 914.2, avg5y: 882.4, lastYear: 898.6, chgWeek: +4.8, pctVsAvg:  3.6, status: "Surplus" },
  { commodity: "Copper (LME)",     unit: "kt",      current: 184.2, avg5y: 198.8, lastYear: 191.4, chgWeek: -3.2, pctVsAvg: -7.3, status: "Deficit" },
];

const STATUS_COLOR: Record<string, string> = {
  Surplus: "#36b37e",
  Normal:  "#ffab40",
  Deficit: "#ff5a5f",
};

interface Props {
  style?: React.CSSProperties;
}

export default function CommodityStoragePanel({ style }: Props) {
  return (
    <div className="si-market-panel" style={style}>
      <div className="si-market-panel-header">
        <span className="si-market-panel-title">Storage & Inventory</span>
        <span style={{ fontSize: 9, color: "var(--si-text-muted)" }}>vs. 5-Year Average</span>
        <span className="si-market-panel-badge is-reference">REFERENCE</span>
      </div>
      <div className="si-market-panel-body" style={{ padding: 0 }}>
        <div className="si-storage-header">
          <span>COMMODITY</span>
          <span style={{ textAlign: "right" }}>CURRENT</span>
          <span style={{ textAlign: "right" }}><Term id="FIVE_YR_AVG">5YR AVG</Term></span>
          <span style={{ textAlign: "right" }}>WK CHG</span>
          <span style={{ textAlign: "right" }}>VS AVG</span>
          <span style={{ width: 80 }}>VS AVG BAR</span>
          <span>STATUS</span>
        </div>
        {STORAGE.map((r) => {
          const barPct = Math.min(100, Math.max(0, 50 + r.pctVsAvg * 2));
          const barColor = r.status === "Surplus" ? "rgba(54,179,126,0.5)" : r.status === "Deficit" ? "rgba(255,90,95,0.5)" : "rgba(255,171,64,0.4)";
          return (
            <div key={r.commodity} className="si-storage-row">
              <span style={{ color: "var(--si-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.commodity}</span>
              <span style={{ textAlign: "right", color: "var(--si-text)", fontWeight: 600 }}>
                {r.current.toLocaleString()} <span style={{ color: "var(--si-text-muted)", fontSize: 8 }}>{r.unit}</span>
              </span>
              <span style={{ textAlign: "right", color: "var(--si-text-muted)" }}>{r.avg5y.toLocaleString()}</span>
              <span style={{ textAlign: "right", color: r.chgWeek >= 0 ? "#36b37e" : "#ff5a5f" }}>
                {r.chgWeek > 0 ? "+" : ""}{r.chgWeek}
              </span>
              <span style={{ textAlign: "right", color: STATUS_COLOR[r.status], fontWeight: 600 }}>
                {r.pctVsAvg >= 0 ? "+" : ""}{r.pctVsAvg.toFixed(1)}%
              </span>
              <span style={{ paddingLeft: 4 }}>
                <div style={{ height: 6, background: "rgba(185,205,224,0.08)", borderRadius: 2, overflow: "hidden", position: "relative" }}>
                  <div style={{ position: "absolute", left: "50%", top: 0, width: 1, height: "100%", background: "rgba(185,205,224,0.2)" }} />
                  <div
                    style={{
                      position: "absolute",
                      left: r.pctVsAvg >= 0 ? "50%" : `${barPct}%`,
                      width: `${Math.abs(r.pctVsAvg) * 2}%`,
                      height: "100%",
                      background: barColor,
                      maxWidth: "50%",
                    }}
                  />
                </div>
              </span>
              <span style={{ color: STATUS_COLOR[r.status], fontSize: 9, fontWeight: 600 }}>{r.status}</span>
            </div>
          );
        })}
      </div>
      <div className="si-market-panel-footer">EIA · LME · COMEX Warehouse · Curated reference data</div>
    </div>
  );
}
