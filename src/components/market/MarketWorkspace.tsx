"use client";

import { useState } from "react";
import MarketTickerBar from "./MarketTickerBar";
import DailyLineupModal from "./DailyLineupModal";
import MarketOverviewTab from "./tabs/MarketOverviewTab";
import MarketEquitiesTab from "./tabs/MarketEquitiesTab";
import MarketRatesTab from "./tabs/MarketRatesTab";
import MarketFxTab from "./tabs/MarketFxTab";
import MarketCommoditiesTab from "./tabs/MarketCommoditiesTab";
import MarketCryptoTab from "./tabs/MarketCryptoTab";
import MarketPortfolioTab from "./tabs/MarketPortfolioTab";
import MarketScreenerTab from "./tabs/MarketScreenerTab";
import TickerDetailOverlay from "./TickerDetailOverlay";

const MARKET_TABS = ["OVERVIEW", "EQUITIES", "RATES", "FX", "COMMODITIES", "CRYPTO", "PORTFOLIO", "SCREENER"] as const;
type MarketTab = typeof MARKET_TABS[number];

const SCENARIOS = [
  { id: "BASELINE",  label: "BASELINE",  title: "Normal market conditions" },
  { id: "RISK-OFF",  label: "RISK-OFF",  title: "Flight to safety: bonds, gold, JPY up; equities, EM down" },
  { id: "RATES UP",  label: "RATES UP",  title: "Yield shock: USD up, tech down, financials mixed" },
  { id: "OIL SHOCK", label: "OIL SHOCK", title: "Energy supply shock: crude up, airlines/plastics down, inflation risk" },
] as const;
type Scenario = typeof SCENARIOS[number]["id"];

export default function MarketWorkspace() {
  const [showLineup, setShowLineup] = useState(true);
  const [activeTab, setActiveTab] = useState<MarketTab>("OVERVIEW");
  const [scenario, setScenario] = useState<Scenario>("BASELINE");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  return (
    <div className="wv-market-workspace">
      {showLineup && <DailyLineupModal onClose={() => setShowLineup(false)} />}

      <MarketTickerBar />

      {/* Command bar: asset-class tabs + scenario switcher + daily briefing */}
      <div className="wv-market-command-bar">
        <div className="wv-market-tab-row">
          {MARKET_TABS.map((tab) => (
            <button
              key={tab}
              className={`wv-market-tab${activeTab === tab ? " is-active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="wv-market-scenario-row">
          <span className="wv-market-scenario-label">SCENARIO</span>
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              className={`wv-market-scenario-btn${scenario === s.id ? " is-active" : ""}`}
              onClick={() => setScenario(s.id as Scenario)}
              title={s.title}
            >
              {s.label}
            </button>
          ))}
        </div>

        <button
          className="wv-market-briefing-btn"
          onClick={() => setShowLineup(true)}
          title="Open daily market briefing"
        >
          DAILY BRIEFING
        </button>
      </div>

      {/* Tab content — position:relative so TickerDetailOverlay can fill it */}
      <div className="wv-market-tab-content" style={{ position: "relative" }}>
        {activeTab === "OVERVIEW"    && <MarketOverviewTab scenario={scenario} onTickerClick={setSelectedTicker} />}
        {activeTab === "EQUITIES"    && <MarketEquitiesTab onTickerClick={setSelectedTicker} />}
        {activeTab === "RATES"       && <MarketRatesTab />}
        {activeTab === "FX"          && <MarketFxTab onTickerClick={setSelectedTicker} />}
        {activeTab === "COMMODITIES" && <MarketCommoditiesTab />}
        {activeTab === "CRYPTO"      && <MarketCryptoTab onTickerClick={setSelectedTicker} />}
        {activeTab === "PORTFOLIO"   && <MarketPortfolioTab onTickerClick={setSelectedTicker} />}
        {activeTab === "SCREENER"    && <MarketScreenerTab onTickerClick={setSelectedTicker} />}

        {selectedTicker && (
          <TickerDetailOverlay
            sym={selectedTicker}
            onClose={() => setSelectedTicker(null)}
          />
        )}
      </div>
    </div>
  );
}
