"use client";

import React from "react";
import { MiniSparkline } from "./shared/MiniSparkline";

type CurveType = "contango" | "backwardation" | "flat";

interface CommodityCard {
  sym: string;
  name: string;
  spot: string;
  chg: number;
  spark: number[];
  curve: CurveType;
  unit: string;
}

interface CommodityGroup {
  label: string;
  icon: string;
  items: CommodityCard[];
}

const GROUPS: CommodityGroup[] = [
  {
    label: "ENERGY",
    icon: "⚡",
    items: [
      { sym: "WTI",  name: "Crude Oil WTI", spot: "$79.85",  chg: -1.03, spark: [83,82,81.5,81,80.5,80,79.85], curve: "backwardation", unit: "$/bbl" },
      { sym: "BRT",  name: "Brent Crude",   spot: "$83.20",  chg: -0.92, spark: [87,86,85.5,85,84.5,84,83.20], curve: "backwardation", unit: "$/bbl" },
      { sym: "NG",   name: "Natural Gas",   spot: "$1.824",  chg:  2.14, spark: [1.62,1.68,1.70,1.72,1.74,1.80,1.824], curve: "contango",      unit: "$/mmBtu" },
      { sym: "RB",   name: "RBOB Gasoline", spot: "$2.482",  chg: -0.61, spark: [2.55,2.54,2.53,2.52,2.51,2.50,2.482], curve: "backwardation", unit: "$/gal" },
    ],
  },
  {
    label: "METALS",
    icon: "◈",
    items: [
      { sym: "GC",   name: "Gold",          spot: "$2,331",  chg:  0.22, spark: [2310,2315,2318,2325,2328,2330,2331], curve: "flat",          unit: "$/oz" },
      { sym: "SI",   name: "Silver",        spot: "$27.45",  chg: -0.51, spark: [28.1,27.9,27.8,27.7,27.6,27.5,27.45], curve: "flat",         unit: "$/oz" },
      { sym: "HG",   name: "Copper",        spot: "$4.124",  chg:  0.34, spark: [4.02,4.04,4.06,4.08,4.10,4.12,4.124], curve: "contango",     unit: "$/lb" },
      { sym: "PL",   name: "Platinum",      spot: "$944.2",  chg: -0.12, spark: [950,948,947,946,945,944.5,944.2], curve: "flat",             unit: "$/oz" },
    ],
  },
  {
    label: "AGRICULTURE",
    icon: "◎",
    items: [
      { sym: "ZC",   name: "Corn",          spot: "$452.50", chg:  0.44, spark: [448,449,450,451,451.5,452,452.5], curve: "contango",        unit: "¢/bu" },
      { sym: "ZW",   name: "Wheat",         spot: "$594.25", chg: -1.18, spark: [608,606,604,601,599,596,594.25], curve: "contango",         unit: "¢/bu" },
      { sym: "ZS",   name: "Soybeans",      spot: "$1,182",  chg:  0.62, spark: [1165,1168,1172,1176,1178,1181,1182], curve: "flat",          unit: "¢/bu" },
      { sym: "KC",   name: "Coffee",        spot: "$196.80", chg:  1.44, spark: [190,192,193,194,195,196,196.8], curve: "backwardation",      unit: "¢/lb" },
    ],
  },
];

const CURVE_STYLE: Record<CurveType, { color: string; label: string }> = {
  contango:      { color: "#ffab40", label: "CONTANGO" },
  backwardation: { color: "#89e5ff", label: "BACKWDN" },
  flat:          { color: "var(--wv-text-muted)", label: "FLAT" },
};

interface Props {
  style?: React.CSSProperties;
}

export default function CommoditiesBoard({ style }: Props) {
  return (
    <div className="wv-market-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">Commodities</span>
        <span style={{ fontSize: 9, color: "var(--wv-text-muted)", letterSpacing: "0.04em" }}>SPOT PRICES · FUTURES CURVE</span>
        <span className="wv-market-panel-badge is-static">STATIC</span>
      </div>
      <div className="wv-market-panel-body" style={{ padding: "0 4px 4px" }}>
        {GROUPS.map((group) => (
          <div key={group.label}>
            <div className="wv-market-commod-section-label">
              <span>{group.label}</span>
            </div>
            <div className="wv-market-commod-grid">
              {group.items.map((item) => {
                const up = item.chg >= 0;
                const chgClass = item.chg > 0 ? "is-up" : item.chg < 0 ? "is-down" : "is-flat";
                const sign = item.chg > 0 ? "+" : "";
                const cs = CURVE_STYLE[item.curve];
                return (
                  <div key={item.sym} className="wv-market-commod-card">
                    <div className="wv-market-commod-card-top">
                      <span className="wv-market-commod-sym">{item.sym}</span>
                      <span className={`wv-market-commod-chg ${chgClass}`}>{sign}{item.chg.toFixed(2)}%</span>
                    </div>
                    <div className="wv-market-commod-name" title={item.name}>{item.name}</div>
                    <div className="wv-market-commod-card-mid">
                      <span className="wv-market-commod-price">{item.spot}</span>
                      <MiniSparkline prices={item.spark} up={up} width={44} height={14} />
                    </div>
                    <div className="wv-market-commod-card-bot">
                      <span className="wv-market-commod-unit">{item.unit}</span>
                      <span className="wv-market-commod-curve" style={{ color: cs.color }}>{cs.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="wv-market-panel-footer">CME · ICE · NYMEX · placeholder data</div>
    </div>
  );
}
