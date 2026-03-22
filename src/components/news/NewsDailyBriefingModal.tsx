"use client";

import { useEffect, useState } from "react";
import { useSIGINTStore } from "../../store";
import { useIsMobile } from "../../hooks/useIsMobile";
import type { NewsArticle } from "../../lib/news/types";
import PhoneOverlayShell from "../ui/PhoneOverlayShell";

// ─── Sector definitions ────────────────────────────────────────────────────

type SectorGroup = {
  id: string;
  label: string;
  categories: string[];
};

const SECTOR_GROUPS: SectorGroup[] = [
  { id: "tech-ai",     label: "TECHNOLOGY / AI",         categories: ["tech", "ai", "semiconductors", "cloud"] },
  { id: "defense",     label: "DEFENSE / MILITARY",      categories: ["defense", "space"] },
  { id: "energy",      label: "ENERGY / COMMODITIES",    categories: ["energy", "commodities"] },
  { id: "markets",     label: "MARKETS / FINANCE",       categories: ["markets", "financial", "forex", "ipo"] },
  { id: "crypto",      label: "CRYPTO / DIGITAL ASSETS", categories: ["crypto", "fintech"] },
  { id: "cyber",       label: "CYBERSECURITY",           categories: ["cyber"] },
  { id: "government",  label: "GOVERNMENT / POLICY",     categories: ["government", "regulation"] },
  { id: "biotech",     label: "BIOTECH / HEALTH",        categories: ["biotech"] },
];

const CRISIS_CATEGORIES = ["world", "defense"];

// ─── Static crisis data ────────────────────────────────────────────────────

const CRISIS_ITEMS = [
  {
    region: "MIDDLE EAST",
    title: "Iran-Israel Tensions / Gulf Maritime Security",
    summary:
      "Ongoing naval confrontations in the Gulf of Oman and Strait of Hormuz continue to elevate regional risk. U.S. carrier strike groups maintain forward positioning as proxy engagements intensify across Lebanon, Yemen, and the Red Sea corridor. Maritime insurance premiums for Gulf transit have surged 340% since escalation began.",
    status: "ACTIVE CONFLICT",
    statusColor: "#ff5a5f",
  },
  {
    region: "EASTERN EUROPE",
    title: "Russia-Ukraine Conflict — Year 4",
    summary:
      "Front-line conditions remain fluid with incremental positional changes along the Zaporizhzhia-Donetsk axis. Western arms deliveries continue under new EU defense spending pact. Energy infrastructure targeting has decreased 18% month-over-month, though civilian casualty reports remain elevated.",
    status: "ACTIVE CONFLICT",
    statusColor: "#ff5a5f",
  },
  {
    region: "INDO-PACIFIC",
    title: "South China Sea / Taiwan Strait Monitoring",
    summary:
      "PLA naval exercises continue near the median line with increased frequency of air defense identification zone incursions. TSMC supply chain contingency planning accelerated following latest Pentagon assessment. Regional allies strengthening bilateral defense cooperation frameworks.",
    status: "MONITORING",
    statusColor: "#ffab40",
  },
];

// ─── Static fallback headlines ─────────────────────────────────────────────

const STATIC_CRISIS_HEADLINES = [
  "U.S. Navy Intercepts Iranian Drone Swarm Near Strait of Hormuz",
  "EU Unveils $500B Defense Spending Pact Amid NATO Tensions",
  "Houthi Forces Launch Anti-Ship Missiles at Commercial Vessels in Red Sea",
  "NATO Allies Boost Eastern Flank Deployments Following Border Incidents",
  "Pentagon Releases Updated Indo-Pacific Threat Assessment",
];

const STATIC_SECTOR_HEADLINES: Record<string, string[]> = {
  "tech-ai": [
    "NVIDIA Beats Q4 Estimates; Data Center Revenue Hits $18.4B",
    "OpenAI Announces GPT-5 Preview With Real-Time Reasoning Capabilities",
    "TSMC Eyes $40B Arizona Fab Expansion With Federal Aid",
    "EU AI Act Enforcement Framework Published — Compliance Deadline Set",
  ],
  defense: [
    "Lockheed Martin Secures $8.2B F-35 Sustainment Contract",
    "SpaceX Launches Classified NRO Payload on Falcon Heavy",
    "BAE Systems Reports Record Backlog on European Defense Surge",
  ],
  energy: [
    "Brent Crude Spikes 3% on Gulf Shipping Insurance Surcharges",
    "Saudi Arabia Signals OPEC+ Production Cut Extension Through Q3",
    "Natural Gas Futures Surge 5.1% on Cold Snap Forecasts",
  ],
  markets: [
    "S&P 500 Consolidates Near 6,850 as Breadth Narrows",
    "Fed's Waller: 'No Rush' on Rate Cuts as Labor Market Stays Hot",
    "IMF Cuts 2026 Global Growth Forecast to 2.8% on Trade Risks",
    "Eurozone CPI Falls to 2.2% — ECB Rate Cut Now Seen as June",
  ],
  crypto: [
    "Bitcoin Holds $67K as ETF Inflows Reach Monthly Record",
    "SEC Approves Spot Ethereum ETF Applications From Three Issuers",
    "Stablecoin Market Cap Hits $180B All-Time High",
  ],
  cyber: [
    "Critical Zero-Day in Fortinet Firewalls Actively Exploited",
    "U.S. Treasury Sanctions Russian Ransomware Infrastructure",
    "CISA Issues Emergency Directive on Microsoft Exchange Vulnerability",
  ],
  government: [
    "Trump Signs Executive Order on Semiconductor Export Controls",
    "China Retaliates With Rare Earth Export Restrictions on 12 Elements",
    "Congressional Budget Office Raises Deficit Forecast to $2.1T",
  ],
  biotech: [
    "Moderna Phase III Bird Flu Vaccine Shows 89% Efficacy",
    "FDA Grants Breakthrough Designation to Eli Lilly Alzheimer's Drug",
    "WHO Upgrades H5N1 Risk Assessment to 'High' for Human Transmission",
  ],
};

// ─── AI Intelligence summaries ─────────────────────────────────────────────

const INTEL_SUMMARIES = [
  {
    title: "Global Threat Assessment",
    body: "The geopolitical risk index remains at its highest level since 2022. Middle East escalation has re-introduced a significant oil supply risk premium, with Brent crude futures pricing in a $6-8/bbl geopolitical premium. European defense spending commitments signal a structural shift in NATO burden-sharing. Polymarket assigns 34% probability to a 30-day Strait of Hormuz disruption, up from 18% last week. North Korea's satellite launch program continues to test regional patience, while Sub-Saharan Africa sees increased Wagner Group activity across the Sahel corridor.",
  },
  {
    title: "Technology & Cyber Landscape",
    body: "AI infrastructure buildout continues to dominate tech capital expenditure, with hyperscaler capex forecasts revised upward 22% for 2026. NVIDIA, AMD, and Broadcom account for 40% of Nasdaq year-to-date gains. Cybersecurity spending is accelerating following a wave of critical zero-day exploits targeting enterprise firewalls and cloud infrastructure. The EU AI Act enters enforcement phase, creating compliance overhead for U.S. tech firms operating in European markets. Semiconductor export controls are reshaping global supply chains as China accelerates domestic chip production.",
  },
  {
    title: "Energy & Commodities Outlook",
    body: "Energy markets remain bifurcated: oil faces upside risk from Gulf tensions while natural gas fundamentals are driven by weather patterns and LNG export capacity. Gold holds above $2,320/oz supported by central bank demand — PBoC added 8.3T oz in February. Copper continues its structural grind higher on AI data center power infrastructure demand, with Chilean mine output disruptions adding near-term tightness. Rare earth supply chains face fragmentation risk as China signals willingness to weaponize export controls in response to semiconductor restrictions.",
  },
  {
    title: "Regional Stability Index",
    body: "Eastern Mediterranean: ELEVATED — naval build-up and proxy warfare escalation. Black Sea: HIGH — continued mine warfare and commercial shipping disruption. Indo-Pacific: MODERATE-HIGH — increased PLA activity but diplomatic channels remain open. Arctic: LOW-MODERATE — resource competition intensifying but within diplomatic frameworks. Sahel Corridor: DETERIORATING — governance vacuums expanding as French withdrawal accelerates. Latin America: STABLE — Venezuela election tensions contained, regional trade flows normal.",
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

function groupBySector(items: NewsArticle[]): Record<string, NewsArticle[]> {
  const seen = new Set<string>();
  const result: Record<string, NewsArticle[]> = {};

  // Crisis headlines first
  const crisisItems: NewsArticle[] = [];
  for (const item of items) {
    if (CRISIS_CATEGORIES.includes(item.category) && !seen.has(item.id)) {
      seen.add(item.id);
      crisisItems.push(item);
      if (crisisItems.length >= 5) break;
    }
  }
  result.__crisis = crisisItems;

  // Sector groups
  for (const group of SECTOR_GROUPS) {
    const bucket: NewsArticle[] = [];
    for (const item of items) {
      if (seen.has(item.id)) continue;
      if (group.categories.includes(item.category)) {
        seen.add(item.id);
        bucket.push(item);
        if (bucket.length >= 5) break;
      }
    }
    result[group.id] = bucket;
  }

  return result;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ─── Main component ────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
}

export default function NewsDailyBriefingModal({ onClose }: Props) {
  const isMobile = useIsMobile();
  const feedItems = useSIGINTStore((s) => s.news.feedItems);
  const [turnOff, setTurnOff] = useState(false);
  const [aiPage, setAiPage] = useState(0);
  const [utc, setUtc] = useState("");

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
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnOff]);

  function handleClose() {
    if (turnOff) localStorage.setItem("si-news-briefing-disabled", "true");
    onClose();
  }

  // Sort by recency and group
  const sorted = [...feedItems].sort((a, b) => b.publishedAt - a.publishedAt);
  const grouped = groupBySector(sorted);

  const today = new Date();
  const dateLabel = today
    .toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    })
    .toUpperCase();

  // ── Styles ──────────────────────────────────────────────────────────────

  const mono =
    'var(--font-tech-mono), ui-monospace, Menlo, Monaco, "Courier New", monospace';

  const base: React.CSSProperties = {
    fontFamily: mono,
    color: "#b9cde0",
    fontSize: 11,
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: 9,
    letterSpacing: 2,
    color: "#7fa8c4",
    textTransform: "uppercase",
    marginBottom: 8,
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

  // ── Headline renderer ───────────────────────────────────────────────────

  function renderHeadlines(
    items: NewsArticle[],
    fallback: string[]
  ) {
    const lines =
      items.length > 0
        ? items.map((a) => ({
            text: a.headline,
            source: a.source ?? a.domain ?? "",
            time: relativeTime(a.publishedAt),
          }))
        : fallback.map((h) => ({ text: h, source: "", time: "" }));

    return lines.map((line, i) => (
      <div
        key={i}
        style={{
          display: "grid",
          gridTemplateColumns: "18px 1fr auto",
          gap: 6,
          padding: "3px 0",
          borderBottom: "1px solid rgba(80,100,125,0.08)",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 9, color: "#5f7488", fontWeight: 600 }}>
          {i + 1}.
        </span>
        <span
          style={{
            fontSize: 9,
            color: "#b9cde0",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {line.text}
        </span>
        {line.source ? (
          <span
            style={{
              fontSize: 8,
              color: "#5f7488",
              textAlign: "right",
              whiteSpace: "nowrap",
            }}
          >
            {line.source} {line.time ? `· ${line.time}` : ""}
          </span>
        ) : (
          <span style={{ fontSize: 8, color: "#5f7488", textAlign: "right" }}>
            —
          </span>
        )}
      </div>
    ));
  }

  // ── Sector pairs for 2-col layout ───────────────────────────────────────

  const sectorPairs: [SectorGroup, SectorGroup | null][] = [];
  for (let i = 0; i < SECTOR_GROUPS.length; i += 2) {
    sectorPairs.push([
      SECTOR_GROUPS[i],
      i + 1 < SECTOR_GROUPS.length ? SECTOR_GROUPS[i + 1] : null,
    ]);
  }

  function renderMobileHeadlines(items: NewsArticle[], fallback: string[]) {
    const lines =
      items.length > 0
        ? items.map((article) => ({
            text: article.headline,
            source: article.source ?? article.domain ?? "Live feed",
            time: relativeTime(article.publishedAt),
          }))
        : fallback.map((headline) => ({
            text: headline,
            source: "Reference",
            time: "",
          }));

    return (
      <div style={{ display: "grid", gap: 8 }}>
        {lines.map((line, index) => (
          <div
            key={`${line.text}-${index}`}
            style={{
              display: "grid",
              gap: 4,
              padding: "10px 0",
              borderBottom: "1px solid rgba(80,100,125,0.08)",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span style={{ fontSize: 10, color: "#5f7488", minWidth: 18 }}>{index + 1}.</span>
              <span
                style={{
                  fontSize: 13,
                  lineHeight: 1.4,
                  color: "#d7e3ef",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {line.text}
              </span>
            </div>
            <div style={{ paddingLeft: 26, fontSize: 10, lineHeight: 1.35, color: "#7c93ab" }}>
              {[line.source, line.time].filter(Boolean).join(" / ")}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isMobile) {
    return (
      <PhoneOverlayShell
        title="Intelligence Briefing"
        ariaLabel="News intelligence briefing"
        onClose={handleClose}
        footer={
          <div style={{ display: "grid", gap: 10, fontFamily: mono }}>
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                fontSize: 11,
                lineHeight: 1.45,
                color: "#9eb5ca",
              }}
            >
              <input
                type="checkbox"
                checked={turnOff}
                onChange={(event) => setTurnOff(event.target.checked)}
                style={{ accentColor: "#89e5ff", width: 16, height: 16, marginTop: 1, flexShrink: 0 }}
              />
              Turn off intelligence briefing on this device
            </label>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
                fontSize: 10,
                lineHeight: 1.35,
                color: "#6e849d",
              }}
            >
              <span>{dateLabel}</span>
              <span>{utc} UTC</span>
            </div>
          </div>
        }
      >
        <div style={{ display: "grid", gap: 12, fontFamily: mono, color: "#b9cde0" }}>
          <section
            style={{
              display: "grid",
              gap: 10,
              padding: "12px",
              border: "1px solid rgba(80,100,125,0.15)",
              background: "rgba(10,16,26,0.92)",
            }}
          >
            <div style={{ ...sectionTitle, marginBottom: 0 }}>CRISIS WATCH</div>
            <div style={{ display: "grid", gap: 10 }}>
              {CRISIS_ITEMS.map((item) => (
                <div
                  key={item.region}
                  style={{
                    display: "grid",
                    gap: 6,
                    padding: "10px",
                    border: "1px solid rgba(80,100,125,0.14)",
                    background: "rgba(80,110,140,0.04)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: item.statusColor,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 10, letterSpacing: "0.08em", color: "#7fa8c4" }}>{item.region}</span>
                    <span
                      style={{
                        fontSize: 9,
                        letterSpacing: "0.08em",
                        color: item.statusColor,
                        border: `1px solid ${item.statusColor}44`,
                        padding: "2px 6px",
                      }}
                    >
                      {item.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.4, color: "#d7e3ef" }}>{item.title}</div>
                  <p style={{ margin: 0, fontSize: 11, lineHeight: 1.55, color: "#8da3b8" }}>{item.summary}</p>
                </div>
              ))}
            </div>
            {renderMobileHeadlines(grouped.__crisis ?? [], STATIC_CRISIS_HEADLINES)}
          </section>

          {SECTOR_GROUPS.map((group) => (
            <section
              key={group.id}
              style={{
                display: "grid",
                gap: 8,
                padding: "12px",
                border: "1px solid rgba(80,100,125,0.15)",
                background: "rgba(10,16,26,0.92)",
              }}
            >
              <div style={{ ...sectionTitle, marginBottom: 0 }}>{group.label}</div>
              {renderMobileHeadlines(grouped[group.id] ?? [], STATIC_SECTOR_HEADLINES[group.id] ?? [])}
            </section>
          ))}

          <section
            style={{
              display: "grid",
              gap: 10,
              padding: "12px",
              border: "1px solid rgba(80,100,125,0.15)",
              background: "rgba(10,16,26,0.92)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div style={{ ...sectionTitle, marginBottom: 0 }}>AI Intelligence Digest</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  className="si-phone-overlay-action"
                  style={{ minWidth: 44, minHeight: 36, padding: "0 10px" }}
                  onClick={() => setAiPage((page) => (page - 1 + INTEL_SUMMARIES.length) % INTEL_SUMMARIES.length)}
                  aria-label="Previous summary"
                >
                  PREV
                </button>
                <span style={{ fontSize: 10, color: "#7c93ab" }}>
                  {aiPage + 1} / {INTEL_SUMMARIES.length}
                </span>
                <button
                  type="button"
                  className="si-phone-overlay-action"
                  style={{ minWidth: 44, minHeight: 36, padding: "0 10px" }}
                  onClick={() => setAiPage((page) => (page + 1) % INTEL_SUMMARIES.length)}
                  aria-label="Next summary"
                >
                  NEXT
                </button>
              </div>
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.45, color: "#89e5ff" }}>{INTEL_SUMMARIES[aiPage].title}</div>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.65, color: "#b9cde0" }}>
              {INTEL_SUMMARIES[aiPage].body}
            </p>
          </section>
        </div>
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
        padding: isMobile ? 0 : 16,
      }}
    >
      <div
        style={{
          ...base,
          background: "#020b12",
          border: "1px solid rgba(80,110,140,0.35)",
          width: "100%",
          maxWidth: isMobile ? "100%" : 920,
          height: isMobile ? "100dvh" : undefined,
          maxHeight: isMobile ? "100dvh" : "90vh",
          overflowY: "auto",
        }}
      >
        {/* ── HEADER ── */}
        <div
          style={{
            background: "rgba(80,110,140,0.08)",
            borderBottom: "1px solid rgba(80,110,140,0.25)",
            padding: isMobile ? "calc(8px + env(safe-area-inset-top, 0px)) 14px 8px" : "8px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            position: "sticky",
            top: 0,
            zIndex: 2,
          }}
        >
          <span
            style={{
              color: "#7fa8c4",
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: 2,
            }}
          >
            SIGINT · INTELLIGENCE BRIEFING
          </span>
          <span style={{ fontSize: 9, color: "#5f7488", letterSpacing: 1 }}>
            GLOBAL EDITION
          </span>
          <span style={{ fontSize: 9, color: "#8da3b8", marginLeft: "auto" }}>
            {dateLabel}
          </span>
          <span style={{ fontSize: 10, color: "#7fa8c4", letterSpacing: 1 }}>
            ◈ {utc} UTC
          </span>
          <button
            onClick={handleClose}
            style={{
              background: "none",
              border: "none",
              color: "#5f7488",
              fontSize: 14,
              cursor: "pointer",
              lineHeight: 1,
              padding: "0 2px",
            }}
            title="Close Intelligence Briefing"
          >
            ✕
          </button>
        </div>

        {/* ── SECTION 1: CRISIS WATCH ── */}
        <div style={{ padding: "10px 14px", ...divider }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <div style={{ ...sectionTitle, marginBottom: 0 }}>
              ◆ CRISIS WATCH / MAJOR WORLD EVENTS
            </div>
            <span
              style={{
                fontSize: 8,
                letterSpacing: 1.5,
                color: "#020b12",
                background: "#ffab40",
                padding: "1px 8px",
                fontWeight: 700,
              }}
            >
              THREAT LEVEL: ELEVATED
            </span>
          </div>

          {/* Crisis situation cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
              gap: 12,
              marginBottom: 12,
            }}
          >
            {CRISIS_ITEMS.map((item) => (
              <div
                key={item.region}
                style={{
                  border: "1px solid rgba(80,100,125,0.2)",
                  padding: "8px 10px",
                  background: "rgba(80,110,140,0.04)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: item.statusColor,
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 9,
                      color: "#7fa8c4",
                      letterSpacing: 1.5,
                      fontWeight: 700,
                    }}
                  >
                    {item.region}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "#b9cde0",
                    fontWeight: 600,
                    marginBottom: 4,
                    lineHeight: 1.4,
                  }}
                >
                  {item.title}
                </div>
                <p
                  style={{
                    fontSize: 9,
                    color: "#8da3b8",
                    lineHeight: 1.6,
                    margin: 0,
                    marginBottom: 6,
                  }}
                >
                  {item.summary}
                </p>
                <span
                  style={{
                    fontSize: 8,
                    letterSpacing: 1,
                    color: item.statusColor,
                    border: `1px solid ${item.statusColor}40`,
                    padding: "1px 6px",
                  }}
                >
                  {item.status}
                </span>
              </div>
            ))}
          </div>

          {/* Live crisis headlines */}
          <div style={{ fontSize: 9, color: "#5f7488", letterSpacing: 1, marginBottom: 6 }}>
            Latest Developments:
          </div>
          {renderHeadlines(
            grouped.__crisis ?? [],
            STATIC_CRISIS_HEADLINES
          )}
          <div
            style={{
              marginTop: 6,
              fontSize: 9,
              color: "#5f7488",
              letterSpacing: 1,
            }}
          >
            {(grouped.__crisis?.length ?? 0) > 0
              ? "SIGINT Live Feed"
              : "Static Placeholder"}
          </div>
        </div>

        {/* ── SECTION 2: SECTOR BRIEFINGS ── */}
        {sectorPairs.map(([left, right], rowIdx) => (
          <div key={rowIdx} style={twoCol}>
            {/* Left cell */}
            <div style={leftCell}>
              <div style={sectionTitle}>{left.label}</div>
              {renderHeadlines(
                grouped[left.id] ?? [],
                STATIC_SECTOR_HEADLINES[left.id] ?? []
              )}
              <div
                style={{
                  marginTop: 6,
                  fontSize: 9,
                  color: "#5f7488",
                  letterSpacing: 1,
                }}
              >
                {(grouped[left.id]?.length ?? 0) > 0
                  ? "SIGINT Live Feed"
                  : "Static Placeholder"}
              </div>
            </div>

            {/* Right cell */}
            {right ? (
              <div style={rightCell}>
                <div style={sectionTitle}>{right.label}</div>
                {renderHeadlines(
                  grouped[right.id] ?? [],
                  STATIC_SECTOR_HEADLINES[right.id] ?? []
                )}
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 9,
                    color: "#5f7488",
                    letterSpacing: 1,
                  }}
                >
                  {(grouped[right.id]?.length ?? 0) > 0
                    ? "SIGINT Live Feed"
                    : "Static Placeholder"}
                </div>
              </div>
            ) : (
              <div style={rightCell} />
            )}
          </div>
        ))}

        {/* ── SECTION 3: AI INTELLIGENCE SUMMARY ── */}
        <div style={{ padding: "10px 14px", ...divider }}>
          {/* AI summary header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <div style={{ ...sectionTitle, marginBottom: 0 }}>
              ★ AI INTELLIGENCE DIGEST
            </div>
            <span style={{ fontSize: 9, color: "#6e849d", letterSpacing: 1 }}>
              Daily Overview
            </span>
            <div
              style={{
                marginLeft: "auto",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <button
                onClick={() =>
                  setAiPage(
                    (p) =>
                      (p - 1 + INTEL_SUMMARIES.length) %
                      INTEL_SUMMARIES.length
                  )
                }
                style={{
                  background: "none",
                  border: "1px solid rgba(80,100,125,0.3)",
                  color: "#6e849d",
                  width: 20,
                  height: 20,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontFamily: mono,
                }}
              >
                ‹
              </button>
              <span style={{ fontSize: 9, color: "#6e849d" }}>
                {aiPage + 1} / {INTEL_SUMMARIES.length}
              </span>
              <button
                onClick={() =>
                  setAiPage((p) => (p + 1) % INTEL_SUMMARIES.length)
                }
                style={{
                  background: "none",
                  border: "1px solid rgba(80,100,125,0.3)",
                  color: "#6e849d",
                  width: 20,
                  height: 20,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontFamily: mono,
                }}
              >
                ›
              </button>
            </div>
          </div>
          <div
            style={{
              fontSize: 9,
              color: "#7fa8c4",
              letterSpacing: 1.5,
              marginBottom: 8,
            }}
          >
            {INTEL_SUMMARIES[aiPage].title}
          </div>
          <p
            style={{
              fontSize: 10,
              color: "#8da3b8",
              lineHeight: 1.7,
              margin: 0,
            }}
          >
            {INTEL_SUMMARIES[aiPage].body}
          </p>
          <div
            style={{
              marginTop: 12,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 9, color: "#5f7488", letterSpacing: 1 }}>
              Intelligence Analysis
            </span>
            <span
              style={{
                fontSize: 9,
                color: "#5f7488",
                border: "1px solid rgba(80,100,125,0.25)",
                padding: "1px 7px",
                letterSpacing: 1,
              }}
            >
              AI Disclosure
            </span>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div
          style={{
            padding: isMobile ? "10px 14px calc(10px + env(safe-area-inset-bottom, 0px))" : "8px 14px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: isMobile ? "stretch" : "center",
            flexDirection: isMobile ? "column" : "row",
            gap: isMobile ? 10 : 0,
            borderTop: "1px solid rgba(80,110,140,0.22)",
            background: "rgba(80,110,140,0.04)",
            position: "sticky",
            bottom: 0,
            zIndex: 2,
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              color: "#6e849d",
              fontSize: isMobile ? 12 : 10,
              letterSpacing: 1,
              lineHeight: isMobile ? 1.4 : undefined,
            }}
          >
            <input
              type="checkbox"
              checked={turnOff}
              onChange={(e) => setTurnOff(e.target.checked)}
              style={{ accentColor: "#8da3b8", width: isMobile ? 18 : undefined, height: isMobile ? 18 : undefined }}
            />
            Turn Off Intelligence Briefing
          </label>
          <button
            onClick={handleClose}
            style={{
              background: "none",
              border: "1px solid rgba(80,110,140,0.4)",
              color: "#7fa8c4",
              padding: isMobile ? "10px 14px" : "3px 14px",
              fontSize: 10,
              letterSpacing: 1,
              cursor: "pointer",
              fontFamily: mono,
              width: isMobile ? "100%" : undefined,
              minHeight: isMobile ? 44 : undefined,
            }}
          >
            Close Briefing
          </button>
        </div>
      </div>
    </div>
  );
}
