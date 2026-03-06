"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export interface CriticalMineralDetailData {
  id: string;
  name: string;
  mineralType: string;
  commodities: string[];
  depositType: string;
  country: string;
  countryName: string;
  region?: string;
  operator?: string;
  status: string;
  annualOutputTonnes?: number;
  reservesTonnes?: number;
  strategicTier: string;
  supplyRisk: string;
  geopoliticalNotes?: string;
  lat: number;
  lon: number;
  lastUpdated: number | null;
}

interface CriticalMineralDetailCardProps {
  detail: CriticalMineralDetailData;
  onClose: () => void;
}

function formatLatLon(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew}`;
}

function supplyRiskClass(risk: string): string {
  if (risk === "Very High") return "is-operating";
  if (risk === "High") return "is-operating";
  if (risk === "Medium") return "is-construction";
  return "is-planned";
}

interface MineralTypeInfo {
  description: string;
  keyUses: string[];
  whyCritical: string;
}

const MINERAL_TYPE_INFO: Record<string, MineralTypeInfo> = {
  "Lithium": {
    description: "Lightest metal on the periodic table; highly reactive alkali metal found in brines and hard-rock pegmatites.",
    keyUses: ["EV & grid-scale batteries (Li-ion)", "Consumer electronics", "Aerospace alloys", "Glass & ceramics"],
    whyCritical: "Irreplaceable anode/electrolyte material in lithium-ion batteries — the backbone of the EV revolution and renewable energy storage. No commercially viable substitute at scale.",
  },
  "Cobalt": {
    description: "Hard, lustrous transition metal; primarily recovered as a by-product of nickel and copper mining.",
    keyUses: ["Li-ion battery cathodes (NMC/NCA)", "Superalloys for jet engines", "Hard metals & cutting tools", "Pigments & magnets"],
    whyCritical: "Essential for high-energy-density battery cathodes and high-temperature superalloys used in aerospace/defense. ~70% supply concentrated in politically unstable DRC.",
  },
  "Rare Earths": {
    description: "Group of 17 elements including lanthanides, scandium, and yttrium; often found together in carbonatite and ion-adsorption clay deposits.",
    keyUses: ["Permanent magnets (Nd-Fe-B) for EVs & wind turbines", "Defense guidance systems & radar", "Catalytic converters", "Phosphors for displays & LEDs"],
    whyCritical: "Neodymium and dysprosium are irreplaceable in the world's strongest permanent magnets. China controls ~85% of processing, weaponizing supply in trade disputes.",
  },
  "Copper": {
    description: "Highly conductive, ductile metal with the longest history of human use; mined primarily as porphyry deposits.",
    keyUses: ["Electrical wiring & power grids", "EV motors & charging infrastructure", "Renewable energy systems", "Plumbing & industrial machinery"],
    whyCritical: "The 'metal of electrification' — essential for every stage of the energy transition. EVs use 3–4× more copper than ICE vehicles. Decades-long supply deficit projected.",
  },
  "Nickel": {
    description: "Silvery-white transition metal valued for corrosion resistance and high-temperature strength.",
    keyUses: ["EV battery cathodes (NMC, NCA, LNMO)", "Stainless steel production", "Superalloys for jet engines", "Electroplating"],
    whyCritical: "Class-1 high-purity nickel is essential for high-energy Li-ion battery cathodes. Indonesia's dominance and Chinese processing control create strategic concentration risk.",
  },
  "Graphite": {
    description: "Crystalline form of carbon; natural graphite comes from metamorphic deposits; synthetic graphite from petroleum coke.",
    keyUses: ["Li-ion battery anodes (>95% of anode material)", "Lubricants & refractory materials", "Nuclear moderator rods", "Fuel cells & electrodes"],
    whyCritical: "Every Li-ion battery requires ~10× more graphite than lithium by weight. China produces ~65% of natural graphite and controls ~90% of battery-grade processing — and imposed export controls in 2023.",
  },
  "Manganese": {
    description: "Hard, brittle transition metal essential for steel production; emerging importance in next-gen battery chemistry.",
    keyUses: ["Steel strengthening agent (virtually all steel)", "EV battery cathodes (LMFP, LNMO)", "Aluminium alloys", "Dry-cell batteries"],
    whyCritical: "Steel without manganese would be brittle and unusable. LMFP battery chemistry (cobalt-free) relies on manganese, making it central to future battery diversification from cobalt/nickel.",
  },
  "Titanium": {
    description: "Light, strong, corrosion-resistant metal with the best strength-to-weight ratio of any metal; extracted from ilmenite and rutile mineral sands.",
    keyUses: ["Aerospace structures & jet engine components", "Armor plating & military hardware", "Medical implants & prosthetics", "Pigment (TiO₂) for paints & plastics"],
    whyCritical: "No substitute offers equivalent strength-to-weight for aerospace and defense. Russia and China are dominant processors; Ukraine (now partially occupied) holds Europe's largest deposits.",
  },
  "Platinum Group Metals": {
    description: "Six rare noble metals (Pt, Pd, Rh, Ru, Ir, Os) with exceptional catalytic and high-temperature properties.",
    keyUses: ["Automotive catalytic converters (Pt, Pd, Rh)", "Hydrogen fuel cell electrodes (Pt)", "Industrial catalysts & chemicals", "Electronics & jewelry"],
    whyCritical: "Platinum is the cornerstone catalyst for hydrogen fuel cells and chemical production. Palladium/rhodium are irreplaceable in emissions control. ~90% of Pt reserves lie in South Africa's Bushveld Complex.",
  },
  "Uranium": {
    description: "Heavy radioactive metal; primary energy source for nuclear fission reactors; occurs in sandstone roll-front and unconformity deposits.",
    keyUses: ["Nuclear power generation", "Naval & military reactors", "Medical isotope production", "Industrial radiography"],
    whyCritical: "Only energy-dense, low-carbon baseload power source viable without intermittency. Nuclear renaissance driven by climate and energy security concerns is tightening uranium markets.",
  },
  "Tungsten": {
    description: "Densest metal with the highest melting point of all elements (3,422°C); found in skarn and granite-related vein deposits.",
    keyUses: ["Hardened cutting tools & drill bits", "Kinetic energy penetrators (military)", "Semiconductor manufacturing filaments", "High-performance alloys"],
    whyCritical: "Cannot be substituted in hardened steel tools or military armor-piercing projectiles. China controls ~80% of supply and imposed export controls in 2023, threatening Western defense-industrial supply chains.",
  },
  "Gallium": {
    description: "Soft, silvery metal produced as a by-product of aluminium (bauxite) and zinc smelting.",
    keyUses: ["Semiconductors (GaAs, GaN — 5G chips, radar, LEDs)", "Solar cells (CIGS thin-film)", "Alloys with low melting point"],
    whyCritical: "GaN chips are the foundation of 5G base stations, EV power electronics, and military radar. China produces ~80% of global gallium and imposed export controls in July 2023.",
  },
  "Vanadium": {
    description: "Hard, silvery-grey transition metal recovered from steel slag, magnetite, and shale deposits.",
    keyUses: ["High-strength steel (HSLA alloys)", "Grid-scale vanadium redox flow batteries (VRFB)", "Aerospace titanium alloys", "Catalysts in sulfuric acid production"],
    whyCritical: "VRFBs offer unlimited cycle life and are emerging as the leading long-duration grid storage technology — potentially more scalable than Li-ion for utility storage.",
  },
  "Phosphate": {
    description: "Sedimentary mineral deposit of phosphate rock; primary source of phosphorus for agriculture.",
    keyUses: ["Fertilizers (phosphoric acid, DAP, MAP)", "Animal feed supplements", "Industrial chemicals & detergents", "Lithium iron phosphate (LFP) batteries"],
    whyCritical: "Phosphorus is irreplaceable in fertilizers — no substitute exists for crop production. Without phosphate, global food supply collapses. Morocco controls ~70% of known reserves.",
  },
  "Phosphate / REE": {
    description: "Carbonatite-hosted deposit producing both phosphate fertilizer and rare earth elements as co-products.",
    keyUses: ["Fertilizers", "Rare earth elements (La, Ce)", "Industrial chemicals"],
    whyCritical: "Dual-use strategic deposit: phosphate for food security and REEs for clean energy and defense technology.",
  },
  "Aluminum / Bauxite": {
    description: "Bauxite is the primary ore for aluminium — the world's most widely used non-ferrous metal.",
    keyUses: ["Aerospace & automotive lightweighting", "Packaging & consumer goods", "Power transmission cables", "Gallium production (strategic semiconductor byproduct)"],
    whyCritical: "Aluminium is critical to lightweight vehicle and aircraft design. Gallium — essential for 5G chips and military radar — is exclusively produced as a bauxite by-product.",
  },
  "Bauxite": {
    description: "Sedimentary rock; primary ore for aluminium and gallium extraction.",
    keyUses: ["Aluminium smelting", "Gallium production", "Abrasives & refractories"],
    whyCritical: "The sole source of gallium, which is critical for semiconductors, 5G, and military electronics. China dominates both bauxite processing and gallium production.",
  },
  "Molybdenum": {
    description: "Hard, silvery transition metal with high melting point; found in porphyry copper deposits as a by-product.",
    keyUses: ["High-strength steel alloys (HSLA)", "Aerospace & defense components", "Chemical catalysts", "Lubricants (MoS₂)"],
    whyCritical: "Molybdenum steel is essential for high-temperature, high-stress applications in energy infrastructure and defense systems. US is a net importer.",
  },
  "Iron / Phosphate / REE": {
    description: "Multi-commodity carbonatite-phoscorite deposit producing iron ore, phosphate, and rare earth elements.",
    keyUses: ["Steel production", "Fertilizers", "REE for clean energy and defense"],
    whyCritical: "Strategic multi-commodity deposit combining food security (phosphate), industrial (iron), and defense (REE) criticality.",
  },
};

function getMineralInfo(mineralType: string): MineralTypeInfo | null {
  // Exact match first
  if (MINERAL_TYPE_INFO[mineralType]) return MINERAL_TYPE_INFO[mineralType];
  // Partial match
  for (const key of Object.keys(MINERAL_TYPE_INFO)) {
    if (mineralType.includes(key) || key.includes(mineralType)) return MINERAL_TYPE_INFO[key];
  }
  return null;
}

function formatTonnes(val: number | undefined): string {
  if (val == null || !Number.isFinite(val)) return "N/A";
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(2)}B t`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M t`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(0)}K t`;
  return `${val} t`;
}

export default function CriticalMineralDetailCard({ detail, onClose }: CriticalMineralDetailCardProps) {
  const [mounted, setMounted] = useState(false);
  const mineralInfo = getMineralInfo(detail.mineralType);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const locationParts = [detail.region, detail.countryName].filter(Boolean);

  const updatedLabel =
    detail.lastUpdated && Number.isFinite(detail.lastUpdated)
      ? new Date(detail.lastUpdated).toUTCString()
      : "Unknown";

  return createPortal(
    <div className="wv-hotspot-card" role="dialog" aria-label="Critical mineral deposit detail">
      <div className="wv-hotspot-card-hdr">
        <div className="wv-hotspot-card-headline">
          <div className="wv-hotspot-name">{detail.name.toUpperCase()}</div>
          <span className={`wv-hotspot-tier ${supplyRiskClass(detail.supplyRisk)}`}>
            {detail.supplyRisk} RISK
          </span>
        </div>
        <button
          type="button"
          className="wv-hotspot-close"
          onClick={onClose}
          aria-label="Close critical mineral details"
        >
          ×
        </button>
      </div>

      <div className="wv-hotspot-tags">
        {detail.mineralType}{detail.depositType ? ` — ${detail.depositType}` : ""}
      </div>

      <div className="wv-hotspot-section">
        <div className="wv-hotspot-kicker">METADATA</div>
        <div className="wv-hotspot-subscores">
          <div>Location {locationParts.join(" / ")}</div>
          <div>Operator {detail.operator ?? "Unknown"}</div>
          <div>Status {detail.status}</div>
          <div>Strategic Tier {detail.strategicTier}</div>
        </div>
      </div>

      <div className="wv-hotspot-section">
        <div className="wv-hotspot-kicker">STRATEGIC ASSESSMENT</div>
        <div className="wv-hotspot-subscores">
          <div>Supply Risk {detail.supplyRisk}</div>
          <div>Annual Output {detail.annualOutputTonnes != null ? `${formatTonnes(detail.annualOutputTonnes)}/yr` : "N/A"}</div>
          <div>Reserves {formatTonnes(detail.reservesTonnes)}</div>
        </div>
      </div>

      {mineralInfo && (
        <div className="wv-hotspot-section">
          <div className="wv-hotspot-kicker">WHAT IS {detail.mineralType.toUpperCase()}</div>
          <div className="wv-hotspot-summary">{mineralInfo.description}</div>
        </div>
      )}

      {mineralInfo && (
        <div className="wv-hotspot-section">
          <div className="wv-hotspot-kicker">KEY USES</div>
          <div className="wv-hotspot-subscores">
            {mineralInfo.keyUses.map((use) => (
              <div key={use}>· {use}</div>
            ))}
          </div>
        </div>
      )}

      {mineralInfo && (
        <div className="wv-hotspot-section">
          <div className="wv-hotspot-kicker">WHY IT'S CRITICAL</div>
          <div className="wv-hotspot-summary">{mineralInfo.whyCritical}</div>
        </div>
      )}

      {detail.commodities.length > 0 && (
        <div className="wv-hotspot-section">
          <div className="wv-hotspot-kicker">COMMODITIES</div>
          <div className="wv-hotspot-tags">
            {detail.commodities.join("  ·  ")}
          </div>
        </div>
      )}

      {detail.geopoliticalNotes ? (
        <div className="wv-hotspot-section">
          <div className="wv-hotspot-kicker">GEOPOLITICAL NOTES</div>
          <div className="wv-hotspot-summary">{detail.geopoliticalNotes}</div>
        </div>
      ) : null}

      <div className="wv-hotspot-section">
        <div className="wv-hotspot-kicker">COORDINATES</div>
        <div className="wv-hotspot-updated">{formatLatLon(detail.lat, detail.lon)}</div>
        <div className="wv-hotspot-updated">Updated: {updatedLabel}</div>
      </div>
    </div>,
    document.body
  );
}
