import type { RawEconomicHub, EconomicHubRecord, EconomicHubSourceTrace } from "./types";

// ── Fixed weights (document these — they do not change across runs) ────────────
// Finance: stock exchange presence + OSM financial POI density
// Trade:   port/airport presence + OSM logistics density
// Urban:   log-scaled city population
// Macro:   log-scaled country GDP + trade openness
const WEIGHTS = {
  finance: 0.35,
  trade:   0.30,
  urban:   0.20,
  macro:   0.15,
} as const;

const MIN_SCORE_THRESHOLD = 25;
const MAX_HUBS = 300;

// ── Raw sub-score computation (0–100, prior to cross-hub normalization) ────────

function computeRawFinance(hub: RawEconomicHub): number {
  // Exchange presence: binary 50-pt bonus (major driver)
  const exchangeBonus = hub.hasExchange ? 50 : 0;
  // POI density: log-scaled bank + financial office count
  const poiScore = Math.min(50, Math.log10(hub.poiCounts.banks + hub.poiCounts.financial * 2 + 1) * 22);
  return Math.min(100, exchangeBonus + poiScore);
}

function computeRawTrade(hub: RawEconomicHub): number {
  // Port and airport presence: binary bonuses
  const portBonus    = hub.hasPort ? 40 : 0;
  const airportBonus = hub.hasAirport ? 25 : 0;
  // OSM logistics landuse density (industrial nodes as proxy)
  const logisticsScore = Math.min(35, Math.log10(hub.poiCounts.industrial + 1) * 12);
  return Math.min(100, portBonus + airportBonus + logisticsScore);
}

function computeRawUrban(hub: RawEconomicHub): number {
  const pop = hub.population;
  if (!pop || pop <= 0) return 0;
  // log10(300k) ≈ 5.48, log10(20M) ≈ 7.30
  // Normalize: (log10(pop) - 5.0) / 2.5 * 100
  const logPop = Math.log10(Math.max(1, pop));
  return Math.min(100, Math.max(0, ((logPop - 5.0) / 2.5) * 100));
}

function computeRawMacro(hub: RawEconomicHub): number {
  const gdp = hub.macro?.gdpUsd;
  if (!gdp || gdp <= 0) return 20; // default: 20/100 when no WB data
  // log10(1e9) = 9, log10(30e12) ≈ 13.5
  // Normalize: (log10(gdp) - 9) / 4.5 * 80 + trade openness boost
  const logGdp = Math.log10(gdp);
  const tradeBoost = ((hub.macro?.tradeGdpPct ?? 30) / 100) * 20;
  return Math.min(100, Math.max(0, ((logGdp - 9) / 4.5) * 80 + tradeBoost));
}

// ── Min-max normalization across all hubs for a single dimension ──────────────

function minMaxNormalize(values: number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 50); // degenerate: all identical
  return values.map((v) => ((v - min) / (max - min)) * 100);
}

// ── Public entry point ────────────────────────────────────────────────────────

export function rankAndScoreHubs(
  rawHubs: RawEconomicHub[],
  overpassTs: number,
  wikidataTs: number,
  worldbankTs: number,
): EconomicHubRecord[] {
  if (rawHubs.length === 0) return [];

  // Pass 1: compute raw sub-scores per hub
  const rawF = rawHubs.map(computeRawFinance);
  const rawT = rawHubs.map(computeRawTrade);
  const rawU = rawHubs.map(computeRawUrban);
  const rawM = rawHubs.map(computeRawMacro);

  // Pass 2: min-max normalize each dimension across the full hub set
  const normF = minMaxNormalize(rawF);
  const normT = minMaxNormalize(rawT);
  const normU = minMaxNormalize(rawU);
  const normM = minMaxNormalize(rawM);

  const OVERPASS_QUERY_SUMMARY = "OSM nodes: bank, financial office, industrial landuse, harbour, port, aerodrome(IATA); 50km radius haversine";

  const scored: (EconomicHubRecord & { _sortScore: number })[] = rawHubs.map((hub, i) => {
    const finance = normF[i];
    const trade   = normT[i];
    const urban   = normU[i];
    const macro   = normM[i];
    const total   = WEIGHTS.finance * finance + WEIGHTS.trade * trade + WEIGHTS.urban * urban + WEIGHTS.macro * macro;

    const sourceTrace: EconomicHubSourceTrace = {
      wikidataQid:         hub.wikidataQid,
      overpassQuery:       OVERPASS_QUERY_SUMMARY,
      worldBankIndicators: ["NY.GDP.MKTP.CD", "NE.TRD.GNFS.ZS"],
      lastUpdated: {
        wikidata:  wikidataTs,
        overpass:  overpassTs,
        worldbank: worldbankTs,
      },
    };

    return {
      _sortScore: total,
      id:            hub.id,
      wikidataQid:   hub.wikidataQid,
      name:          hub.name,
      country:       hub.country,
      countryIso2:   hub.countryIso2,
      admin1:        hub.admin1,
      lat:           hub.lat,
      lon:           hub.lon,
      population:    hub.population,
      scoreTotal:    Math.round(total),
      scoreBreakdown: {
        finance: Math.round(finance),
        trade:   Math.round(trade),
        urban:   Math.round(urban),
        macro:   Math.round(macro),
      },
      rawFinance: rawF[i],
      rawTrade:   rawT[i],
      rawUrban:   rawU[i],
      rawMacro:   rawM[i],
      rank:        0, // assigned below
      keyAssets:   hub.keyAssets,
      sourceTrace,
      lastUpdated: Date.now(),
    };
  });

  // Sort descending by weighted score, assign rank, filter and cap
  scored.sort((a, b) => b._sortScore - a._sortScore);
  scored.forEach((hub, i) => { hub.rank = i + 1; });

  return scored
    .filter((hub) => hub.scoreTotal >= MIN_SCORE_THRESHOLD)
    .slice(0, MAX_HUBS)
    .map(({ _sortScore: _s, ...rest }) => rest);
}
