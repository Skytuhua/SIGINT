"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { TICKER_PRICES } from "../TickerDetailOverlay";

interface Position {
  sym: string;
  shares: number;
  avgCost: number;
}

const LS_KEY = "wv-market-portfolio";

function loadPositions(): Position[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePositions(pos: Position[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(pos));
}

interface Props {
  onTickerClick?: (sym: string) => void;
}

export default function MarketPortfolioTab({ onTickerClick }: Props) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [addSym, setAddSym] = useState("");
  const [addShares, setAddShares] = useState("");
  const [addCost, setAddCost] = useState("");
  const [addErr, setAddErr] = useState("");
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      setPositions(loadPositions());
    }
  }, []);

  useEffect(() => {
    if (initialized.current) savePositions(positions);
  }, [positions]);

  function addPosition() {
    setAddErr("");
    const sym = addSym.trim().toUpperCase();
    if (!sym) { setAddErr("Symbol required"); return; }
    const shares = parseFloat(addShares);
    if (!shares || shares <= 0) { setAddErr("Invalid shares"); return; }
    const cost = parseFloat(addCost);
    if (!cost || cost <= 0) { setAddErr("Invalid cost"); return; }
    setPositions((prev) => {
      const idx = prev.findIndex((p) => p.sym === sym);
      if (idx >= 0) {
        // Weighted average
        const old = prev[idx];
        const totalShares = old.shares + shares;
        const avgCost = (old.shares * old.avgCost + shares * cost) / totalShares;
        const next = [...prev];
        next[idx] = { sym, shares: totalShares, avgCost };
        return next;
      }
      return [...prev, { sym, shares, avgCost: cost }];
    });
    setAddSym(""); setAddShares(""); setAddCost("");
  }

  function removePosition(sym: string) {
    setPositions((prev) => prev.filter((p) => p.sym !== sym));
  }

  const enriched = useMemo(() => positions.map((p) => {
    const price = TICKER_PRICES[p.sym] ?? null;
    const value = price != null ? price * p.shares : null;
    const cost = p.avgCost * p.shares;
    const pnl = value != null ? value - cost : null;
    const pnlPct = pnl != null ? (pnl / cost) * 100 : null;
    return { ...p, price, value, pnl, pnlPct };
  }), [positions]);

  const totalValue = enriched.reduce((s, p) => s + (p.value ?? 0), 0);
  const totalCost = enriched.reduce((s, p) => s + p.avgCost * p.shares, 0);
  const totalPnl = totalValue - totalCost;

  // Sector exposure: group by known sector (from TICKER_PRICES keys → approximate)
  const SECTOR_MAP: Record<string, string> = {
    AAPL:"Technology",MSFT:"Technology",NVDA:"Technology",GOOGL:"Comm. Services",
    META:"Comm. Services",AMZN:"Consumer Cyclical",TSLA:"Consumer Cyclical",
    JPM:"Financials",XOM:"Energy",JNJ:"Healthcare",BRK:"Financials",
    V:"Financials",UNH:"Healthcare",WMT:"Consumer Staples",PG:"Consumer Staples",
    HD:"Consumer Cyclical",MA:"Financials",ORCL:"Technology",CSCO:"Technology",
    INTC:"Technology",AMD:"Technology",CRM:"Technology",NFLX:"Comm. Services",
    ADBE:"Technology",PYPL:"Financials",DIS:"Comm. Services",BA:"Industrials",
    GS:"Financials",MS:"Financials",BAC:"Financials",C:"Financials",
    WFC:"Financials",AXP:"Financials",BLK:"Financials",SCHW:"Financials",
    T:"Comm. Services",VZ:"Comm. Services",TMUS:"Comm. Services",
    CVX:"Energy",COP:"Energy",MRK:"Healthcare",PFE:"Healthcare",
    ABBV:"Healthcare",LLY:"Healthcare",TMO:"Healthcare",KO:"Consumer Staples",
    PEP:"Consumer Staples",MCD:"Consumer Staples",SBUX:"Consumer Cyclical",
    NKE:"Consumer Cyclical",SPY:"ETF",QQQ:"ETF",DIA:"ETF",IWM:"ETF",
    GLD:"Commodities",BTC:"Crypto",ETH:"Crypto",GC:"Commodities",WTI:"Energy",
  };

  const sectorExposure = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of enriched) {
      const sector = SECTOR_MAP[p.sym] ?? "Other";
      map[sector] = (map[sector] ?? 0) + (p.value ?? p.avgCost * p.shares);
    }
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
    return entries.map(([sector, val]) => ({ sector, pct: (val / total) * 100 }));
  }, [enriched]);

  const SECTOR_COLORS = ["#89e5ff","#36b37e","#ffab40","#ff5a5f","#c084fc","#f59e0b","#6ee7b7","#94a3b8"];

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", gap: 4 }}>
      {/* Left: summary + positions */}
      <div style={{ display: "flex", flexDirection: "column", width: 420, minWidth: 320, overflow: "hidden", gap: 4 }}>
        {/* Summary bar */}
        <div className="wv-market-panel" style={{ flex: "0 0 auto" }}>
          <div className="wv-market-panel-header">PORTFOLIO SUMMARY</div>
          <div style={{ display: "flex", gap: 0 }}>
            {[
              { label: "Total Value", value: `$${totalValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}` },
              { label: "Total P&L", value: `${totalPnl >= 0 ? "+" : ""}$${totalPnl.toLocaleString("en-US", { maximumFractionDigits: 0 })}`, color: totalPnl >= 0 ? "#36b37e" : "#ff5a5f" },
              { label: "Return", value: totalCost > 0 ? `${((totalPnl / totalCost) * 100).toFixed(2)}%` : "—", color: totalPnl >= 0 ? "#36b37e" : "#ff5a5f" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ flex: 1, padding: "8px 12px", borderRight: "1px solid var(--wv-line)" }}>
                <div style={{ fontSize: 9, color: "var(--wv-text-muted)", marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: color ?? "var(--wv-text)" }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Positions table */}
        <div className="wv-market-panel" style={{ flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div className="wv-market-panel-header">POSITIONS ({positions.length})</div>
          <div style={{ flex: "1 1 0", minHeight: 0, overflowY: "auto" }}>
            <div className="wv-port-table-header">
              <span>SYM</span><span>SHS</span><span>COST</span><span>PRICE</span><span>VALUE</span><span>P&L%</span><span>WT%</span><span></span>
            </div>
            {enriched.length === 0 && (
              <div style={{ padding: "16px 12px", fontSize: 10, color: "var(--wv-text-muted)", fontStyle: "italic" }}>
                No positions. Add one below.
              </div>
            )}
            {enriched.map((p) => {
              const weight = totalValue > 0 && p.value != null ? (p.value / totalValue) * 100 : null;
              return (
                <div key={p.sym} className="wv-port-table-row">
                  <span
                    className="wv-port-sym"
                    onClick={() => onTickerClick?.(p.sym)}
                    style={{ cursor: onTickerClick ? "pointer" : "default" }}
                  >
                    {p.sym}
                  </span>
                  <span>{p.shares.toLocaleString()}</span>
                  <span>${p.avgCost.toFixed(2)}</span>
                  <span>{p.price != null ? `$${p.price.toFixed(2)}` : "?"}</span>
                  <span>{p.value != null ? `$${p.value.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—"}</span>
                  <span style={{ color: (p.pnlPct ?? 0) >= 0 ? "#36b37e" : "#ff5a5f" }}>
                    {p.pnlPct != null ? `${p.pnlPct >= 0 ? "+" : ""}${p.pnlPct.toFixed(1)}%` : "—"}
                  </span>
                  <span style={{ color: "var(--wv-text-muted)" }}>{weight != null ? `${weight.toFixed(1)}%` : "—"}</span>
                  <span>
                    <button className="wv-port-del-btn" onClick={() => removePosition(p.sym)}>✕</button>
                  </span>
                </div>
              );
            })}
          </div>

          {/* Add position form */}
          <div style={{ borderTop: "1px solid var(--wv-line)", padding: "8px 10px" }}>
            <div style={{ fontSize: 9, color: "var(--wv-text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.07em" }}>Add Position</div>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <input
                className="wv-order-input"
                placeholder="SYM"
                style={{ width: 54 }}
                value={addSym}
                onChange={(e) => setAddSym(e.target.value.toUpperCase())}
              />
              <input
                className="wv-order-input"
                placeholder="Shares"
                type="number"
                style={{ width: 70 }}
                value={addShares}
                onChange={(e) => setAddShares(e.target.value)}
              />
              <input
                className="wv-order-input"
                placeholder="Avg Cost"
                type="number"
                style={{ width: 78 }}
                value={addCost}
                onChange={(e) => setAddCost(e.target.value)}
              />
              <button className="wv-order-send-btn buy" style={{ flex: "none", padding: "4px 12px", fontSize: 10 }} onClick={addPosition}>
                + ADD
              </button>
            </div>
            {addErr && <div style={{ fontSize: 9, color: "#ff5a5f", marginTop: 4 }}>{addErr}</div>}
          </div>
        </div>
      </div>

      {/* Right: charts */}
      <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        {/* Sector Exposure */}
        <div className="wv-market-panel" style={{ flex: "1 1 0", minHeight: 0 }}>
          <div className="wv-market-panel-header">SECTOR EXPOSURE</div>
          <div style={{ padding: "8px 14px", height: "calc(100% - 28px)", overflowY: "auto" }}>
            {sectorExposure.length === 0 && (
              <div style={{ fontSize: 10, color: "var(--wv-text-muted)", fontStyle: "italic", paddingTop: 8 }}>
                Add positions to see exposure
              </div>
            )}
            {sectorExposure.map(({ sector, pct }, i) => (
              <div key={sector} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 3 }}>
                  <span style={{ color: "var(--wv-text-muted)" }}>{sector}</span>
                  <span style={{ color: "var(--wv-text)", fontWeight: 600 }}>{pct.toFixed(1)}%</span>
                </div>
                <div style={{ height: 6, background: "rgba(185,205,224,0.08)", borderRadius: 2, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${pct}%`,
                      background: SECTOR_COLORS[i % SECTOR_COLORS.length],
                      borderRadius: 2,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* P&L per position */}
        <div className="wv-market-panel" style={{ flex: "1 1 0", minHeight: 0 }}>
          <div className="wv-market-panel-header">P&L BY POSITION</div>
          <div style={{ padding: "8px 14px", height: "calc(100% - 28px)", overflowY: "auto" }}>
            {enriched.length === 0 && (
              <div style={{ fontSize: 10, color: "var(--wv-text-muted)", fontStyle: "italic", paddingTop: 8 }}>
                No positions yet
              </div>
            )}
            {enriched.map((p) => {
              if (p.pnl == null) return null;
              const maxAbs = Math.max(...enriched.map((x) => Math.abs(x.pnl ?? 0)), 1);
              const barW = (Math.abs(p.pnl) / maxAbs) * 100;
              const isPos = p.pnl >= 0;
              return (
                <div key={p.sym} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 3 }}>
                    <span
                      style={{ color: "#89e5ff", cursor: onTickerClick ? "pointer" : "default" }}
                      onClick={() => onTickerClick?.(p.sym)}
                    >
                      {p.sym}
                    </span>
                    <span style={{ color: isPos ? "#36b37e" : "#ff5a5f", fontWeight: 600 }}>
                      {isPos ? "+" : ""}${p.pnl.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div style={{ height: 5, background: "rgba(185,205,224,0.08)", borderRadius: 2, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${barW}%`,
                        background: isPos ? "rgba(54,179,126,0.6)" : "rgba(255,90,95,0.6)",
                        borderRadius: 2,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
