"use client";

import React from "react";
import { useMarketData } from "../../hooks/useMarketData";
import type { QuotesResponse } from "../../lib/server/news/providers/marketTypes";
import Term from "./shared/Term";

interface CommodityDef {
  sym: string;
  yfSym: string;
  name: string;
  unit: string;
}

interface CommodityGroupDef {
  label: string;
  icon: string;
  items: CommodityDef[];
}

const GROUPS: CommodityGroupDef[] = [
  {
    label: "ENERGY",
    icon: "⚡",
    items: [
      { sym: "WTI",  yfSym: "CL=F", name: "Crude Oil WTI", unit: "$/bbl" },
      { sym: "BRT",  yfSym: "BZ=F", name: "Brent Crude",   unit: "$/bbl" },
      { sym: "NG",   yfSym: "NG=F", name: "Natural Gas",   unit: "$/mmBtu" },
      { sym: "RB",   yfSym: "RB=F", name: "RBOB Gasoline", unit: "$/gal" },
      { sym: "HO",   yfSym: "HO=F", name: "Heating Oil",   unit: "$/gal" },
    ],
  },
  {
    label: "METALS",
    icon: "◈",
    items: [
      { sym: "GC",   yfSym: "GC=F", name: "Gold",     unit: "$/oz" },
      { sym: "SI",   yfSym: "SI=F", name: "Silver",   unit: "$/oz" },
      { sym: "HG",   yfSym: "HG=F", name: "Copper",   unit: "$/lb" },
      { sym: "PL",   yfSym: "PL=F", name: "Platinum", unit: "$/oz" },
      { sym: "PA",   yfSym: "PA=F", name: "Palladium", unit: "$/oz" },
    ],
  },
  {
    label: "AGRICULTURE",
    icon: "◎",
    items: [
      { sym: "ZC",   yfSym: "ZC=F", name: "Corn",     unit: "¢/bu" },
      { sym: "ZW",   yfSym: "ZW=F", name: "Wheat",    unit: "¢/bu" },
      { sym: "ZS",   yfSym: "ZS=F", name: "Soybeans", unit: "¢/bu" },
      { sym: "KC",   yfSym: "KC=F", name: "Coffee",   unit: "¢/lb" },
      { sym: "CT",   yfSym: "CT=F", name: "Cotton",   unit: "¢/lb" },
    ],
  },
];

const COMMOD_SYM_TERMS: Record<string, string> = {
  WTI: "WTI", BRT: "BRENT", NG: "NG", GC: "GC", HG: "HG",
};

const COMMOD_NAME_TERMS: Record<string, { id: string; label: string }> = {
  "Crude Oil WTI": { id: "WTI", label: "Crude Oil WTI" },
  "Brent Crude":   { id: "BRENT", label: "Brent Crude" },
  "Natural Gas":   { id: "NG", label: "Natural Gas" },
  "Gold":          { id: "GC", label: "Gold" },
  "Copper":        { id: "HG", label: "Copper" },
};

function renderCommodSym(sym: string) {
  const id = COMMOD_SYM_TERMS[sym];
  return id ? <Term id={id}>{sym}</Term> : <>{sym}</>;
}

function renderCommodName(name: string) {
  const t = COMMOD_NAME_TERMS[name];
  return t ? <Term id={t.id}>{t.label}</Term> : <>{name}</>;
}

function renderUnit(unit: string) {
  if (unit === "¢/bu") return <Term id="CENTS_BU">{unit}</Term>;
  return <>{unit}</>;
}

const ALL_YF_SYMS = GROUPS.flatMap((g) => g.items.map((i) => i.yfSym));
const ENDPOINT = `/api/market/quotes?symbols=${ALL_YF_SYMS.join(",")}`;

const EMPTY: QuotesResponse = { quotes: {}, degraded: true, timestamp: "" };

interface Props {
  style?: React.CSSProperties;
}

export default function CommoditiesBoard({ style }: Props) {
  const { data, isLive } = useMarketData<QuotesResponse>(ENDPOINT, 60_000, EMPTY);
  const quotes = data.quotes ?? {};

  return (
    <div className="si-market-panel" style={style}>
      <div className="si-market-panel-header">
        <span className="si-market-panel-title">Commodities</span>
        <span style={{ fontSize: 9, color: "var(--si-text-muted)", letterSpacing: "0.04em" }}>
          SPOT PRICES · FUTURES
        </span>
        <span className={`si-market-panel-badge ${isLive ? "is-live" : "is-static"}`}>
          {isLive ? "LIVE" : "STATIC"}
        </span>
      </div>
      <div className="si-market-panel-body" style={{ padding: "0 4px 4px" }}>
        {GROUPS.map((group) => (
          <div key={group.label}>
            <div className="si-market-commod-section-label">
              <span>{group.label}</span>
            </div>
            <div className="si-market-commod-grid">
              {group.items.map((item) => {
                const q = quotes[item.yfSym];
                const price = q?.price ?? 0;
                const chg = q?.changePercent ?? 0;
                const chgClass = chg > 0 ? "is-up" : chg < 0 ? "is-down" : "is-flat";
                const sign = chg > 0 ? "+" : "";

                let priceStr: string;
                if (price >= 100) {
                  priceStr = `$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
                } else {
                  priceStr = `$${price.toFixed(price < 10 ? 3 : 2)}`;
                }

                const dayLow = q?.dayLow ?? 0;
                const dayHigh = q?.dayHigh ?? 0;
                const w52Low = q?.fiftyTwoWeekLow ?? 0;
                const w52High = q?.fiftyTwoWeekHigh ?? 0;
                const w52Range = w52High - w52Low;
                const w52Pct = w52Range > 0 ? ((price - w52Low) / w52Range) * 100 : 50;

                const fmtP = (v: number) => {
                  if (!v) return "—";
                  if (v >= 100) return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
                  return `$${v.toFixed(v < 10 ? 2 : 2)}`;
                };

                return (
                  <div key={item.sym} className="si-market-commod-card">
                    <div className="si-market-commod-card-top">
                      <span className="si-market-commod-sym">{renderCommodSym(item.sym)}</span>
                      <span className={`si-market-commod-chg ${chgClass}`}>
                        {q ? `${sign}${chg.toFixed(2)}%` : "—"}
                      </span>
                    </div>
                    <div className="si-market-commod-name" title={item.name}>{renderCommodName(item.name)}</div>
                    <div className="si-market-commod-card-mid">
                      <span className="si-market-commod-price">{q ? priceStr : "—"}</span>
                    </div>
                    {q && dayLow > 0 && (
                      <div className="si-market-commod-day-range">
                        <span>L {fmtP(dayLow)}</span>
                        <span>H {fmtP(dayHigh)}</span>
                      </div>
                    )}
                    {q && w52Low > 0 && (
                      <div className="si-market-commod-52w">
                        <div className="si-market-commod-range-bar">
                          <div className="si-market-commod-range-fill" style={{ width: `${Math.min(100, Math.max(0, w52Pct))}%` }} />
                          <div className="si-market-commod-range-dot" style={{ left: `${Math.min(100, Math.max(0, w52Pct))}%` }} />
                        </div>
                        <div className="si-market-commod-52w-labels">
                          <span>{fmtP(w52Low)}</span>
                          <span style={{ fontSize: 8.5, color: "var(--si-text-muted)", letterSpacing: "0.04em" }}>52W</span>
                          <span>{fmtP(w52High)}</span>
                        </div>
                      </div>
                    )}
                    <div className="si-market-commod-card-bot">
                      <span className="si-market-commod-unit">{renderUnit(item.unit)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="si-market-panel-footer">
        {isLive ? "CME · NYMEX · Yahoo Finance · 60s refresh" : "Waiting for data…"}
      </div>
    </div>
  );
}
