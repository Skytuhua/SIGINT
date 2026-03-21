"use client";

import { useEffect, useMemo, useState } from "react";
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

const SCENARIOS = [
  { id: "BASELINE", label: "BASELINE", title: "Normal market conditions" },
  { id: "RISK-OFF", label: "RISK-OFF", title: "Flight to safety: bonds, gold, JPY up; equities, EM down" },
  { id: "RATES UP", label: "RATES UP", title: "Yield shock: USD up, tech down, financials mixed" },
  { id: "OIL SHOCK", label: "OIL SHOCK", title: "Energy supply shock: crude up, airlines/plastics down, inflation risk" },
] as const;
type Scenario = typeof SCENARIOS[number]["id"];

export default function MarketWorkspace() {
  const isMobile = useIsMobile();
  const [showLineup, setShowLineup] = useState(true);
  const [activeTab, setActiveTab] = useState<MarketTab>("OVERVIEW");
  const [scenario, setScenario] = useState<Scenario>("BASELINE");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [showGlossary, setShowGlossary] = useState(false);

  const visibleTabs = useMemo(
    () => (isMobile ? MARKET_TABS.filter((tab) => tab !== "SCREENER") : MARKET_TABS),
    [isMobile]
  );

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab === activeTab)) {
      setActiveTab("OVERVIEW");
    }
  }, [activeTab, visibleTabs]);

  return (
    <div className="si-market-workspace">
      {showLineup && <DailyLineupModal onClose={() => setShowLineup(false)} />}

      <MarketTickerBar />

      <div className="si-market-command-bar">
        <div className="si-market-tab-row">
          {visibleTabs.map((tab) => (
            <button
              key={tab}
              className={`si-market-tab${activeTab === tab ? " is-active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className={`si-market-command-subrow${isMobile ? " is-phone" : ""}`.trim()}>
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
    </div>
  );
}
