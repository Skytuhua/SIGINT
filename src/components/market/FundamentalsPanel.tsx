"use client";

import { useState } from "react";
import { getFundamentals, type TickerFundamentals } from "./shared/staticFundamentals";
import { MiniSparkline } from "./shared/MiniSparkline";
import Term from "./shared/Term";

type FundTab = "OVERVIEW" | "INCOME" | "BALANCE" | "CASH FLOW";

function fmtM(v: number, decimals = 1): string {
  if (v === 0) return "—";
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + "T";
  if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(decimals) + "B";
  return v.toFixed(0) + "M";
}

function fmtPct(v: number): string {
  return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
}

function MetricCard({ label, value }: { label: React.ReactNode; value: string }) {
  return (
    <div className="si-fund-metric-card">
      <span className="si-fund-metric-label">{label}</span>
      <span className="si-fund-metric-value">{value}</span>
    </div>
  );
}

function FundRow({ label, values, years, isBold }: { label: string; values: number[]; years: number[]; isBold?: boolean }) {
  const up = values[values.length - 1] >= values[0];
  const nonZero = values.some((v) => v !== 0);
  if (!nonZero) return null;
  return (
    <tr className={`si-fund-tr${isBold ? " is-bold" : ""}`}>
      <td className="si-fund-td-label">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="si-fund-td-val">{fmtM(v)}</td>
      ))}
      <td className="si-fund-td-spark">
        <MiniSparkline prices={values} up={up} width={40} height={12} />
      </td>
    </tr>
  );
}

interface Props {
  sym: string;
}

export default function FundamentalsPanel({ sym }: Props) {
  const [tab, setTab] = useState<FundTab>("OVERVIEW");
  const fund = getFundamentals(sym);

  if (!fund) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 28, color: "var(--si-text-muted)" }}>⊘</span>
        <span style={{ fontSize: 12, color: "var(--si-text-muted)" }}>Fundamental data unavailable for <strong style={{ color: "var(--si-text)" }}>{sym}</strong></span>
        <span style={{ fontSize: 10, color: "var(--si-text-muted)" }}>Coverage: AAPL, NVDA, MSFT, GOOGL, META, AMZN, TSLA, XOM, JPM, SPY, QQQ</span>
      </div>
    );
  }

  const m = fund.metrics;
  const TABS: FundTab[] = ["OVERVIEW", "INCOME", "BALANCE", "CASH FLOW"];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Description */}
      <div style={{ padding: "6px 12px", fontSize: 10, color: "var(--si-text-muted)", borderBottom: "1px solid var(--si-line)", lineHeight: 1.5 }}>
        <strong style={{ color: "#89e5ff", marginRight: 6 }}>{fund.name}</strong>
        <span>{fund.sector}</span>
        <span style={{ marginLeft: 8, color: "rgba(185,205,224,0.5)" }}>Market Cap: </span>
        <span style={{ color: "var(--si-text)" }}>${m.marketCapB.toLocaleString()}B</span>
      </div>
      <div style={{ padding: "4px 12px 6px", fontSize: 9.5, color: "var(--si-text-muted)", lineHeight: 1.45, borderBottom: "1px solid var(--si-line)", overflow: "hidden", maxHeight: 50 }}>
        {fund.description}
      </div>

      {/* Sub-tabs */}
      <div className="si-fund-tab-row">
        {TABS.map((t) => (
          <button key={t} className={`si-fund-tab${tab === t ? " is-active" : ""}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: "1 1 0", minHeight: 0, overflowY: "auto", padding: "8px 12px" }}>
        {tab === "OVERVIEW" && (
          <div>
            <div className="si-fund-metric-grid">
              <MetricCard label={<Term id="PE">P/E</Term>}          value={m.pe != null ? m.pe.toFixed(1) + "x" : "N/A"} />
              <MetricCard label={<Term id="PB">P/B</Term>}          value={m.pb.toFixed(1) + "x"} />
              <MetricCard label={<Term id="PS">P/S</Term>}          value={m.ps.toFixed(1) + "x"} />
              <MetricCard label={<Term id="EV_EBITDA">EV/EBITDA</Term>}    value={m.evEbitda != null ? m.evEbitda.toFixed(1) + "x" : "N/A"} />
              <MetricCard label={<Term id="ROE">ROE</Term>}          value={m.roe.toFixed(1) + "%"} />
              <MetricCard label="Debt/Equity"  value={m.debtEquity.toFixed(2) + "x"} />
              <MetricCard label={<Term id="GM">Gross Margin</Term>} value={m.grossMarginPct.toFixed(1) + "%"} />
              <MetricCard label={<Term id="NET_MGN">Net Margin</Term>}   value={m.netMarginPct.toFixed(1) + "%"} />
              <MetricCard label={<Term id="BETA">Beta</Term>}         value={m.beta.toFixed(2)} />
              <MetricCard label={<Term id="DIV_YIELD">Div Yield</Term>}    value={m.divYield.toFixed(2) + "%"} />
              <MetricCard label="Sector"       value={fund.sector} />
            </div>
          </div>
        )}

        {tab === "INCOME" && (
          <table className="si-fund-table">
            <thead>
              <tr>
                <th className="si-fund-th">($M)</th>
                {fund.income.years.map((y) => <th key={y} className="si-fund-th">{y}</th>)}
                <th className="si-fund-th">TREND</th>
              </tr>
            </thead>
            <tbody>
              <FundRow label="Revenue"           values={fund.income.revenue}          years={fund.income.years} isBold />
              <FundRow label="Gross Profit"      values={fund.income.grossProfit}      years={fund.income.years} />
              <FundRow label="Operating Income"  values={fund.income.operatingIncome}  years={fund.income.years} />
              <FundRow label="Net Income"        values={fund.income.netIncome}        years={fund.income.years} isBold />
              <FundRow label="EPS (Diluted)"     values={fund.income.eps}              years={fund.income.years} />
              {/* EPS term is explained via the glossary sidebar */}
            </tbody>
          </table>
        )}

        {tab === "BALANCE" && (
          <table className="si-fund-table">
            <thead>
              <tr>
                <th className="si-fund-th">($M)</th>
                {fund.balanceSheet.years.map((y) => <th key={y} className="si-fund-th">{y}</th>)}
                <th className="si-fund-th">TREND</th>
              </tr>
            </thead>
            <tbody>
              <FundRow label="Total Assets"      values={fund.balanceSheet.totalAssets}      years={fund.balanceSheet.years} isBold />
              <FundRow label="Total Liabilities" values={fund.balanceSheet.totalLiabilities} years={fund.balanceSheet.years} />
              <FundRow label="Equity"            values={fund.balanceSheet.equity}            years={fund.balanceSheet.years} isBold />
              <FundRow label="Cash & Equiv."     values={fund.balanceSheet.cash}              years={fund.balanceSheet.years} />
              <FundRow label="Long-Term Debt"    values={fund.balanceSheet.longTermDebt}     years={fund.balanceSheet.years} />
            </tbody>
          </table>
        )}

        {tab === "CASH FLOW" && (
          <table className="si-fund-table">
            <thead>
              <tr>
                <th className="si-fund-th">($M)</th>
                {fund.cashFlow.years.map((y) => <th key={y} className="si-fund-th">{y}</th>)}
                <th className="si-fund-th">TREND</th>
              </tr>
            </thead>
            <tbody>
              <FundRow label="Operating CF"  values={fund.cashFlow.operatingCF}    years={fund.cashFlow.years} isBold />
              <FundRow label="CapEx"         values={fund.cashFlow.capex.map(Math.abs)} years={fund.cashFlow.years} />
              <FundRow label="Free Cash Flow" values={fund.cashFlow.freeCashFlow}  years={fund.cashFlow.years} isBold />
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
