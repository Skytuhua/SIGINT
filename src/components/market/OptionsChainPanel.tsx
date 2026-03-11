"use client";

import { useState, useMemo } from "react";
import { bsPrice, bsGreeks, tickerIV } from "./shared/blackScholes";
import Term from "./shared/Term";

interface Props {
  sym: string;
  spotPrice: number;
}

function nextFridays(count: number): { label: string; daysOut: number }[] {
  const results: { label: string; daysOut: number }[] = [];
  const now = new Date();
  let d = new Date(now);
  d.setHours(0, 0, 0, 0);
  // advance to next friday
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
  for (let i = 0; i < count; i++) {
    const daysOut = Math.max(1, Math.round((d.getTime() - now.getTime()) / 86400000));
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    results.push({ label: `${label} (${daysOut}d)`, daysOut });
    d = new Date(d);
    d.setDate(d.getDate() + 7);
  }
  return results;
}

function fmtPrice(v: number): string {
  return v < 0.005 ? "0.00" : v < 1 ? v.toFixed(3) : v.toFixed(2);
}

function fmtGreek(v: number, decimals = 3): string {
  return v.toFixed(decimals);
}

function fmtOI(v: number): string {
  if (v >= 1000) return (v / 1000).toFixed(1) + "K";
  return String(v);
}

export default function OptionsChainPanel({ sym, spotPrice }: Props) {
  const expiries = useMemo(() => nextFridays(4), []);
  const [expiryIdx, setExpiryIdx] = useState(0);
  const [showGreeks, setShowGreeks] = useState(false);

  const iv = tickerIV(sym);
  const T = expiries[expiryIdx].daysOut / 365;
  const r = 0.053; // risk-free rate

  // 13 strikes: ATM ± 6 steps of 2.5%
  const strikes = useMemo(() => {
    const base = spotPrice;
    const step = base * 0.025;
    // round ATM to nearest clean number
    const atm = Math.round(base / step) * step;
    return Array.from({ length: 13 }, (_, i) => {
      const k = atm + (i - 6) * step;
      return Math.round(k * 100) / 100;
    });
  }, [spotPrice]);

  // deterministic OI seed from ticker
  function oiForStrike(strike: number, type: "call" | "put"): number {
    let h = 0;
    for (let i = 0; i < sym.length; i++) h = (h * 31 + sym.charCodeAt(i)) & 0xffff;
    const x = Math.abs(strike - spotPrice) / spotPrice;
    const base = Math.round(1000 + (h % 5000) * Math.exp(-x * 8));
    return type === "call" ? base + (h % 300) : base + ((h >> 4) % 400);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Toolbar */}
      <div className="si-opt-toolbar">
        <div className="si-opt-expiry-row">
          {expiries.map((e, i) => (
            <button
              key={i}
              className={`si-opt-expiry-btn${expiryIdx === i ? " is-active" : ""}`}
              onClick={() => setExpiryIdx(i)}
            >
              {e.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10 }}>
          <span style={{ color: "var(--si-text-muted)" }}>
            <Term id="IV">IV</Term>: <span style={{ color: "#ffab40" }}>{(iv * 100).toFixed(0)}%</span>
          </span>
          <button
            className={`si-chart-toggle-btn${showGreeks ? " is-active" : ""}`}
            onClick={() => setShowGreeks((v) => !v)}
          >
            <Term id="GREEKS">GREEKS</Term>
          </button>
        </div>
      </div>

      {/* Header row */}
      <div className={`si-opt-header-row${showGreeks ? " show-greeks" : ""}`}>
        {showGreeks ? (
          <>
            <span className="si-opt-call-side">Δ</span>
            <span className="si-opt-call-side">Γ</span>
            <span className="si-opt-call-side">Θ</span>
          </>
        ) : (
          <>
            <span className="si-opt-call-side">OI</span>
            <span className="si-opt-call-side">VOL</span>
          </>
        )}
        <span className="si-opt-call-side">BID</span>
        <span className="si-opt-call-side">ASK</span>
        <span className="si-opt-strike-cell"><Term id="STRIKE">STRIKE</Term></span>
        <span className="si-opt-put-side">BID</span>
        <span className="si-opt-put-side">ASK</span>
        {showGreeks ? (
          <>
            <span className="si-opt-put-side">Δ</span>
            <span className="si-opt-put-side">Γ</span>
            <span className="si-opt-put-side">Θ</span>
          </>
        ) : (
          <>
            <span className="si-opt-put-side">VOL</span>
            <span className="si-opt-put-side">OI</span>
          </>
        )}
      </div>

      {/* Chain rows */}
      <div style={{ flex: "1 1 0", minHeight: 0, overflowY: "auto" }}>
        {strikes.map((K) => {
          const callMid = bsPrice(spotPrice, K, T, r, iv, "call");
          const putMid = bsPrice(spotPrice, K, T, r, iv, "put");
          const spread = Math.max(0.01, callMid * 0.04);
          const callBid = Math.max(0, callMid - spread / 2);
          const callAsk = callMid + spread / 2;
          const putBid = Math.max(0, putMid - spread / 2);
          const putAsk = putMid + spread / 2;
          const callG = showGreeks ? bsGreeks(spotPrice, K, T, r, iv, "call") : null;
          const putG = showGreeks ? bsGreeks(spotPrice, K, T, r, iv, "put") : null;

          const isATM = Math.abs(K - spotPrice) / spotPrice < 0.013;
          const itmCall = K < spotPrice;
          const itmPut = K > spotPrice;

          const callOI = oiForStrike(K, "call");
          const putOI = oiForStrike(K, "put");

          let rowBg = "transparent";
          if (isATM) rowBg = "rgba(255,171,64,0.07)";

          return (
            <div
              key={K}
              className={`si-opt-row${showGreeks ? " show-greeks" : ""}${isATM ? " is-atm" : ""}`}
              style={{ background: rowBg }}
            >
              {/* Call side */}
              <div
                className="si-opt-call-half"
                style={{ background: itmCall ? "rgba(54,179,126,0.06)" : "transparent" }}
              >
                {showGreeks && callG ? (
                  <>
                    <span className="si-opt-greek">{fmtGreek(callG.delta)}</span>
                    <span className="si-opt-greek">{fmtGreek(callG.gamma, 4)}</span>
                    <span className="si-opt-greek" style={{ color: "#ff5a5f" }}>{fmtGreek(callG.theta)}</span>
                  </>
                ) : (
                  <>
                    <span className="si-opt-oi">{fmtOI(callOI)}</span>
                    <span className="si-opt-oi">{fmtOI(Math.round(callOI * 0.4))}</span>
                  </>
                )}
                <span className="si-opt-bid">{fmtPrice(callBid)}</span>
                <span className="si-opt-ask">{fmtPrice(callAsk)}</span>
              </div>

              {/* Strike */}
              <span className={`si-opt-strike-cell${isATM ? " is-atm" : ""}`}>
                {K < 10 ? K.toFixed(3) : K >= 1000 ? K.toFixed(0) : K.toFixed(2)}
              </span>

              {/* Put side */}
              <div
                className="si-opt-put-half"
                style={{ background: itmPut ? "rgba(255,90,95,0.06)" : "transparent" }}
              >
                <span className="si-opt-bid">{fmtPrice(putBid)}</span>
                <span className="si-opt-ask">{fmtPrice(putAsk)}</span>
                {showGreeks && putG ? (
                  <>
                    <span className="si-opt-greek" style={{ color: "#ff5a5f" }}>{fmtGreek(putG.delta)}</span>
                    <span className="si-opt-greek">{fmtGreek(putG.gamma, 4)}</span>
                    <span className="si-opt-greek" style={{ color: "#ff5a5f" }}>{fmtGreek(putG.theta)}</span>
                  </>
                ) : (
                  <>
                    <span className="si-opt-oi">{fmtOI(Math.round(putOI * 0.4))}</span>
                    <span className="si-opt-oi">{fmtOI(putOI)}</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: "4px 10px", fontSize: 9, color: "var(--si-text-muted)", borderTop: "1px solid var(--si-line)", display: "flex", gap: 12 }}>
        <span>Model: Black-Scholes</span>
        <span>r = {(r * 100).toFixed(1)}%</span>
        <span>IV = {(iv * 100).toFixed(0)}%</span>
        <span>T = {expiries[expiryIdx].daysOut}d</span>
        <span style={{ marginLeft: "auto", color: "rgba(185,205,224,0.35)" }}>Simulated — not real market data</span>
      </div>
    </div>
  );
}
