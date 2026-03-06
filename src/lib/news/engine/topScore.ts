import { MARKET_MOVING_KEYWORDS } from "../../../config/newsConfig";
import type { StreamItem } from "../stream/types";

// ---------------------------------------------------------------------------
// TOP scoring model — computes importance (0–100) and explanations for
// "why it's top". Used both server-side (in StreamStore) and for the TOP tab.
// ---------------------------------------------------------------------------

interface TopScoreContext {
  watchlistEntities?: Set<string>;
  viewportBbox?: { west: number; south: number; east: number; north: number };
  now?: number;
}

interface TopScoreResult {
  importance: number;
  signals: string[];
}

const CRITICAL_KEYWORDS = new Set([
  "nuclear", "sanctions", "cyberattack", "outage", "blackout", "coup",
  "assassination", "invasion", "war", "collapse", "emergency", "pandemic",
  "earthquake", "tsunami", "hurricane", "explosion", "attack", "missile",
  "airstrike", "ceasefire", "evacuation", "martial law",
]);

const MAJOR_COUNTRIES = new Set([
  "US", "CN", "RU", "GB", "FR", "DE", "JP", "IN", "UA", "IL", "IR",
  "SA", "KR", "TW", "BR", "AU",
]);

const HIGH_WEIGHT_CATEGORIES = new Set([
  "markets", "energy", "defense", "cyber", "filings", "government",
]);

export function computeTopScore(item: StreamItem, context: TopScoreContext = {}): TopScoreResult {
  const now = context.now ?? Date.now();
  const signals: string[] = [];
  let score = 0;

  // 1. Recency (0–25)
  const ageMin = Math.max(0, (now - item.timestamp) / 60_000);
  let recency: number;
  if (ageMin <= 5) { recency = 25; signals.push("Breaking (< 5 min)"); }
  else if (ageMin <= 15) { recency = 22; signals.push("Very recent (< 15 min)"); }
  else if (ageMin <= 30) { recency = 18; signals.push("Recent (< 30 min)"); }
  else if (ageMin <= 60) { recency = 14; }
  else if (ageMin <= 360) { recency = 8; }
  else if (ageMin <= 1440) { recency = 4; }
  else { recency = 1; }
  score += recency;

  // 2. Multi-source corroboration (0–20)
  const sourceCount = item.duplicateCount;
  if (sourceCount >= 5) { score += 20; signals.push(`Multi-source (${sourceCount} outlets)`); }
  else if (sourceCount >= 3) { score += 15; signals.push(`Multi-source (${sourceCount} outlets)`); }
  else if (sourceCount >= 2) { score += 10; signals.push("Corroborated (2 sources)"); }

  // 3. Category weight (0–10)
  if (HIGH_WEIGHT_CATEGORIES.has(item.category)) {
    score += 10;
    signals.push(`High-priority category (${item.category})`);
  } else if (item.category === "world") {
    score += 6;
  }

  // 4. Critical keyword boost (0–15)
  const headline = item.headline.toLowerCase();
  const summary = (item.summary ?? "").toLowerCase();
  const text = `${headline} ${summary}`;
  let keywordBoost = 0;
  const criticalArr = Array.from(CRITICAL_KEYWORDS);
  for (let ci = 0; ci < criticalArr.length; ci++) {
    const kw = criticalArr[ci];
    if (text.includes(kw)) {
      keywordBoost += 8;
      signals.push(`Critical keyword: ${kw}`);
      break;
    }
  }
  for (const [needle, weight] of Object.entries(MARKET_MOVING_KEYWORDS)) {
    if (text.includes(needle.toLowerCase())) {
      keywordBoost += weight;
    }
  }
  score += Math.min(15, keywordBoost);

  // 5. Entity importance (0–10)
  const entityNames = item.entities.map((e) => e.name.toLowerCase());
  const countryCode = item.geo?.countryCode?.toUpperCase();
  if (countryCode && MAJOR_COUNTRIES.has(countryCode)) {
    score += 5;
    signals.push(`Major country (${countryCode})`);
  }
  if (item.tickers.length > 0) {
    score += 3;
  }

  // 6. Watchlist match (0–10)
  if (context.watchlistEntities && context.watchlistEntities.size > 0) {
    const matchedWatchlist = entityNames.some((e) => context.watchlistEntities!.has(e)) ||
      item.tickers.some((t) => context.watchlistEntities!.has(t.toLowerCase()));
    if (matchedWatchlist) {
      score += 10;
      signals.push("Watchlist match");
    }
  }

  // 7. Geo relevance / viewport (0–5)
  if (context.viewportBbox && item.geo) {
    const { lat, lon } = item.geo;
    const { west, south, east, north } = context.viewportBbox;
    const latOk = lat >= south && lat <= north;
    const lonOk = west <= east ? (lon >= west && lon <= east) : (lon >= west || lon <= east);
    if (latOk && lonOk) {
      score += 5;
      signals.push("In current viewport");
    }
  }

  // 8. Source credibility bonus (0–5)
  const domain = item.sourceDomain.toLowerCase();
  if (domain.includes("reuters") || domain.includes("apnews") || domain.includes("bloomberg")) {
    score += 5;
  } else if (domain.includes("ft.com") || domain.includes("wsj.com") || domain.includes("nytimes.com")) {
    score += 4;
  } else if (domain.includes("sec.gov")) {
    score += 5;
  } else if (domain.includes("bbc")) {
    score += 3;
  }

  const importance = Math.max(0, Math.min(100, Math.round(score)));
  return { importance, signals };
}

// ---------------------------------------------------------------------------
// TOP tab selector — picks the best items for the TOP stream.
// ---------------------------------------------------------------------------

export function selectTopItems(
  allItems: StreamItem[],
  options: {
    maxAge?: number;
    minImportance?: number;
    maxPerCategory?: number;
    limit?: number;
  } = {}
): StreamItem[] {
  const {
    maxAge = 24 * 60 * 60_000,
    minImportance = 15,
    maxPerCategory = 50,
    limit = 200,
  } = options;

  const now = Date.now();
  const cutoff = now - maxAge;

  const eligible = allItems
    .filter((item) => item.timestamp >= cutoff && item.importance >= minImportance);

  const byGroup = new Map<string, StreamItem>();
  for (const item of eligible) {
    const key = item.duplicateGroupId || item.id;
    const existing = byGroup.get(key);
    if (!existing || item.importance > existing.importance) {
      byGroup.set(key, item);
    }
  }

  const deduped = Array.from(byGroup.values());
  deduped.sort((a, b) => b.importance - a.importance || b.timestamp - a.timestamp);

  const categoryCounts = new Map<string, number>();
  const result: StreamItem[] = [];

  for (const item of deduped) {
    if (result.length >= limit) break;
    const catCount = categoryCounts.get(item.category) || 0;
    if (catCount >= maxPerCategory) continue;
    result.push(item);
    categoryCounts.set(item.category, catCount + 1);
  }

  return result;
}
