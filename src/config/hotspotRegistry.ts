export type TimeWindow = "6h" | "24h" | "7d";

export interface HotspotDefinition {
  id: string;
  name: string;
  tier: "LOW" | "MED" | "HIGH";
  tags: string[];
  anchor: { lat: number; lon: number };
  scope: { countries: string[]; bbox: [number, number, number, number] };
  baselineScore: number;
  whyItMatters: string;
  keyEntities: string[];
  historicalContext: {
    lastMajorEvent: string;
    precedents: string;
    cyclicalPattern: string;
  };
  driverQueries: string[];
  summary: string;
  usOnly?: boolean;
  status?: string;
}

export const HOTSPOT_REGISTRY: HotspotDefinition[] = [
  {
    id: "horn-of-africa",
    name: "HORN OF AFRICA",
    tier: "LOW",
    tags: ["Piracy", "Conflict"],
    anchor: { lat: 10.0, lon: 49.0 },
    scope: {
      countries: ["SO", "ET", "DJ", "ER"],
      bbox: [36.0, -2.0, 54.0, 18.0],
    },
    baselineScore: 4,
    whyItMatters: "Bab el-Mandeb chokepoint security; 12% of global trade at risk; Red Sea shipping rerouting",
    keyEntities: ["USAFRICOM", "EUNAVFOR"],
    historicalContext: {
      lastMajorEvent: "Sudan war outbreak (2023-04-15)",
      precedents: "Ethiopia-Eritrea war, Tigray war, Somali civil war, Sudan coups, piracy waves",
      cyclicalPattern: "Monsoon affects naval operations (Jun-Sep)",
    },
    driverQueries: ["piracy Red Sea", "Al-Shabaab", "Ethiopia Somaliland", "Houthi shipping", "Sudan civil war"],
    summary: "Resurgent piracy, Al-Shabaab activity, Ethiopia-Somaliland port dispute.",
    status: "Monitoring",
  },
  {
    id: "south-china-sea",
    name: "SOUTH CHINA SEA",
    tier: "HIGH",
    tags: ["Maritime", "Military"],
    anchor: { lat: 14.5, lon: 115.0 },
    scope: {
      countries: ["CN", "PH", "VN", "MY", "TW"],
      bbox: [105.0, 2.0, 125.0, 25.0],
    },
    baselineScore: 3,
    whyItMatters: "Critical SLOC for global shipping; contested sovereignty; Taiwan contingency overlap",
    keyEntities: ["USINDOPACOM", "PLA Navy", "ASEAN"],
    historicalContext: {
      lastMajorEvent: "Second Thomas Shoal confrontations (2024)",
      precedents: "Scarborough Shoal standoff, island-building campaign, UNCLOS ruling (2016)",
      cyclicalPattern: "Typhoon season reduces operations (Jul-Nov)",
    },
    driverQueries: ["South China Sea military", "Philippines China", "Taiwan Strait", "Spratly Islands"],
    summary: "Persistent PLA Navy patrols, Philippine coast guard confrontations, island militarization.",
    status: "Elevated",
  },
  {
    id: "ukraine-frontline",
    name: "UKRAINE FRONTLINE",
    tier: "HIGH",
    tags: ["Conflict", "Energy"],
    anchor: { lat: 48.5, lon: 37.5 },
    scope: {
      countries: ["UA", "RU"],
      bbox: [30.0, 44.0, 42.0, 53.0],
    },
    baselineScore: 5,
    whyItMatters: "Largest land war in Europe since WWII; energy supply disruption; nuclear escalation risk",
    keyEntities: ["NATO", "IAEA", "OSCE"],
    historicalContext: {
      lastMajorEvent: "Full-scale Russian invasion (2022-02-24)",
      precedents: "Crimea annexation (2014), Donbas war, Minsk agreements",
      cyclicalPattern: "Spring/autumn offensive windows; winter energy leverage",
    },
    driverQueries: ["Ukraine frontline", "Russian offensive", "Donbas battle", "Ukraine energy", "Zaporizhzhia nuclear"],
    summary: "Active frontline combat, energy infrastructure targeting, nuclear plant concerns.",
    status: "Active conflict",
  },
  {
    id: "us-gulf-coast",
    name: "US GULF COAST",
    tier: "MED",
    tags: ["Weather", "Infrastructure"],
    anchor: { lat: 29.5, lon: -90.0 },
    scope: {
      countries: ["US"],
      bbox: [-98.0, 25.0, -80.0, 32.0],
    },
    baselineScore: 2,
    whyItMatters: "30% of US refining capacity; LNG export terminals; hurricane vulnerability",
    keyEntities: ["FEMA", "NHC", "US Coast Guard"],
    historicalContext: {
      lastMajorEvent: "Hurricane Idalia (2023-08-30)",
      precedents: "Katrina, Harvey, Ida, Deepwater Horizon",
      cyclicalPattern: "Atlantic hurricane season (Jun 1 - Nov 30)",
    },
    driverQueries: ["Gulf Coast hurricane", "Texas refinery", "Louisiana storm", "FAA Gulf delay"],
    summary: "Seasonal hurricane risk, oil/gas infrastructure exposure, flood-prone coast.",
    usOnly: true,
    status: "Monitoring",
  },
  {
    id: "persian-gulf",
    name: "PERSIAN GULF / STRAIT OF HORMUZ",
    tier: "HIGH",
    tags: ["Energy", "Maritime"],
    anchor: { lat: 26.5, lon: 56.0 },
    scope: {
      countries: ["IR", "AE", "SA", "OM", "QA", "BH", "KW"],
      bbox: [47.0, 22.0, 60.0, 31.0],
    },
    baselineScore: 3,
    whyItMatters: "21% of daily global oil transit; 25% of LNG; military standoff potential",
    keyEntities: ["USCENTCOM", "IRGC Navy", "OPEC"],
    historicalContext: {
      lastMajorEvent: "Tanker seizures (2023)",
      precedents: "Iran-Iraq tanker war, USS Vincennes, JCPOA withdrawal",
      cyclicalPattern: "Regional tensions spike during nuclear talks",
    },
    driverQueries: ["Strait of Hormuz", "Iran tanker", "Persian Gulf military", "IRGC naval"],
    summary: "Chokepoint for global energy, frequent Iranian naval confrontations, sanctions enforcement.",
    status: "Elevated",
  },
  {
    id: "taiwan-strait",
    name: "TAIWAN STRAIT",
    tier: "HIGH",
    tags: ["Military", "Maritime"],
    anchor: { lat: 24.5, lon: 119.5 },
    scope: {
      countries: ["TW", "CN"],
      bbox: [116.0, 21.5, 123.0, 27.0],
    },
    baselineScore: 3,
    whyItMatters: "90% of advanced semiconductors; key Pacific deterrence link; cross-strait escalation risk",
    keyEntities: ["PLA", "TSMC", "US 7th Fleet"],
    historicalContext: {
      lastMajorEvent: "PLA exercises after Pelosi visit (2022-08)",
      precedents: "1996 Taiwan Strait Crisis, Third Communiqué",
      cyclicalPattern: "Political cycle around Taiwan elections",
    },
    driverQueries: ["Taiwan Strait military", "PLA exercises Taiwan", "cross-strait tension", "semiconductor supply"],
    summary: "Intensifying PLA air and naval patrols, semiconductor supply chain risk, deterrence calculus.",
    status: "Elevated",
  },
  {
    id: "korean-peninsula",
    name: "KOREAN PENINSULA",
    tier: "MED",
    tags: ["Nuclear", "Military"],
    anchor: { lat: 38.0, lon: 127.0 },
    scope: {
      countries: ["KP", "KR"],
      bbox: [124.0, 33.0, 132.0, 43.0],
    },
    baselineScore: 3,
    whyItMatters: "Nuclear-armed state; 28,500 US troops forward deployed; Seoul within artillery range",
    keyEntities: ["USFK", "UN Command", "IAEA"],
    historicalContext: {
      lastMajorEvent: "ICBM tests (2023)",
      precedents: "Korean War, Agreed Framework, six-party talks, Panmunjom summit",
      cyclicalPattern: "Provocations often follow leadership transitions",
    },
    driverQueries: ["North Korea missile", "DPRK nuclear", "Korean DMZ", "Kim Jong Un"],
    summary: "Persistent ICBM/nuclear testing, artillery threat to Seoul, inter-Korean freeze.",
    status: "Monitoring",
  },
  {
    id: "sahel-region",
    name: "SAHEL REGION",
    tier: "HIGH",
    tags: ["Conflict", "Terrorism"],
    anchor: { lat: 14.0, lon: 2.0 },
    scope: {
      countries: ["ML", "BF", "NE", "TD", "NG"],
      bbox: [-6.0, 8.0, 16.0, 24.0],
    },
    baselineScore: 4,
    whyItMatters: "Expanding jihadi insurgency; Wagner/Africa Corps presence; migration push to Europe",
    keyEntities: ["JNIM", "ISGS", "ECOWAS", "Africa Corps"],
    historicalContext: {
      lastMajorEvent: "Niger coup (2023-07-26)",
      precedents: "Mali coups, Operation Barkhane withdrawal, Boko Haram expansion",
      cyclicalPattern: "Dry season (Oct-May) enables militant mobility",
    },
    driverQueries: ["Sahel attack", "Mali insurgency", "Burkina Faso violence", "Niger security", "JNIM attack"],
    summary: "Multiple military juntas, jihadi expansion, French withdrawal, Wagner deployment.",
    status: "Active conflict",
  },
  {
    id: "eastern-med",
    name: "EASTERN MEDITERRANEAN",
    tier: "HIGH",
    tags: ["Conflict", "Energy"],
    anchor: { lat: 33.5, lon: 35.5 },
    scope: {
      countries: ["SY", "LB", "IL", "PS", "CY"],
      bbox: [30.0, 29.0, 42.0, 38.0],
    },
    baselineScore: 4,
    whyItMatters: "Active conflict zone; regional escalation chain (Iran-Hezbollah-Hamas); East Med gas fields",
    keyEntities: ["IDF", "Hezbollah", "UNIFIL", "USEUCOM"],
    historicalContext: {
      lastMajorEvent: "Israel-Hamas conflict escalation (2023-10-07)",
      precedents: "Lebanon wars, Syrian civil war, Intifadas",
      cyclicalPattern: "Escalation around religious observances and political events",
    },
    driverQueries: ["Gaza conflict", "Hezbollah Israel", "Syria airstrike", "Lebanon crisis", "East Mediterranean"],
    summary: "Ongoing Gaza operations, Hezbollah escalation risk, Syrian fragmentation, Lebanese collapse.",
    status: "Active conflict",
  },
  {
    id: "south-caucasus",
    name: "SOUTH CAUCASUS",
    tier: "MED",
    tags: ["Conflict", "Energy"],
    anchor: { lat: 40.5, lon: 45.0 },
    scope: {
      countries: ["AM", "AZ", "GE"],
      bbox: [40.0, 38.0, 52.0, 44.0],
    },
    baselineScore: 2,
    whyItMatters: "BTC/BTE energy corridor; Russian peacekeeping leverage; unresolved Nagorno-Karabakh status",
    keyEntities: ["CSTO", "Russia PKF", "OSCE Minsk Group"],
    historicalContext: {
      lastMajorEvent: "Azerbaijan Karabakh operation (2023-09-19)",
      precedents: "2020 Nagorno-Karabakh war, 2008 Georgia war",
      cyclicalPattern: "Post-ceasefire border tensions",
    },
    driverQueries: ["Armenia Azerbaijan", "South Caucasus", "Nagorno Karabakh", "Georgia unrest"],
    summary: "Post-Karabakh displacement, border demarcation disputes, corridor negotiations.",
    status: "Monitoring",
  },
  {
    id: "kashmir-loc",
    name: "KASHMIR LINE OF CONTROL",
    tier: "MED",
    tags: ["Military", "Nuclear"],
    anchor: { lat: 34.5, lon: 75.0 },
    scope: {
      countries: ["IN", "PK"],
      bbox: [72.0, 32.0, 78.0, 37.0],
    },
    baselineScore: 2,
    whyItMatters: "Nuclear-armed adversaries; Siachen glacier dispute; potential escalation to nuclear exchange",
    keyEntities: ["Indian Army", "Pakistan Army", "UNMOGIP"],
    historicalContext: {
      lastMajorEvent: "Pulwama-Balakot crisis (2019-02)",
      precedents: "1947/1965/1971/1999 wars, Kargil crisis",
      cyclicalPattern: "Summer infiltration season (Apr-Oct)",
    },
    driverQueries: ["Kashmir LOC firing", "India Pakistan border", "Kashmir militant", "Siachen"],
    summary: "Ceasefire generally holding; sporadic militant infiltration; nuclear deterrence overhang.",
    status: "Monitoring",
  },
  {
    id: "venezuela-guyana",
    name: "VENEZUELA-GUYANA BORDER",
    tier: "LOW",
    tags: ["Territorial", "Resources"],
    anchor: { lat: 6.5, lon: -60.0 },
    scope: {
      countries: ["VE", "GY"],
      bbox: [-66.0, 1.0, -56.0, 12.0],
    },
    baselineScore: 1,
    whyItMatters: "Essequibo oil discoveries; 159,500 km² territorial claim; ICJ jurisdiction dispute",
    keyEntities: ["ICJ", "Exxon Mobil", "CARICOM"],
    historicalContext: {
      lastMajorEvent: "Venezuela referendum on Essequibo (2023-12-03)",
      precedents: "1899 Paris Award, 1966 Geneva Agreement",
      cyclicalPattern: "Rhetoric spikes before Venezuelan elections",
    },
    driverQueries: ["Venezuela Guyana Essequibo", "Venezuela military border", "Guyana oil dispute"],
    summary: "Sovereignty claim over oil-rich Essequibo region; referendum escalation; ICJ proceedings.",
    status: "Monitoring",
  },
  {
    id: "malacca-strait",
    name: "MALACCA STRAIT",
    tier: "MED",
    tags: ["Maritime", "Trade"],
    anchor: { lat: 2.5, lon: 101.5 },
    scope: {
      countries: ["MY", "SG", "ID"],
      bbox: [95.0, -2.0, 106.0, 8.0],
    },
    baselineScore: 2,
    whyItMatters: "25% of global seaborne trade; chokepoint for China/Japan/Korea energy imports",
    keyEntities: ["FPDA", "Malacca Strait Patrol", "IMO"],
    historicalContext: {
      lastMajorEvent: "Increased piracy incidents (2024)",
      precedents: "2004 tsunami, piracy surge (2000s), MSTC patrol framework",
      cyclicalPattern: "Northeast monsoon (Nov-Mar) piracy window",
    },
    driverQueries: ["Malacca Strait piracy", "Singapore Strait shipping", "maritime security Southeast Asia"],
    summary: "Vital global shipping lane; low-level piracy persists; regional naval cooperation.",
    status: "Monitoring",
  },
  {
    id: "libya-chad-corridor",
    name: "LIBYA-CHAD CORRIDOR",
    tier: "MED",
    tags: ["Conflict", "Migration"],
    anchor: { lat: 22.0, lon: 16.0 },
    scope: {
      countries: ["LY", "TD", "SD"],
      bbox: [9.0, 12.0, 25.0, 33.0],
    },
    baselineScore: 3,
    whyItMatters: "Major migration route to Europe; arms proliferation corridor; Wagner/Africa Corps presence",
    keyEntities: ["GNA", "LNA", "Wagner Group", "IOM"],
    historicalContext: {
      lastMajorEvent: "Derna flood disaster (2023-09-11)",
      precedents: "Libyan civil wars (2011, 2014, 2019), Chad insurgency cycles",
      cyclicalPattern: "Migration surges in spring/summer",
    },
    driverQueries: ["Libya conflict", "Chad rebel", "Saharan migration", "Fezzan instability"],
    summary: "Dual Libyan government stalemate, Chadian border instability, migration and arms trafficking.",
    status: "Monitoring",
  },
];
