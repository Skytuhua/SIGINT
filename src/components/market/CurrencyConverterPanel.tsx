"use client";

import { useState, useMemo } from "react";
import { useMarketData } from "../../hooks/useMarketData";
import type { QuotesResponse } from "../../lib/server/news/providers/marketTypes";

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD"] as const;
type Ccy = typeof CURRENCIES[number];

// Yahoo Finance symbols for each currency vs USD
const FX_SYMBOLS = ["EURUSD=X", "GBPUSD=X", "JPY=X", "CHF=X", "CAD=X", "AUDUSD=X", "NZDUSD=X"];
const ENDPOINT = `/api/market/quotes?symbols=${FX_SYMBOLS.join(",")}`;
const EMPTY: QuotesResponse = { quotes: {}, degraded: true, timestamp: "" };

// Map currency to its USD rate (how many USD per 1 unit of that currency)
function buildRates(quotes: Record<string, { price?: number }>): Record<Ccy, number | null> {
  const get = (sym: string) => {
    const price = quotes[sym]?.price;
    return typeof price === "number" && Number.isFinite(price) && price > 0 ? price : null;
  };
  const inverse = (sym: string) => { const value = get(sym); return value == null ? null : 1 / value; };
  return { USD: 1, EUR: get("EURUSD=X"), GBP: get("GBPUSD=X"), JPY: inverse("JPY=X"),
    CHF: inverse("CHF=X"), CAD: inverse("CAD=X"), AUD: get("AUDUSD=X"), NZD: get("NZDUSD=X") };
}

interface Props {
  style?: React.CSSProperties;
}

export default function CurrencyConverterPanel({ style }: Props) {
  const { data, isLive } = useMarketData<QuotesResponse>(ENDPOINT, 60_000, EMPTY);
  const [fromCcy, setFromCcy] = useState<Ccy>("USD");
  const [toCcy, setToCcy] = useState<Ccy>("EUR");
  const [amount, setAmount] = useState("1000");

  const rates = useMemo(() => buildRates(data.quotes ?? {}), [data]);

  const converted = useMemo(() => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return null;
    const fromRate = rates[fromCcy];
    const toRate = rates[toCcy];
    if (!fromRate || !toRate) return null;
    return amt * (fromRate / toRate);
  }, [amount, fromCcy, toCcy, rates]);

  const fromRate = rates[fromCcy];
  const toRate = rates[toCcy];
  const effectiveRate = fromRate != null && toRate != null ? fromRate / toRate : null;
  const selectedLive = isLive && effectiveRate != null && fromCcy !== toCcy;

  function swap() {
    setFromCcy(toCcy);
    setToCcy(fromCcy);
  }

  // Format with appropriate decimals (JPY gets 0, others get 2-4)
  function fmtResult(val: number, ccy: Ccy): string {
    const decimals = ccy === "JPY" ? 0 : 2;
    return val.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  function fmtRate(val: number): string {
    return val.toFixed(4);
  }

  return (
    <div className="si-market-panel" style={style}>
      <div className="si-market-panel-header">
        <span className="si-market-panel-title">Currency Converter</span>
        <span className={`si-market-panel-badge ${selectedLive ? "is-live" : "is-static"}`}>
          {effectiveRate == null ? "UNAVAILABLE" : selectedLive ? "LIVE" : fromCcy === toCcy ? "IDENTITY" : "STALE"}
        </span>
      </div>
      <div className="si-market-panel-body" style={{ padding: "12px 14px" }}>
        {/* Amount */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, color: "var(--si-text-muted)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>Amount</div>
          <input
            className="si-order-input"
            type="number"
            style={{ width: "100%" }}
            placeholder="1000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        {/* FROM / SWAP / TO row */}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color: "var(--si-text-muted)", marginBottom: 3, textTransform: "uppercase" }}>From</div>
            <select
              className="si-screen-select"
              style={{ width: "100%" }}
              value={fromCcy}
              onChange={(e) => setFromCcy(e.target.value as Ccy)}
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <button
            onClick={swap}
            style={{
              background: "none", border: "1px solid var(--si-line)", borderRadius: 3,
              color: "#89e5ff", cursor: "pointer", padding: "4px 10px", fontSize: 12,
              marginBottom: 1, lineHeight: 1,
            }}
            title="Swap currencies"
          >
            ⇄
          </button>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color: "var(--si-text-muted)", marginBottom: 3, textTransform: "uppercase" }}>To</div>
            <select
              className="si-screen-select"
              style={{ width: "100%" }}
              value={toCcy}
              onChange={(e) => setToCcy(e.target.value as Ccy)}
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Result */}
        <div style={{ marginTop: 12, borderTop: "1px solid var(--si-line)", paddingTop: 10 }}>
          {converted != null ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 10, color: "var(--si-text-muted)" }}>
                  {parseFloat(amount).toLocaleString()} {fromCcy} =
                </span>
                <span style={{ fontSize: 18, fontWeight: 700, color: "#89e5ff" }}>
                  {fmtResult(converted, toCcy)} {toCcy}
                </span>
              </div>
              {effectiveRate != null && (
                <div style={{ fontSize: 9, color: "var(--si-text-muted)", marginTop: 4, textAlign: "right" }}>
                  1 {fromCcy} = {fmtRate(effectiveRate)} {toCcy}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 10, color: "var(--si-text-muted)", fontStyle: "italic" }}>
              {effectiveRate == null ? "Rate unavailable for selected currencies" : "Enter an amount to convert"}
            </div>
          )}
        </div>
      </div>
      <div className="si-market-panel-footer">
        {effectiveRate == null ? "Missing quote for selected currency pair" : selectedLive ? "Rates via Yahoo Finance · 60s refresh" : fromCcy === toCcy ? "Same-currency conversion" : "Last received rates · stale"}
      </div>
    </div>
  );
}
