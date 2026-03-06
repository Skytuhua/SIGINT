"use client";

import { useState, useMemo } from "react";
import { SCREENER_UNIVERSE, type ScreenerRow } from "../shared/screenerData";

type SortDir = "asc" | "desc";
type SortCol = keyof ScreenerRow;

interface Filters {
  sector: string;
  marketCap: string;
  pe: string;
  chg1d: string;
  volume: string;
}

const INITIAL_FILTERS: Filters = { sector: "ALL", marketCap: "ALL", pe: "ALL", chg1d: "ALL", volume: "ALL" };

const SECTORS = ["ALL", ...Array.from(new Set(SCREENER_UNIVERSE.map((r) => r.sector))).sort()];

interface Props {
  onTickerClick?: (sym: string) => void;
}

function ChgCell({ v }: { v: number }) {
  return (
    <span style={{ color: v > 0 ? "#36b37e" : v < 0 ? "#ff5a5f" : "var(--wv-text-muted)", fontWeight: 600 }}>
      {v > 0 ? "+" : ""}{v.toFixed(2)}%
    </span>
  );
}

function fmtCap(v: number): string {
  if (v >= 1000) return (v / 1000).toFixed(1) + "T";
  if (v >= 100) return v.toFixed(0) + "B";
  return v.toFixed(1) + "B";
}

export default function MarketScreenerTab({ onTickerClick }: Props) {
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [sortCol, setSortCol] = useState<SortCol>("marketCapB");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function setFilter<K extends keyof Filters>(key: K, val: string) {
    setFilters((prev) => ({ ...prev, [key]: val }));
  }

  function handleSort(col: SortCol) {
    if (col === sortCol) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  }

  const results = useMemo(() => {
    let rows = [...SCREENER_UNIVERSE];

    if (filters.sector !== "ALL") rows = rows.filter((r) => r.sector === filters.sector);

    if (filters.marketCap !== "ALL") {
      if (filters.marketCap === ">500B")  rows = rows.filter((r) => r.marketCapB > 500);
      if (filters.marketCap === "100-500B") rows = rows.filter((r) => r.marketCapB >= 100 && r.marketCapB <= 500);
      if (filters.marketCap === "<100B")  rows = rows.filter((r) => r.marketCapB < 100);
    }

    if (filters.pe !== "ALL") {
      if (filters.pe === "<15")  rows = rows.filter((r) => r.pe != null && r.pe < 15);
      if (filters.pe === "15-30") rows = rows.filter((r) => r.pe != null && r.pe >= 15 && r.pe <= 30);
      if (filters.pe === ">30")  rows = rows.filter((r) => r.pe != null && r.pe > 30);
      if (filters.pe === "N/A")  rows = rows.filter((r) => r.pe == null);
    }

    if (filters.chg1d !== "ALL") {
      if (filters.chg1d === ">2%")  rows = rows.filter((r) => r.chg1d > 2);
      if (filters.chg1d === "0-2%") rows = rows.filter((r) => r.chg1d >= 0 && r.chg1d <= 2);
      if (filters.chg1d === "<0%")  rows = rows.filter((r) => r.chg1d < 0);
    }

    if (filters.volume !== "ALL") {
      if (filters.volume === ">50M") rows = rows.filter((r) => r.avgVolM > 50);
      if (filters.volume === "10-50M") rows = rows.filter((r) => r.avgVolM >= 10 && r.avgVolM <= 50);
      if (filters.volume === "<10M") rows = rows.filter((r) => r.avgVolM < 10);
    }

    rows.sort((a, b) => {
      const av = a[sortCol] ?? -Infinity;
      const bv = b[sortCol] ?? -Infinity;
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = av as number;
      const bn = bv as number;
      return sortDir === "asc" ? an - bn : bn - an;
    });

    return rows.slice(0, 50);
  }, [filters, sortCol, sortDir]);

  function SortHeader({ col, label, align = "right" }: { col: SortCol; label: string; align?: string }) {
    const active = sortCol === col;
    return (
      <th
        className="wv-screen-th"
        style={{ textAlign: align as "left" | "right" | "center", cursor: "pointer", userSelect: "none" }}
        onClick={() => handleSort(col)}
      >
        {label} {active ? (sortDir === "desc" ? "↓" : "↑") : ""}
      </th>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Filter bar */}
      <div className="wv-screen-filter-bar">
        <label className="wv-screen-filter-label">Sector</label>
        <select className="wv-screen-select" value={filters.sector} onChange={(e) => setFilter("sector", e.target.value)}>
          {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <label className="wv-screen-filter-label">Mkt Cap</label>
        <select className="wv-screen-select" value={filters.marketCap} onChange={(e) => setFilter("marketCap", e.target.value)}>
          {["ALL", ">500B", "100-500B", "<100B"].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <label className="wv-screen-filter-label">P/E</label>
        <select className="wv-screen-select" value={filters.pe} onChange={(e) => setFilter("pe", e.target.value)}>
          {["ALL", "<15", "15-30", ">30", "N/A"].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <label className="wv-screen-filter-label">1D Chg</label>
        <select className="wv-screen-select" value={filters.chg1d} onChange={(e) => setFilter("chg1d", e.target.value)}>
          {["ALL", ">2%", "0-2%", "<0%"].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <label className="wv-screen-filter-label">Avg Vol</label>
        <select className="wv-screen-select" value={filters.volume} onChange={(e) => setFilter("volume", e.target.value)}>
          {["ALL", ">50M", "10-50M", "<10M"].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <button
          className="wv-market-tab"
          style={{ marginLeft: "auto", padding: "2px 10px" }}
          onClick={() => setFilters(INITIAL_FILTERS)}
        >
          RESET
        </button>
        <span style={{ fontSize: 10, color: "var(--wv-text-muted)", alignSelf: "center" }}>
          {results.length} results
        </span>
      </div>

      {/* Table */}
      <div style={{ flex: "1 1 0", minHeight: 0, overflowY: "auto" }}>
        <table className="wv-screen-table">
          <thead>
            <tr>
              <SortHeader col="sym"           label="SYM"    align="left" />
              <SortHeader col="name"          label="NAME"   align="left" />
              <SortHeader col="sector"        label="SECTOR" align="left" />
              <SortHeader col="price"         label="PRICE" />
              <SortHeader col="chg1d"         label="1D%" />
              <SortHeader col="chg1w"         label="1W%" />
              <SortHeader col="marketCapB"    label="MKTCAP" />
              <SortHeader col="pe"            label="P/E" />
              <SortHeader col="ps"            label="P/S" />
              <SortHeader col="roe"           label="ROE%" />
              <SortHeader col="grossMarginPct" label="GM%" />
              <SortHeader col="beta"          label="BETA" />
              <SortHeader col="divYield"      label="DIV%" />
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr
                  key={r.sym}
                  className="wv-screen-row"
                  onClick={() => onTickerClick?.(r.sym)}
                  style={{ cursor: onTickerClick ? "pointer" : "default" }}
                >
                  <td className="wv-screen-td" style={{ color: "#89e5ff", fontWeight: 700 }}>{r.sym}</td>
                  <td className="wv-screen-td wv-screen-td-name">{r.name}</td>
                  <td className="wv-screen-td" style={{ color: "var(--wv-text-muted)" }}>{r.sector}</td>
                  <td className="wv-screen-td wv-screen-td-num">${r.price.toFixed(2)}</td>
                  <td className="wv-screen-td wv-screen-td-num"><ChgCell v={r.chg1d} /></td>
                  <td className="wv-screen-td wv-screen-td-num"><ChgCell v={r.chg1w} /></td>
                  <td className="wv-screen-td wv-screen-td-num">{fmtCap(r.marketCapB)}</td>
                  <td className="wv-screen-td wv-screen-td-num">{r.pe != null ? r.pe.toFixed(1) : "—"}</td>
                  <td className="wv-screen-td wv-screen-td-num">{r.ps.toFixed(1)}</td>
                  <td className="wv-screen-td wv-screen-td-num">{r.roe != null ? r.roe.toFixed(0) + "%" : "—"}</td>
                  <td className="wv-screen-td wv-screen-td-num">{r.grossMarginPct.toFixed(0)}%</td>
                  <td className="wv-screen-td wv-screen-td-num">{r.beta.toFixed(2)}</td>
                  <td className="wv-screen-td wv-screen-td-num">{r.divYield.toFixed(2)}%</td>
                </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
