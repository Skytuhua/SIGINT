"use client";

import { useEffect, useState, useRef } from "react";
import { useSIGINTStore } from "../../store";
import { useIsMobile } from "../../hooks/useIsMobile";
import { MiniSparkline } from "./shared/MiniSparkline";
import Term from "./shared/Term";

// ─── Static market data ────────────────────────────────────────────────────

const INDICES = {
  northAmerica: [
    { sym: "ES Mar'26",  price: 6862.00,  chg: -14.00,  pct: -0.20, spark: [6920,6910,6905,6895,6880,6870,6862] },
    { sym: "NQ Mar'26",  price: 25066,    chg: -61.75,  pct: -0.24, spark: [25200,25180,25160,25130,25100,25080,25066] },
    { sym: "RTY Mar'26", price: 2189.40,  chg: -8.20,   pct: -0.37, spark: [2210,2205,2200,2198,2195,2192,2189] },
    { sym: "YM Mar'26",  price: 43720,    chg: -95.00,  pct: -0.22, spark: [43900,43870,43840,43810,43780,43750,43720] },
  ],
  europe: [
    { sym: "DAX Mar'26", price: 24142,    chg: -97.00,  pct: -0.40, spark: [24350,24320,24290,24260,24230,24190,24142] },
    { sym: "CAC40",      price: 8139.50,  chg: -36.50,  pct: -0.44, spark: [8220,8205,8190,8175,8165,8152,8139] },
    { sym: "FTSE 100",   price: 8612.30,  chg: -22.10,  pct: -0.26, spark: [8670,8660,8648,8640,8632,8622,8612] },
    { sym: "IBEX 35",    price: 12841,    chg: +58.00,  pct: +0.45, spark: [12750,12760,12780,12800,12818,12830,12841] },
  ],
  asia: [
    { sym: "N225 Mar'26",price: 55140,    chg: +890,    pct: +1.64, spark: [54200,54400,54600,54700,54850,55000,55140] },
    { sym: "HSI Mar'26", price: 25276,    chg: +144,    pct: +0.57, spark: [25100,25120,25150,25180,25220,25250,25276] },
    { sym: "CSI 300",    price: 3982.40,  chg: -11.20,  pct: -0.28, spark: [4010,4005,4000,3996,3991,3987,3982] },
    { sym: "ASX 200",    price: 8241.70,  chg: +31.40,  pct: +0.38, spark: [8200,8208,8215,8222,8230,8237,8241] },
  ],
};

const FX_RATES = [
  { pair: "EUR/USD", rate: "1.1606", chg: -0.0028, pct: -0.24 },
  { pair: "GBP/USD", rate: "1.3342", chg: -0.0031, pct: -0.23 },
  { pair: "USD/JPY", rate: "148.92", chg: +0.32,   pct: +0.22 },
  { pair: "AUD/USD", rate: "0.6358", chg: -0.0012, pct: -0.19 },
];

const UPGRADES   = ["AEP","CPAC","DOW","LYB","PIPR","ROST","SO","SRE","SSRM","TGT"];
const DOWNGRADES = ["AVNT","CME","COO","DRTS","GTLB","GXO","LZ","SLNG","TBPH","TVGN","VMC","WBTN"];

type Impact = "high" | "med" | "low";
type Status = "past" | "today" | "future";
interface EconEvent { date: string; name: string; prior: string; forecast: string; actual: string | null; impact: Impact; status: Status; }

const ECON_EVENTS: EconEvent[] = [
  { date: "Feb 28", name: "PCE Price Index m/m",    prior: "0.3%",  forecast: "0.3%",  actual: "0.3%",  impact: "high", status: "past"   },
  { date: "Mar 03", name: "ISM Manufacturing PMI",   prior: "49.1",  forecast: "49.5",  actual: "50.3",  impact: "high", status: "past"   },
  { date: "Mar 04", name: "JOLTS Job Openings",      prior: "8.89M", forecast: "8.75M", actual: null,    impact: "high", status: "today"  },
  { date: "Mar 05", name: "ADP Non-Farm Employment", prior: "183K",  forecast: "148K",  actual: null,    impact: "high", status: "today"  },
  { date: "Mar 06", name: "Initial Jobless Claims",  prior: "215K",  forecast: "213K",  actual: null,    impact: "med",  status: "future" },
  { date: "Mar 07", name: "Non-Farm Payrolls",       prior: "256K",  forecast: "160K",  actual: null,    impact: "high", status: "future" },
  { date: "Mar 07", name: "Unemployment Rate",       prior: "4.1%",  forecast: "4.1%",  actual: null,    impact: "high", status: "future" },
  { date: "Mar 12", name: "CPI m/m",                 prior: "0.4%",  forecast: "0.3%",  actual: null,    impact: "high", status: "future" },
  { date: "Mar 12", name: "Core CPI m/m",            prior: "0.4%",  forecast: "0.3%",  actual: null,    impact: "high", status: "future" },
  { date: "Mar 19", name: "FOMC Rate Decision",      prior: "4.50%", forecast: "4.50%", actual: null,    impact: "high", status: "future" },
];

const EARNINGS = [
  { time: "LAST",  dot: "#ffab40", company: "AAPL APPLE INC",          note: "OCC Weekly options (W1)"            },
  { time: "LAST",  dot: "#ffab40", company: "APPLE INC (OCC)",         note: "Index options settlement"           },
  { time: "DIVD",  dot: "#a78bfa", company: "PYPL PAYPAL HOLDINGS INC",note: "Dividend · $0.14/sh · ex Mar 5"     },
  { time: "08:00", dot: "#36b37e", company: "COST COSTCO WHOLESALE",   note: "Q2 EPS est $4.09"                   },
  { time: "AFTER", dot: "#36b37e", company: "NVDA NVIDIA CORP",        note: "Q4 results — EPS est $0.85"         },
  { time: "AFTER", dot: "#ff5a5f", company: "MSFT MICROSOFT CORP",     note: "Q3 EPS est $3.14"                   },
  { time: "DIVD",  dot: "#a78bfa", company: "XOM EXXON MOBIL CORP",   note: "Dividend · $0.95/sh · ex Mar 6"     },
  { time: "AFTER", dot: "#36b37e", company: "AMZN AMAZON.COM INC",    note: "Q4 EPS est $1.48"                   },
];

const AI_SUMMARIES = [
  {
    title: "Macro Outlook",
    body: "Global equities face headwinds from renewed tariff rhetoric and Fed-speak suggesting rates remain restrictive through mid-2026. The S&P 500 consolidates near 6,850 support after the January surge, with breadth narrowing as tech leadership concentrates in AI infrastructure names. NVIDIA, AMD, and Broadcom account for 40% of Nasdaq year-to-date gains. Watch Friday NFP: a sub-150K print could revive rate-cut expectations and push the 10Y yield toward 4.15%.",
  },
  {
    title: "Geopolitical Risk Premium",
    body: "Middle East tensions remain elevated following U.S. naval engagement with Iranian forces in the Gulf of Oman. Brent crude futures spiked 3.2% intraday before settling at $82.40 as the Strait of Hormuz risk premium returned. Defense sector (RTX, LMT, NOC) outperformed by 180bps. Polymarket assigns 34% probability to a 30-day Strait closure disruption, up from 18% last week.",
  },
  {
    title: "Currency & Commodities",
    body: "The dollar index (DXY) softened 0.4% as risk appetite returned to European markets, with EUR/USD rebounding toward 1.1620 resistance. Gold held above $2,320/oz despite the dollar bounce, supported by central bank demand — PBoC added 8.3T oz in February. Natural gas futures surged 5.1% on cold snap forecasts across the Northeast U.S. Copper continues its grind higher on AI data center buildout demand.",
  },
];

const STATIC_HEADLINES = [
  "U.S. Navy Intercepts Iranian Drone Swarm Near Strait of Hormuz",
  "Fed's Waller: 'No Rush' on Rate Cuts as Labor Market Stays Hot",
  "NVIDIA Beats Q4 Estimates; Data Center Revenue Hits $18.4B",
  "EU Unveils $500B Defense Spending Pact Amid NATO Tensions",
  "China PMI Rebounds to 51.2, Strongest Reading Since June 2024",
  "Trump Signs Executive Order on Semiconductor Export Controls",
  "Brent Crude Spikes 3% on Gulf Shipping Insurance Surcharges",
  "IMF Cuts 2026 Global Growth Forecast to 2.8% on Trade Risks",
  "Bitcoin Holds $67K as ETF Inflows Reach Monthly Record",
  "Taiwan TSMC Eyes $40B Arizona Fab Expansion With Federal Aid",
  "Saudi Arabia Signals OPEC+ Production Cut Extension Through Q3",
  "Eurozone CPI Falls to 2.2% — ECB Rate Cut Now Seen as June",
];

const IMPACT_DOT: Record<Impact, string> = { high: "#ff5a5f", med: "#ffab40", low: "#36b37e" };

// ─── Main component ────────────────────────────────────────────────────────

interface Props { onClose: () => void; }

export default function DailyLineupModal({ onClose }: Props) {
  const isMobile = useIsMobile();
  const feedItems = useSIGINTStore((s) => s.news.feedItems);
  const [turnOff, setTurnOff] = useState(false);
  const [aiPage, setAiPage]   = useState(0);
  const [utc, setUtc]         = useState("");

  // Live UTC clock
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const hh = String(d.getUTCHours()).padStart(2, "0");
      const mm = String(d.getUTCMinutes()).padStart(2, "0");
      const ss = String(d.getUTCSeconds()).padStart(2, "0");
      setUtc(`${hh}:${mm}:${ss}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnOff]);

  function handleClose() {
    if (turnOff) localStorage.setItem("si-daily-lineup-disabled", "true");
    onClose();
  }

  const headlines = feedItems.length > 0
    ? feedItems.slice(0, 12).map((a) => a.headline)
    : STATIC_HEADLINES;

  const today = new Date();
  const dateLabel = today.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  }).toUpperCase();

  // ── Styles ──────────────────────────────────────────────────────────────

  const mono = 'var(--font-tech-mono), ui-monospace, Menlo, Monaco, "Courier New", monospace';

  const base: React.CSSProperties = {
    fontFamily: mono, color: "#b9cde0", fontSize: 11,
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: 9, letterSpacing: 2, color: "#7fa8c4",
    textTransform: "uppercase", marginBottom: 8,
  };

  const divider: React.CSSProperties = {
    borderBottom: "1px solid rgba(80,100,125,0.15)",
  };

  const leftCell: React.CSSProperties = {
    padding: "10px 12px",
    borderBottom: "1px solid rgba(80,100,125,0.12)",
  };

  const rightCell: React.CSSProperties = {
    ...leftCell,
    borderLeft: "1px solid rgba(80,100,125,0.15)",
  };

  const twoCol: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
    ...divider,
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,4,10,0.9)",
        zIndex: 9000,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: isMobile ? 0 : 16,
      }}
    >
      <div
        style={{
          ...base,
          background: "#020b12",
          border: "1px solid rgba(80,110,140,0.35)",
          width: "100%", maxWidth: isMobile ? "100%" : 920,
          height: isMobile ? "100dvh" : undefined,
          maxHeight: isMobile ? "100dvh" : "90vh",
          overflowY: "auto",
        }}
      >
        {/* ── HEADER ── */}
        <div style={{
          background: "rgba(80,110,140,0.08)",
          borderBottom: "1px solid rgba(80,110,140,0.25)",
          padding: isMobile ? "calc(8px + env(safe-area-inset-top, 0px)) 14px 8px" : "8px 14px",
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          position: "sticky", top: 0, zIndex: 2,
        }}>
          <span style={{ color: "#7fa8c4", fontWeight: 700, fontSize: 10, letterSpacing: 2 }}>
            SIGINT · DAILY LINEUP
          </span>
          <span style={{ fontSize: 9, color: "#5f7488", letterSpacing: 1 }}>
            NORTH AMERICAN EDITION
          </span>
          <span style={{ fontSize: 9, color: "#8da3b8", marginLeft: "auto" }}>{dateLabel}</span>
          <span style={{ fontSize: 10, color: "#7fa8c4", letterSpacing: 1 }}>◈ {utc} UTC</span>
          <button
            onClick={handleClose}
            style={{ background: "none", border: "none", color: "#5f7488", fontSize: isMobile ? 18 : 14, cursor: "pointer", lineHeight: 1, padding: isMobile ? "8px 12px" : "0 2px", minWidth: isMobile ? 44 : undefined, minHeight: isMobile ? 44 : undefined }}
            title="Close Daily Lineup"
          >✕</button>
        </div>

        {/* ── WORLD MARKETS STRIP ── */}
        <div style={{ padding: "10px 14px", ...divider }}>
          <div style={sectionTitle}>World Markets</div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: isMobile ? 8 : 16 }}>
            {([
              { label: "North America", items: INDICES.northAmerica },
              { label: "Europe",        items: INDICES.europe        },
              { label: "Asia",          items: INDICES.asia          },
            ] as const).map(({ label, items }) => (
              <div key={label}>
                <div style={{ fontSize: 9, color: "#5f7488", letterSpacing: 1, marginBottom: 5 }}>
                  {label}
                </div>
                {items.map((idx) => {
                  const up = idx.chg >= 0;
                  return (
                    <div key={idx.sym} style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr auto auto",
                      gap: 6, alignItems: "center",
                      padding: "3px 0",
                      borderBottom: "1px solid rgba(80,100,125,0.08)",
                    }}>
                      <span style={{ fontSize: 9, color: "#8da3b8", letterSpacing: 1, whiteSpace: "nowrap" }}>
                        {idx.sym}
                      </span>
                      <MiniSparkline prices={idx.spark} up={up} width={44} height={14} strokeWidth={1.1} />
                      <span style={{ fontSize: 10, color: "#b9cde0", textAlign: "right" }}>
                        {idx.price.toLocaleString()}
                      </span>
                      <span style={{ fontSize: 9, color: up ? "#36b37e" : "#ff5a5f", textAlign: "right", minWidth: 52 }}>
                        {up ? "+" : ""}{idx.pct.toFixed(2)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* F/X strip */}
          <div style={{
            marginTop: 10, paddingTop: 8,
            borderTop: "1px solid rgba(80,100,125,0.1)",
            display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center",
          }}>
            <span style={{ fontSize: 9, color: "#5f7488", letterSpacing: 1 }}><Term id="CROSS_RATE">F/X</Term></span>
            {FX_RATES.map((fx) => (
              <div key={fx.pair} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 9, color: "#8da3b8", letterSpacing: 1 }}>{fx.pair}</span>
                <span style={{ fontSize: 10, color: "#b9cde0" }}>{fx.rate}</span>
                <span style={{ fontSize: 9, color: fx.chg >= 0 ? "#36b37e" : "#ff5a5f" }}>
                  {fx.chg >= 0 ? "+" : ""}{fx.pct.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── ROW 1: Market Briefing + Analyst Activity ── */}
        <div style={twoCol}>
          <div style={leftCell}>
            <div style={sectionTitle}>Briefing.com Market Update</div>
            <p style={{ lineHeight: 1.65, color: "#8da3b8", margin: 0, fontSize: 11 }}>
              Equities rallied as oil stabilized and growth leadership returned — stocks posted a strong
              session with the S&amp;P 500 (+0.8%), Nasdaq Composite (+1.3%), and DJIA (+0.5%) finishing
              higher across the board for the first time this week. After pronounced volatility driven by
              tariff uncertainty and Fed commentary, the market trended higher with relative ease as
              mega-cap tech and AI infrastructure names led. Treasury yields dipped 4bps to 4.28% on the
              10Y as risk-on flows rotated out of safe havens. Commodities were mixed: gold held $2,320
              while WTI crude slipped 0.8% to $79.85 on demand revision concerns. The VIX compressed to
              14.8, its lowest level since late January, signaling a return of near-term complacency.
            </p>
            <div style={{ marginTop: 8, fontSize: 9, color: "#5f7488", letterSpacing: 1 }}>
              Briefing.com · Market Update · Static Placeholder
            </div>
          </div>

          <div style={rightCell}>
            <div style={sectionTitle}>Analyst Activity</div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: "#6e849d", letterSpacing: 1, marginBottom: 6 }}><Term id="OW">Upgrades</Term>:</div>
              <div>
                {UPGRADES.map((t) => (
                  <span key={t} style={{
                    display: "inline-block", padding: "1px 6px",
                    border: "1px solid rgba(80,110,140,0.4)", color: "#7fa8c4",
                    fontSize: 9, letterSpacing: 1, marginRight: 5, marginBottom: 5,
                  }}>{t}</span>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: "#6e849d", letterSpacing: 1, marginBottom: 6 }}><Term id="UW">Downgrades</Term>:</div>
              <div>
                {DOWNGRADES.map((t) => (
                  <span key={t} style={{
                    display: "inline-block", padding: "1px 6px",
                    border: "1px solid rgba(255,90,95,0.35)", color: "#ff5a5f",
                    fontSize: 9, letterSpacing: 1, marginRight: 5, marginBottom: 5,
                  }}>{t}</span>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 8, fontSize: 9, color: "#5f7488", letterSpacing: 1 }}>
              Fly on the Wall · Upgrade/Downgrade Bulletin · Static
            </div>
          </div>
        </div>

        {/* ── ROW 2: Economic Calendar + Earnings Calendar ── */}
        <div style={twoCol}>
          <div style={leftCell}>
            <div style={sectionTitle}>Economic Event Calendar</div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "48px 1fr 42px 42px 42px",
              gap: "2px 6px", marginBottom: 5,
            }}>
              {["DATE", "EVENT", "PRIOR", "FCST", "ACT"].map((h) => (
                <span key={h} style={{ fontSize: 8, color: "#5f7488", letterSpacing: 1 }}>{h}</span>
              ))}
            </div>
            {ECON_EVENTS.map((ev, i) => (
              <div key={i} style={{
                display: "grid",
                gridTemplateColumns: "48px 1fr 42px 42px 42px",
                gap: "2px 6px",
                padding: "3px 0",
                borderBottom: "1px solid rgba(80,100,125,0.08)",
                opacity: ev.status === "past" ? 0.48 : 1,
                background: ev.status === "today" ? "rgba(80,110,140,0.1)" : undefined,
                alignItems: "center",
              }}>
                <span style={{ fontSize: 9, color: "#6e849d", whiteSpace: "nowrap" }}>{ev.date}</span>
                <span style={{
                  fontSize: 9, color: "#b9cde0",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  <span style={{
                    width: 5, height: 5, borderRadius: "50%",
                    background: IMPACT_DOT[ev.impact],
                    display: "inline-block", flexShrink: 0,
                  }} />
                  {ev.name}
                </span>
                <span style={{ fontSize: 9, color: "#6e849d", textAlign: "right" }}>{ev.prior}</span>
                <span style={{ fontSize: 9, color: "#6e849d", textAlign: "right" }}>{ev.forecast}</span>
                <span style={{
                  fontSize: 9, textAlign: "right",
                  color: ev.actual == null
                    ? "#5f7488"
                    : parseFloat(ev.actual) >= parseFloat(ev.forecast)
                      ? "#36b37e"
                      : "#ff5a5f",
                }}>{ev.actual ?? "—"}</span>
              </div>
            ))}
            <div style={{ marginTop: 6, fontSize: 9, color: "#5f7488", letterSpacing: 1 }}>
              BLS · <Term id="FOMC">Fed Reserve</Term> · Static Placeholder
            </div>
          </div>

          <div style={rightCell}>
            <div style={sectionTitle}><Term id="EPS">Earnings</Term> Calendar</div>
            {EARNINGS.map((ev, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "38px 8px 1fr",
                gap: 8, padding: "4px 0",
                borderBottom: "1px solid rgba(80,100,125,0.08)",
                alignItems: "center",
              }}>
                <span style={{ fontSize: 9, color: "#6e849d" }}>{ev.time}</span>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: ev.dot, flexShrink: 0,
                  display: "inline-block",
                }} />
                <div style={{ overflow: "hidden" }}>
                  <div style={{ fontSize: 9, color: "#b9cde0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {ev.company}
                  </div>
                  <div style={{ fontSize: 8, color: "#5f7488", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {ev.note}
                  </div>
                </div>
              </div>
            ))}
            <div style={{ marginTop: 6, fontSize: 9, color: "#5f7488", letterSpacing: 1 }}>
              OCC · BofA · Static Placeholder
            </div>
          </div>
        </div>

        {/* ── ROW 3: Top Headlines + AI Summary ── */}
        <div style={twoCol}>
          <div style={leftCell}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={sectionTitle}>Today&apos;s Top Headlines</div>
              <span style={{ fontSize: 9, color: "#5f7488", letterSpacing: 1 }}>RNK</span>
            </div>
            {headlines.map((hl, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "18px 1fr 28px",
                gap: 6, padding: "3px 0",
                borderBottom: "1px solid rgba(80,100,125,0.08)",
                alignItems: "center",
              }}>
                <span style={{ fontSize: 9, color: "#5f7488", fontWeight: 600 }}>{i + 1}.</span>
                <span style={{
                  fontSize: 9, color: "#b9cde0",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{hl}</span>
                <span style={{ fontSize: 8, color: "#5f7488", textAlign: "right" }}>n/a</span>
              </div>
            ))}
            <div style={{ marginTop: 6, fontSize: 9, color: "#5f7488", letterSpacing: 1 }}>
              {feedItems.length > 0 ? "SIGINT Live Feed" : "Static Placeholder"}
            </div>
          </div>

          <div style={rightCell}>
            {/* AI summary header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ ...sectionTitle, marginBottom: 0 }}>★ AI SUMMARIES</div>
              <span style={{ fontSize: 9, color: "#6e849d", letterSpacing: 1 }}>Daily Overview</span>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={() => setAiPage((p) => (p - 1 + AI_SUMMARIES.length) % AI_SUMMARIES.length)}
                  style={{
                    background: "none", border: "1px solid rgba(80,100,125,0.3)",
                    color: "#6e849d", width: 20, height: 20,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontFamily: mono,
                  }}
                >‹</button>
                <span style={{ fontSize: 9, color: "#6e849d" }}>
                  {aiPage + 1} / {AI_SUMMARIES.length}
                </span>
                <button
                  onClick={() => setAiPage((p) => (p + 1) % AI_SUMMARIES.length)}
                  style={{
                    background: "none", border: "1px solid rgba(80,100,125,0.3)",
                    color: "#6e849d", width: 20, height: 20,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontFamily: mono,
                  }}
                >›</button>
              </div>
            </div>
            <div style={{ fontSize: 9, color: "#7fa8c4", letterSpacing: 1.5, marginBottom: 8 }}>
              {AI_SUMMARIES[aiPage].title}
            </div>
            <p style={{ fontSize: 10, color: "#8da3b8", lineHeight: 1.7, margin: 0 }}>
              {AI_SUMMARIES[aiPage].body}
            </p>
            <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 9, color: "#5f7488", letterSpacing: 1 }}>Portfolio News</span>
              <span style={{
                fontSize: 9, color: "#5f7488",
                border: "1px solid rgba(80,100,125,0.25)",
                padding: "1px 7px", letterSpacing: 1,
              }}>AI Disclosure</span>
            </div>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div style={{
          padding: "8px 14px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          borderTop: "1px solid rgba(80,110,140,0.22)",
          background: "rgba(80,110,140,0.04)",
          position: "sticky", bottom: 0, zIndex: 2,
          ...(isMobile
            ? {
                padding: "10px 14px calc(10px + env(safe-area-inset-bottom, 0px))",
                flexDirection: "column" as const,
                alignItems: "stretch" as const,
                gap: 10,
              }
            : null),
        }}>
          <label style={{
            display: "flex", alignItems: "center", gap: 8,
            cursor: "pointer", color: "#6e849d", fontSize: 10, letterSpacing: 1,
            ...(isMobile ? { fontSize: 12, lineHeight: 1.4 } : null),
          }}>
            <input
              type="checkbox"
              checked={turnOff}
              onChange={(e) => setTurnOff(e.target.checked)}
              style={{ accentColor: "#8da3b8", width: isMobile ? 18 : undefined, height: isMobile ? 18 : undefined }}
            />
            Turn Off Daily Lineup
          </label>
          <button
            onClick={handleClose}
            style={{
              background: "none",
              border: "1px solid rgba(80,110,140,0.4)",
              color: "#7fa8c4",
              padding: isMobile ? "10px 14px" : "3px 14px",
              fontSize: 10, letterSpacing: 1,
              cursor: "pointer",
              fontFamily: mono,
              minHeight: isMobile ? 44 : undefined,
              width: isMobile ? "100%" : undefined,
            }}
          >
            Close Daily Lineup
          </button>
        </div>
      </div>
    </div>
  );
}
