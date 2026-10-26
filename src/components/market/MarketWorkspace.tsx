"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useIsMobile } from "../../hooks/useIsMobile";
import MarketTickerBar from "./MarketTickerBar";
import DailyLineupModal from "./DailyLineupModal";
import MarketOverviewTab from "./tabs/MarketOverviewTab";
import MarketEquitiesTab from "./tabs/MarketEquitiesTab";
import MarketRatesTab from "./tabs/MarketRatesTab";
import MarketFxTab from "./tabs/MarketFxTab";
import MarketCommoditiesTab from "./tabs/MarketCommoditiesTab";
import MarketCryptoTab from "./tabs/MarketCryptoTab";
import MarketScreenerTab from "./tabs/MarketScreenerTab";
import TickerDetailOverlay from "./TickerDetailOverlay";
import GlossaryPanel from "./GlossaryPanel";

const MARKET_TABS = ["OVERVIEW", "EQUITIES", "RATES", "FX", "COMMODITIES", "CRYPTO", "SCREENER"] as const;
type MarketTab = typeof MARKET_TABS[number];
const PHONE_LINEUP_KEY = "si-phone-market-lineup-last-open-date";

function getLocalDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const SCENARIOS = [
  { id: "BASELINE", label: "BASELINE", title: "Normal market conditions" },
  { id: "RISK-OFF", label: "RISK-OFF", title: "Flight to safety: bonds, gold, JPY up; equities, EM down" },
  { id: "RATES UP", label: "RATES UP", title: "Yield shock: USD up, tech down, financials mixed" },
  { id: "OIL SHOCK", label: "OIL SHOCK", title: "Energy supply shock: crude up, airlines/plastics down, inflation risk" },
] as const;
type Scenario = typeof SCENARIOS[number]["id"];

export default function MarketWorkspace() {
  const isMobile = useIsMobile();
  const [showLineup, setShowLineup] = useState(false);
  const [activeTab, setActiveTab] = useState<MarketTab>("OVERVIEW");
  const [scenario, setScenario] = useState<Scenario>("BASELINE");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [showGlossary, setShowGlossary] = useState(false);
  const [showScenarioSheet, setShowScenarioSheet] = useState(false);
  const tabRefs = useRef<Partial<Record<MarketTab, HTMLButtonElement | null>>>({});

  const visibleTabs = useMemo(
    () => (isMobile ? MARKET_TABS.filter((tab) => tab !== "SCREENER") : MARKET_TABS),
    [isMobile]
  );

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab === activeTab)) {
      setActiveTab("OVERVIEW");
    }
  }, [activeTab, visibleTabs]);

  useEffect(() => {
    if (!isMobile) {
      setShowLineup(true);
      return;
    }
    try {
      const today = getLocalDateKey();
      const lastOpened = window.localStorage.getItem(PHONE_LINEUP_KEY);
      setShowLineup(lastOpened !== today);
      if (lastOpened !== today) {
        window.localStorage.setItem(PHONE_LINEUP_KEY, today);
      }
    } catch {
      setShowLineup(true);
    }
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) return;
    tabRefs.current[activeTab]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [activeTab, isMobile]);

  return (
    <div className="si-market-workspace">
      {showLineup ? (
        <DailyLineupModal
          onClose={() => setShowLineup(false)}
          onOpenGlossary={
            isMobile
              ? () => {
                  setShowLineup(false);
                  setShowGlossary(true);
                }
              : undefined
          }
        />
      ) : null}

      {!isMobile ? <MarketTickerBar /> : null}

      <div className={`si-market-command-bar${isMobile ? " is-phone" : ""}`.trim()}>
        <div className="si-market-tab-row">
          {visibleTabs.map((tab) => (
            <button
              key={tab}
              ref={(node) => {
                tabRefs.current[tab] = node;
              }}
              className={`si-market-tab${activeTab === tab ? " is-active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        {isMobile ? (
          <div className="si-market-phone-utility-row">
            <button
              type="button"
              className="si-market-phone-utility-btn"
              onClick={() => setShowScenarioSheet(true)}
            >
              <span className="si-market-phone-utility-label">Scenario</span>
              <span className="si-market-phone-utility-value">{scenario}</span>
            </button>
            <button
              type="button"
              className="si-market-phone-utility-btn"
              onClick={() => setShowLineup(true)}
              title="Open daily market briefing"
            >
              <span className="si-market-phone-utility-label">Daily</span>
              <span className="si-market-phone-utility-value">Briefing</span>
            </button>
          </div>
        ) : (
          <div className="si-market-command-subrow">
            <div className="si-market-scenario-row">
              <span className="si-market-scenario-label">SCENARIO</span>
              {SCENARIOS.map((entry) => (
                <button
                  key={entry.id}
                  className={`si-market-scenario-btn${scenario === entry.id ? " is-active" : ""}`}
                  onClick={() => setScenario(entry.id as Scenario)}
                  title={entry.title}
                >
                  {entry.label}
                </button>
              ))}
            </div>

            <div className="si-market-command-actions">
              <button
                className="si-market-briefing-btn"
                onClick={() => setShowLineup(true)}
                title="Open daily market briefing"
              >
                DAILY BRIEFING
              </button>

              <button
                className="si-market-briefing-btn"
                onClick={() => setShowGlossary(true)}
                title="Open glossary look up financial terms"
              >
                ? GLOSSARY
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="si-market-tab-content" style={{ position: "relative" }}>
        {activeTab === "OVERVIEW" && <MarketOverviewTab scenario={scenario} onTickerClick={setSelectedTicker} />}
        {activeTab === "EQUITIES" && <MarketEquitiesTab onTickerClick={setSelectedTicker} />}
        {activeTab === "RATES" && <MarketRatesTab />}
        {activeTab === "FX" && <MarketFxTab onTickerClick={setSelectedTicker} />}
        {activeTab === "COMMODITIES" && <MarketCommoditiesTab />}
        {activeTab === "CRYPTO" && <MarketCryptoTab onTickerClick={setSelectedTicker} />}
        {activeTab === "SCREENER" && <MarketScreenerTab onTickerClick={setSelectedTicker} />}

        {selectedTicker ? (
          <TickerDetailOverlay
            sym={selectedTicker}
            onClose={() => setSelectedTicker(null)}
          />
        ) : null}

        {showGlossary ? <GlossaryPanel onClose={() => setShowGlossary(false)} /> : null}
      </div>

      {isMobile && showScenarioSheet ? (
        <div className="si-market-phone-sheet-backdrop" onClick={() => setShowScenarioSheet(false)}>
          <div
            className="si-market-phone-sheet"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-label="Scenario selection"
          >
            <div className="si-market-phone-sheet-header">
              <span>MARKET SCENARIO</span>
              <button type="button" onClick={() => setShowScenarioSheet(false)}>
                CLOSE
              </button>
            </div>
            <div className="si-market-phone-sheet-body">
              {SCENARIOS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={`si-market-phone-sheet-option${scenario === entry.id ? " is-active" : ""}`}
                  onClick={() => {
                    setScenario(entry.id as Scenario);
                    setShowScenarioSheet(false);
                  }}
                >
                  <strong>{entry.label}</strong>
                  <span>{entry.title}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
