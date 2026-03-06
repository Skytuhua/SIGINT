"use client";

import React from "react";
import { heatColorAlpha as heatColor } from "./shared/heatColor";

function fxTextColor(pct: number): string {
  if (Math.abs(pct) < 0.3) return "var(--wv-text-muted)";
  return pct > 0 ? "#36b37e" : "#ff5a5f";
}

const CCYS = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF"] as const;
type Ccy = typeof CCYS[number];

interface FxCell {
  value: string;
  chg24h: number;
}

// Cross-rate matrix. MATRIX[row][col] = rate for row/col pair
// Values: how many COL units per 1 ROW unit
const MATRIX: Record<Ccy, Record<Ccy, FxCell>> = {
  USD: {
    USD: { value: "—",       chg24h: 0 },
    EUR: { value: "0.9230",  chg24h:  0.24 },
    GBP: { value: "0.7910",  chg24h:  0.19 },
    JPY: { value: "149.24",  chg24h: -0.38 },
    CAD: { value: "1.3582",  chg24h: -0.12 },
    AUD: { value: "1.5330",  chg24h: -0.14 },
    CHF: { value: "0.8842",  chg24h: -0.09 },
  },
  EUR: {
    USD: { value: "1.0834",  chg24h: -0.24 },
    EUR: { value: "—",       chg24h: 0 },
    GBP: { value: "0.8572",  chg24h:  0.05 },
    JPY: { value: "161.72",  chg24h: -0.62 },
    CAD: { value: "1.4714",  chg24h: -0.36 },
    AUD: { value: "1.6611",  chg24h: -0.38 },
    CHF: { value: "0.9578",  chg24h: -0.33 },
  },
  GBP: {
    USD: { value: "1.2648",  chg24h: -0.19 },
    EUR: { value: "1.1664",  chg24h: -0.05 },
    GBP: { value: "—",       chg24h: 0 },
    JPY: { value: "188.72",  chg24h: -0.57 },
    CAD: { value: "1.7168",  chg24h: -0.31 },
    AUD: { value: "1.9383",  chg24h: -0.33 },
    CHF: { value: "1.1178",  chg24h: -0.28 },
  },
  JPY: {
    USD: { value: "0.00670", chg24h:  0.38 },
    EUR: { value: "0.00618", chg24h:  0.62 },
    GBP: { value: "0.00530", chg24h:  0.57 },
    JPY: { value: "—",       chg24h: 0 },
    CAD: { value: "0.00910", chg24h:  0.26 },
    AUD: { value: "0.01028", chg24h:  0.24 },
    CHF: { value: "0.00593", chg24h:  0.29 },
  },
  CAD: {
    USD: { value: "0.7363",  chg24h:  0.12 },
    EUR: { value: "0.6797",  chg24h:  0.36 },
    GBP: { value: "0.5825",  chg24h:  0.31 },
    JPY: { value: "109.88",  chg24h: -0.26 },
    CAD: { value: "—",       chg24h: 0 },
    AUD: { value: "1.1290",  chg24h: -0.02 },
    CHF: { value: "0.6511",  chg24h:  0.03 },
  },
  AUD: {
    USD: { value: "0.6521",  chg24h:  0.14 },
    EUR: { value: "0.6018",  chg24h:  0.38 },
    GBP: { value: "0.5159",  chg24h:  0.33 },
    JPY: { value: "97.35",   chg24h: -0.24 },
    CAD: { value: "0.8857",  chg24h:  0.02 },
    AUD: { value: "—",       chg24h: 0 },
    CHF: { value: "0.5768",  chg24h:  0.05 },
  },
  CHF: {
    USD: { value: "1.1311",  chg24h:  0.09 },
    EUR: { value: "1.0440",  chg24h:  0.33 },
    GBP: { value: "0.8947",  chg24h:  0.28 },
    JPY: { value: "168.82",  chg24h: -0.29 },
    CAD: { value: "1.5357",  chg24h: -0.03 },
    AUD: { value: "1.7334",  chg24h: -0.05 },
    CHF: { value: "—",       chg24h: 0 },
  },
};

interface Props {
  style?: React.CSSProperties;
}

export default function FxMatrixPanel({ style }: Props) {
  return (
    <div className="wv-market-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">FX Cross-Rate Matrix</span>
        <span style={{ fontSize: 9, color: "var(--wv-text-muted)", letterSpacing: "0.04em" }}>ROW / COL · 24H CHG</span>
        <span className="wv-market-panel-badge is-static">STATIC</span>
      </div>
      <div className="wv-market-panel-body" style={{ padding: "4px 6px" }}>
        <div className="wv-market-fxmatrix-grid">
          {/* Corner */}
          <div className="wv-market-fxmatrix-corner">↓/→</div>
          {/* Column headers */}
          {CCYS.map((col) => (
            <div key={col} className="wv-market-fxmatrix-header">{col}</div>
          ))}
          {/* Rows */}
          {CCYS.map((row) => (
            <React.Fragment key={row}>
              <div className="wv-market-fxmatrix-row-label">{row}</div>
              {CCYS.map((col) => {
                const cell = MATRIX[row][col];
                const isSelf = row === col;
                return (
                  <div
                    key={col}
                    className={`wv-market-fxmatrix-cell${isSelf ? " is-self" : ""}`}
                    style={!isSelf ? { background: heatColor(cell.chg24h) } : undefined}
                    title={!isSelf ? `${row}/${col}: ${cell.value} (${cell.chg24h > 0 ? "+" : ""}${cell.chg24h.toFixed(2)}% 24h)` : undefined}
                  >
                    <span style={{ color: isSelf ? "var(--wv-text-muted)" : fxTextColor(cell.chg24h) }}>
                      {cell.value}
                    </span>
                    {!isSelf && (
                      <span className="wv-market-fxmatrix-chg" style={{ color: fxTextColor(cell.chg24h) }}>
                        {cell.chg24h > 0 ? "+" : ""}{cell.chg24h.toFixed(2)}%
                      </span>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className="wv-market-panel-footer">OANDA · ECB · placeholder data</div>
    </div>
  );
}
