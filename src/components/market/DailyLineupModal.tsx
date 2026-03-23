"use client";

import { useEffect, useMemo, useState } from "react";
import { useSIGINTStore } from "../../store";
import { useIsMobile } from "../../hooks/useIsMobile";
import PhoneOverlayShell from "../ui/PhoneOverlayShell";
import { MiniSparkline } from "./shared/MiniSparkline";
import Term from "./shared/Term";

const INDICES = {
  northAmerica: [
    { sym: "ES Mar'26", price: 6862.0, pct: -0.2, spark: [6920, 6910, 6905, 6895, 6880, 6870, 6862] },
    { sym: "NQ Mar'26", price: 25066, pct: -0.24, spark: [25200, 25180, 25160, 25130, 25100, 25080, 25066] },
    { sym: "RTY Mar'26", price: 2189.4, pct: -0.37, spark: [2210, 2205, 2200, 2198, 2195, 2192, 2189] },
    { sym: "YM Mar'26", price: 43720, pct: -0.22, spark: [43900, 43870, 43840, 43810, 43780, 43750, 43720] },
  ],
  europe: [
    { sym: "DAX Mar'26", price: 24142, pct: -0.4, spark: [24350, 24320, 24290, 24260, 24230, 24190, 24142] },
    { sym: "CAC40", price: 8139.5, pct: -0.44, spark: [8220, 8205, 8190, 8175, 8165, 8152, 8139] },
    { sym: "FTSE 100", price: 8612.3, pct: -0.26, spark: [8670, 8660, 8648, 8640, 8632, 8622, 8612] },
    { sym: "IBEX 35", price: 12841, pct: 0.45, spark: [12750, 12760, 12780, 12800, 12818, 12830, 12841] },
  ],
  asia: [
    { sym: "N225 Mar'26", price: 55140, pct: 1.64, spark: [54200, 54400, 54600, 54700, 54850, 55000, 55140] },
    { sym: "HSI Mar'26", price: 25276, pct: 0.57, spark: [25100, 25120, 25150, 25180, 25220, 25250, 25276] },
    { sym: "CSI 300", price: 3982.4, pct: -0.28, spark: [4010, 4005, 4000, 3996, 3991, 3987, 3982] },
    { sym: "ASX 200", price: 8241.7, pct: 0.38, spark: [8200, 8208, 8215, 8222, 8230, 8237, 8241] },
  ],
};

const FX_RATES = [
  { pair: "EUR/USD", rate: "1.1606", pct: -0.24 },
  { pair: "GBP/USD", rate: "1.3342", pct: -0.23 },
  { pair: "USD/JPY", rate: "148.92", pct: 0.22 },
  { pair: "AUD/USD", rate: "0.6358", pct: -0.19 },
];

const UPGRADES = ["AEP", "CPAC", "DOW", "LYB", "PIPR", "ROST", "SO", "SRE", "SSRM", "TGT"];
const DOWNGRADES = ["AVNT", "CME", "COO", "DRTS", "GTLB", "GXO", "LZ", "SLNG", "TBPH", "TVGN", "VMC", "WBTN"];

type Impact = "high" | "med" | "low";
type Status = "past" | "today" | "future";
interface EconEvent {
  date: string;
  name: string;
  prior: string;
  forecast: string;
  actual: string | null;
  impact: Impact;
  status: Status;
}

const ECON_EVENTS: EconEvent[] = [
  { date: "Feb 28", name: "PCE Price Index m/m", prior: "0.3%", forecast: "0.3%", actual: "0.3%", impact: "high", status: "past" },
  { date: "Mar 03", name: "ISM Manufacturing PMI", prior: "49.1", forecast: "49.5", actual: "50.3", impact: "high", status: "past" },
  { date: "Mar 04", name: "JOLTS Job Openings", prior: "8.89M", forecast: "8.75M", actual: null, impact: "high", status: "today" },
  { date: "Mar 05", name: "ADP Non-Farm Employment", prior: "183K", forecast: "148K", actual: null, impact: "high", status: "today" },
  { date: "Mar 06", name: "Initial Jobless Claims", prior: "215K", forecast: "213K", actual: null, impact: "med", status: "future" },
  { date: "Mar 07", name: "Non-Farm Payrolls", prior: "256K", forecast: "160K", actual: null, impact: "high", status: "future" },
  { date: "Mar 07", name: "Unemployment Rate", prior: "4.1%", forecast: "4.1%", actual: null, impact: "high", status: "future" },
];

const EARNINGS = [
  { time: "LAST", dot: "#ffab40", company: "AAPL APPLE INC", note: "OCC weekly options" },
  { time: "DIVD", dot: "#a78bfa", company: "PYPL PAYPAL HOLDINGS INC", note: "Dividend ex-date watch" },
  { time: "08:00", dot: "#36b37e", company: "COST COSTCO WHOLESALE", note: "Q2 EPS est $4.09" },
  { time: "AFTER", dot: "#36b37e", company: "NVDA NVIDIA CORP", note: "Q4 EPS est $0.85" },
  { time: "AFTER", dot: "#ff5a5f", company: "MSFT MICROSOFT CORP", note: "Q3 EPS est $3.14" },
  { time: "AFTER", dot: "#36b37e", company: "AMZN AMAZON.COM INC", note: "Q4 EPS est $1.48" },
];

const AI_SUMMARIES = [
  {
    title: "Macro Outlook",
    body: "Global equities face headwinds from tariff rhetoric and Fed commentary suggesting rates may stay restrictive. Leadership remains concentrated in AI infrastructure names while breadth and rates sensitivity deserve close attention.",
  },
  {
    title: "Geopolitical Risk Premium",
    body: "Middle East shipping and energy risk remain the fastest way for inflation and volatility to reprice. Defense, crude, and haven assets still react first when the tape hardens.",
  },
  {
    title: "Currency And Commodities",
    body: "Dollar softness, gold support, and energy sensitivity continue to define the cross-asset setup. Watch yields and commodity inputs together rather than as separate themes.",
  },
];

const STATIC_HEADLINES = [
  "U.S. Navy intercepts Iranian drone swarm near Strait of Hormuz",
  "Fed officials signal no rush on rate cuts as labor market stays firm",
  "NVIDIA beats estimates as data center demand stays hot",
  "EU unveils large defense spending package amid NATO tensions",
  "China PMI rebounds and lifts regional risk sentiment",
  "Brent crude jumps on Gulf shipping insurance surcharges",
  "Bitcoin holds gains as ETF flows remain strong",
];

const IMPACT_DOT: Record<Impact, string> = { high: "#ff5a5f", med: "#ffab40", low: "#36b37e" };

interface Props {
  onClose: () => void;
  onOpenGlossary?: () => void;
}

const mono = 'var(--font-tech-mono), ui-monospace, Menlo, Monaco, "Courier New", monospace';

function sectionTitleStyle(mobile = false): React.CSSProperties {
  return {
    fontSize: mobile ? 11 : 9,
    letterSpacing: 2,
    color: "#7fa8c4",
    textTransform: "uppercase",
    marginBottom: mobile ? 12 : 8,
  };
}

function sectionShellStyle(mobile = false): React.CSSProperties {
  return {
    border: "1px solid rgba(80,100,125,0.15)",
    background: "rgba(10,16,26,0.92)",
    padding: mobile ? 14 : 12,
    borderRadius: mobile ? 4 : 0,
  };
}

function Section({
  title,
  children,
  isMobile = false,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  isMobile?: boolean;
}) {
  return (
    <section style={sectionShellStyle(isMobile)}>
      <div style={sectionTitleStyle(isMobile)}>{title}</div>
      {children}
    </section>
  );
}

export default function DailyLineupModal({ onClose, onOpenGlossary }: Props) {
  const isMobile = useIsMobile();
  const feedItems = useSIGINTStore((state) => state.news.feedItems);
  const [turnOff, setTurnOff] = useState(false);
  const [aiPage, setAiPage] = useState(0);
  const [utc, setUtc] = useState("");

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setUtc(
        `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}:${String(
          now.getUTCSeconds()
        ).padStart(2, "0")}`
      );
    };
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnOff]);

  function handleClose() {
    if (turnOff) localStorage.setItem("si-daily-lineup-disabled", "true");
    onClose();
  }

  const headlines = useMemo(
    () => (feedItems.length > 0 ? feedItems.slice(0, 12).map((item) => item.headline) : STATIC_HEADLINES),
    [feedItems]
  );

  const dateLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).toUpperCase();

  const baseText: React.CSSProperties = {
    fontFamily: mono,
    color: "#b9cde0",
    fontSize: isMobile ? 13 : 11,
  };

  const content = (
    <div style={{ display: "grid", gap: 12, ...baseText }}>
      <Section title="World Markets" isMobile={isMobile}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          {([
            { label: "North America", items: INDICES.northAmerica },
            { label: "Europe", items: INDICES.europe },
            { label: "Asia", items: INDICES.asia },
          ] as const).map(({ label, items }) => (
            <div key={label}>
              <div style={{ fontSize: isMobile ? 11 : 9, color: isMobile ? "#7fa8c4" : "#5f7488", letterSpacing: isMobile ? 1.5 : 1, marginBottom: isMobile ? 10 : 6, paddingBottom: isMobile ? 6 : 0, borderBottom: isMobile ? "1px solid rgba(80,100,125,0.15)" : "none" }}>{label}</div>
              {items.map((idx) => {
                const up = idx.pct >= 0;
                return (
                  <div
                    key={idx.sym}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr auto auto",
                      gap: 6,
                      alignItems: "center",
                      padding: isMobile ? "8px 0" : "5px 0",
                      borderBottom: "1px solid rgba(80,100,125,0.08)",
                    }}
                  >
                    <span style={{ fontSize: 9, color: "#8da3b8", letterSpacing: 1, whiteSpace: "nowrap" }}>{idx.sym}</span>
                    <MiniSparkline prices={idx.spark} up={up} width={isMobile ? 56 : 44} height={isMobile ? 16 : 14} strokeWidth={1.1} />
                    <span style={{ fontSize: 10, color: "#b9cde0", textAlign: "right" }}>{idx.price.toLocaleString()}</span>
                    <span style={{ fontSize: 9, color: up ? "#36b37e" : "#ff5a5f", textAlign: "right", minWidth: 52 }}>
                      {up ? "+" : ""}{idx.pct.toFixed(2)}%
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: "1px solid rgba(80,100,125,0.1)",
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 9, color: "#5f7488", letterSpacing: 1 }}>
            <Term id="CROSS_RATE">F/X</Term>
          </span>
          {FX_RATES.map((fx) => (
            <div key={fx.pair} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 9, color: "#8da3b8", letterSpacing: 1 }}>{fx.pair}</span>
              <span style={{ fontSize: 10, color: "#b9cde0" }}>{fx.rate}</span>
              <span style={{ fontSize: 9, color: fx.pct >= 0 ? "#36b37e" : "#ff5a5f" }}>
                {fx.pct >= 0 ? "+" : ""}{fx.pct.toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      </Section>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        <Section title="Market Briefing" isMobile={isMobile}>
          <p style={{ lineHeight: 1.7, color: "#8da3b8", margin: 0, fontSize: 11 }}>
            Equities regained footing as energy stabilized and leadership returned to large-cap growth. Yields eased,
            volatility compressed, and cross-asset behavior tilted back toward risk-on, but the market still looks
            vulnerable to labor-data surprises, Fed repricing, and any renewed shipping or oil shock headlines.
          </p>
          <div style={{ marginTop: 8, fontSize: 9, color: "#5f7488", letterSpacing: 1 }}>source / freshness / state</div>
        </Section>

        <Section title="Analyst Activity" isMobile={isMobile}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 9, color: "#6e849d", letterSpacing: 1, marginBottom: 6 }}>
              <Term id="OW">Upgrades</Term>
            </div>
            <div>
              {UPGRADES.map((ticker) => (
                <span
                  key={ticker}
                  style={{
                    display: "inline-block",
                    padding: "1px 6px",
                    border: "1px solid rgba(80,110,140,0.4)",
                    color: "#7fa8c4",
                    fontSize: 9,
                    letterSpacing: 1,
                    marginRight: 5,
                    marginBottom: 5,
                  }}
                >
                  {ticker}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "#6e849d", letterSpacing: 1, marginBottom: 6 }}>
              <Term id="UW">Downgrades</Term>
            </div>
            <div>
              {DOWNGRADES.map((ticker) => (
                <span
                  key={ticker}
                  style={{
                    display: "inline-block",
                    padding: "1px 6px",
                    border: "1px solid rgba(255,90,95,0.35)",
                    color: "#ff5a5f",
                    fontSize: 9,
                    letterSpacing: 1,
                    marginRight: 5,
                    marginBottom: 5,
                  }}
                >
                  {ticker}
                </span>
              ))}
            </div>
          </div>
        </Section>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        <Section title="Economic Calendar" isMobile={isMobile}>
          <div style={{ display: "grid", gap: 8 }}>
            {ECON_EVENTS.map((event, index) => (
              <div
                key={`${event.name}-${index}`}
                style={{
                  display: "grid",
                  gap: 4,
                  padding: "8px 0",
                  borderBottom: "1px solid rgba(80,100,125,0.08)",
                  opacity: event.status === "past" ? 0.58 : 1,
                  background: event.status === "today" ? "rgba(80,110,140,0.1)" : undefined,
                }}
              >
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: IMPACT_DOT[event.impact],
                      display: "inline-block",
                    }}
                  />
                  <span style={{ fontSize: 9, color: "#6e849d", letterSpacing: 1 }}>{event.date}</span>
                  <span style={{ fontSize: 10, color: "#b9cde0" }}>{event.name}</span>
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 9, color: "#6e849d" }}>
                  <span>Prior {event.prior}</span>
                  <span>Forecast {event.forecast}</span>
                  <span>Actual {event.actual ?? "--"}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title={<Term id="EPS">Earnings</Term>} isMobile={isMobile}>
          <div style={{ display: "grid", gap: 8 }}>
            {EARNINGS.map((entry, index) => (
              <div
                key={`${entry.company}-${index}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "42px 10px minmax(0, 1fr)",
                  gap: 8,
                  alignItems: "center",
                  padding: "6px 0",
                  borderBottom: "1px solid rgba(80,100,125,0.08)",
                }}
              >
                <span style={{ fontSize: 9, color: "#6e849d" }}>{entry.time}</span>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: entry.dot,
                    display: "inline-block",
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 9, color: "#b9cde0" }}>{entry.company}</div>
                  <div style={{ fontSize: 8, color: "#5f7488" }}>{entry.note}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        <Section title="Top Headlines" isMobile={isMobile}>
          <div style={{ display: "grid", gap: 6 }}>
            {headlines.map((headline, index) => (
              <div
                key={`${headline}-${index}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "20px minmax(0, 1fr)",
                  gap: 8,
                  alignItems: "start",
                  padding: "4px 0",
                  borderBottom: "1px solid rgba(80,100,125,0.08)",
                }}
              >
                <span style={{ fontSize: 9, color: "#5f7488", fontWeight: 600 }}>{index + 1}.</span>
                <span style={{ fontSize: 10, color: "#b9cde0", lineHeight: 1.55 }}>{headline}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="AI Summaries" isMobile={isMobile}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 9, color: "#6e849d", letterSpacing: 1 }}>Daily Overview</span>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                onClick={() => setAiPage((page) => (page - 1 + AI_SUMMARIES.length) % AI_SUMMARIES.length)}
                style={{
                  background: "none",
                  border: "1px solid rgba(80,100,125,0.3)",
                  color: "#6e849d",
                  width: 28,
                  height: 28,
                  cursor: "pointer",
                  fontFamily: mono,
                }}
              >
                {"<"}
              </button>
              <span style={{ fontSize: 9, color: "#6e849d" }}>
                {aiPage + 1} / {AI_SUMMARIES.length}
              </span>
              <button
                type="button"
                onClick={() => setAiPage((page) => (page + 1) % AI_SUMMARIES.length)}
                style={{
                  background: "none",
                  border: "1px solid rgba(80,100,125,0.3)",
                  color: "#6e849d",
                  width: 28,
                  height: 28,
                  cursor: "pointer",
                  fontFamily: mono,
                }}
              >
                {">"}
              </button>
            </div>
          </div>
          <div style={{ fontSize: 10, color: "#7fa8c4", letterSpacing: 1.5, marginBottom: 8 }}>{AI_SUMMARIES[aiPage].title}</div>
          <p style={{ fontSize: 10, color: "#8da3b8", lineHeight: 1.7, margin: 0 }}>{AI_SUMMARIES[aiPage].body}</p>
        </Section>
      </div>
    </div>
  );

  const footer = (
    <>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
          color: "#6e849d",
          fontSize: isMobile ? 13 : 10,
          letterSpacing: 1,
          lineHeight: 1.4,
        }}
      >
        <input
          type="checkbox"
          checked={turnOff}
          onChange={(event) => setTurnOff(event.target.checked)}
          style={{ accentColor: "#8da3b8", width: isMobile ? 18 : undefined, height: isMobile ? 18 : undefined }}
        />
        Turn Off Daily Lineup
      </label>
      <button
        type="button"
        onClick={handleClose}
        style={{
          background: isMobile ? "rgba(18,30,46,0.95)" : "none",
          border: "1px solid rgba(80,110,140,0.4)",
          color: isMobile ? "#89e5ff" : "#7fa8c4",
          padding: isMobile ? "10px 14px" : "6px 14px",
          fontSize: 10,
          letterSpacing: 1,
          cursor: "pointer",
          fontFamily: mono,
          minHeight: 44,
          width: isMobile ? "100%" : undefined,
        }}
      >
        Close Daily Lineup
      </button>
    </>
  );

  if (isMobile) {
    return (
      <PhoneOverlayShell
        title={`Daily Briefing | ${dateLabel}`}
        onClose={handleClose}
        footer={footer}
        actions={
          onOpenGlossary ? (
            <button type="button" className="si-phone-overlay-action" onClick={onOpenGlossary}>
              Glossary
            </button>
          ) : null
        }
      >
        {content}
      </PhoneOverlayShell>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,4,10,0.9)",
        zIndex: 9000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          ...baseText,
          background: "#020b12",
          border: "1px solid rgba(80,110,140,0.35)",
          width: "100%",
          maxWidth: 920,
          maxHeight: "90vh",
          display: "grid",
          gridTemplateRows: "auto minmax(0, 1fr) auto",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: "rgba(80,110,140,0.08)",
            borderBottom: "1px solid rgba(80,110,140,0.25)",
            padding: "8px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ color: "#7fa8c4", fontWeight: 700, fontSize: 10, letterSpacing: 2 }}>SIGINT | DAILY LINEUP</span>
          <span style={{ fontSize: 9, color: "#5f7488", letterSpacing: 1 }}>NORTH AMERICAN EDITION</span>
          <span style={{ fontSize: 9, color: "#8da3b8", marginLeft: "auto" }}>{dateLabel}</span>
          <span style={{ fontSize: 10, color: "#7fa8c4", letterSpacing: 1 }}>UTC {utc}</span>
          <button
            type="button"
            onClick={handleClose}
            style={{
              background: "none",
              border: "1px solid rgba(80,110,140,0.4)",
              color: "#7fa8c4",
              padding: "6px 14px",
              fontSize: 10,
              letterSpacing: 1,
              cursor: "pointer",
              fontFamily: mono,
            }}
          >
            CLOSE
          </button>
        </div>
        <div style={{ minHeight: 0, overflowY: "auto", padding: 14 }}>{content}</div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            borderTop: "1px solid rgba(80,110,140,0.22)",
            background: "rgba(80,110,140,0.04)",
          }}
        >
          {footer}
        </div>
      </div>
    </div>
  );
}
