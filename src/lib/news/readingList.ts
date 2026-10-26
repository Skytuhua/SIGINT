import { z } from "zod";
import type { NewsArticle } from "./types";

export const READING_LIST_KEY = "si-news-reading-list-v1";
export const LEGACY_BOOKMARKS_KEY = "si-news-bookmarks";
export const READING_LIST_LIMIT = 200;
export interface ReadingListEntry { id: string; savedAt: number | null; article: NewsArticle | null }
export interface ReadingListSnapshot { entries: readonly ReadingListEntry[]; warning: string | null }
type ReadingListStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const text = (max: number) => z.string().max(max);
const idSchema = text(1024).min(1);
const finite = z.number().finite();
const backend = z.enum(["gdelt", "rss", "sec", "wikidata", "youtube", "newsapi", "derived", "hn", "wikimedia"]);
const coord = z.enum(["gdelt", "gdelt-geo", "wikidata", "nominatim", "none"]);
const sourceUrl = text(4096).url().refine(value => {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
});
// An explicit allowlist prevents feed-only payloads from entering persistent storage.
const articleSchema = z.object({
  id: idSchema, headline: text(2048).min(1), url: sourceUrl, canonicalUrl: sourceUrl,
  domain: text(256), source: text(256), publishedAt: finite, snippet: text(12_000),
  imageUrl: sourceUrl.optional(), language: text(32), country: text(128).optional(), region: text(256).optional(),
  entity: text(512).optional(), entityType: z.enum(["ticker", "company", "person", "location", "topic"]).optional(),
  aliases: z.array(text(256)).max(32).optional(), lat: finite.min(-90).max(90).optional(), lon: finite.min(-180).max(180).optional(),
  coordSource: coord.optional(), placeName: text(512).optional(), coordConfidence: finite.min(0).max(1).optional(),
  category: z.enum(["world", "markets", "financial", "ipo", "tech", "ai", "cyber", "semiconductors", "cloud", "startups", "events", "energy", "defense", "space", "biotech", "crypto", "local", "filings", "watchlist", "government", "forex", "commodities", "fintech", "regulation", "institutional"]),
  score: finite, marketMoving: z.boolean().optional(), dedupeKey: text(4096).optional(), threadId: text(1024).optional(),
  isThreadHead: z.boolean().optional(), threadCount: finite.int().nonnegative().optional(), backendSource: backend,
  provenance: z.object({ headlineSource: backend, coordsSource: coord, entitySource: z.union([backend, z.literal("none")]),
    confidence: finite.min(0).max(1), degraded: z.boolean().optional() }),
});
const entrySchema = z.object({ id: idSchema, savedAt: finite.nonnegative().nullable(), article: articleSchema.nullable() })
  .refine(entry => entry.article === null ? entry.savedAt === null : entry.article.id === entry.id);
const documentSchema = z.object({ version: z.literal(1), entries: z.array(entrySchema) })
  .refine(doc => new Set(doc.entries.map(entry => entry.id)).size === doc.entries.length);
const STORAGE_WARNING = "Reading list changes are kept for this session and may not survive reload. Local storage is unavailable.";
const PROTECTED_WARNING = "Existing reading list data could not be read safely and was left untouched. Changes are kept for this session and may not survive reload.";
const CAPACITY_WARNING = "Reading list limit is 200 articles. Remove an article before saving more.";
export const EMPTY_READING_LIST: ReadingListSnapshot = Object.freeze({ entries: Object.freeze([]), warning: null });

function freezeEntry(entry: ReadingListEntry): ReadingListEntry {
  if (entry.article) {
    if (entry.article.aliases) Object.freeze(entry.article.aliases);
    Object.freeze(entry.article.provenance);
    Object.freeze(entry.article);
  }
  return Object.freeze(entry);
}
function snapshotArticle(article: NewsArticle): NewsArticle | null {
  try {
    const bounded = (value: string | undefined, max: number) => value?.slice(0, max);
    const image = sourceUrl.safeParse(article.imageUrl);
    const parsed = articleSchema.safeParse({
      id: article.id, headline: bounded(article.headline, 2048), url: article.url, canonicalUrl: article.canonicalUrl,
      domain: bounded(article.domain, 256), source: bounded(article.source, 256), publishedAt: article.publishedAt,
      snippet: bounded(article.snippet, 12_000), imageUrl: image.success ? image.data : undefined, language: bounded(article.language, 32),
      country: bounded(article.country, 128), region: bounded(article.region, 256), entity: bounded(article.entity, 512),
      entityType: article.entityType, aliases: article.aliases?.slice(0, 32).map(alias => alias.slice(0, 256)),
      lat: article.lat, lon: article.lon, coordSource: article.coordSource, placeName: bounded(article.placeName, 512),
      coordConfidence: article.coordConfidence, category: article.category, score: article.score, marketMoving: article.marketMoving,
      dedupeKey: bounded(article.dedupeKey, 4096), threadId: bounded(article.threadId, 1024), isThreadHead: article.isThreadHead,
      threadCount: article.threadCount, backendSource: article.backendSource, provenance: article.provenance,
    });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function createNewsReadingListStore(provider: () => ReadingListStorage | null) {
  let state = EMPTY_READING_LIST;
  let hydrated = false;
  let storage: ReadingListStorage | null = null;
  let protectedData = false;
  let legacyPending = false;
  let storageWarning: string | null = null;
  let operationWarning: string | null = null;
  const listeners = new Set<() => void>();
  function publish(entries = state.entries) {
    const warning = [storageWarning, entries.length > READING_LIST_LIMIT ? CAPACITY_WARNING : operationWarning].filter(Boolean).join(" ") || null;
    if (entries === state.entries && warning === state.warning) return;
    state = Object.freeze({ entries: Object.freeze(entries), warning });
    listeners.forEach(listener => listener());
  }
  function persist(entries: readonly ReadingListEntry[]) {
    if (entries.length > READING_LIST_LIMIT || protectedData) return;
    try {
      if (!storage) throw new Error("Storage unavailable");
      storage.setItem(READING_LIST_KEY, JSON.stringify({ version: 1, entries }));
      if (legacyPending) { storage.removeItem(LEGACY_BOOKMARKS_KEY); legacyPending = false; }
      storageWarning = null;
    } catch { storageWarning = STORAGE_WARNING; }
  }
  function hydrate() {
    if (hydrated) return;
    hydrated = true;
    let entries: readonly ReadingListEntry[] = state.entries;
    try {
      storage = provider();
      if (!storage) throw new Error("Storage unavailable");
      const raw = storage.getItem(READING_LIST_KEY);
      if (raw !== null) {
        // Allows the worst-case JSON escaping of all 200 bounded snapshots.
        if (raw.length > 64_000_000) throw new Error("Oversized document");
        const parsed = documentSchema.safeParse(JSON.parse(raw));
        if (!parsed.success) throw new Error("Unsupported document");
        entries = parsed.data.entries.map(freezeEntry);
      } else {
        const legacy = storage.getItem(LEGACY_BOOKMARKS_KEY);
        if (legacy !== null) {
          const parsed = z.array(idSchema).safeParse(JSON.parse(legacy));
          if (!parsed.success) throw new Error("Invalid legacy document");
          entries = [...new Set(parsed.data)].map(id => freezeEntry({ id, savedAt: null, article: null }));
          legacyPending = true;
          persist(entries);
        }
      }
    } catch {
      // Never overwrite data we could not inspect, including failed reads.
      protectedData = true;
      storageWarning = storage ? PROTECTED_WARNING : STORAGE_WARNING;
    }
    publish(entries);
  }
  function remove(id: string) {
    hydrate();
    const entries = state.entries.filter(entry => entry.id !== id);
    if (entries.length === state.entries.length) return;
    operationWarning = null;
    persist(entries); publish(entries);
  }
  function toggle(article: NewsArticle) {
    hydrate();
    if (state.entries.some(entry => entry.id === article.id)) { remove(article.id); return; }
    if (state.entries.length >= READING_LIST_LIMIT) { operationWarning = CAPACITY_WARNING; publish(); return; }
    const snapshot = snapshotArticle(article);
    if (!snapshot) { operationWarning = "This article could not be saved because its details or source URL are invalid."; publish(); return; }
    operationWarning = null;
    const entries = [...state.entries, freezeEntry({ id: snapshot.id, savedAt: Date.now(), article: snapshot })];
    persist(entries); publish(entries);
  }
  function reconcile(articles: readonly NewsArticle[]) {
    hydrate();
    if (!state.entries.some(entry => !entry.article)) return;
    const observed = new Map(articles.map(article => [article.id, article]));
    let changed = false;
    const entries = state.entries.map(entry => {
      const match = !entry.article && observed.get(entry.id);
      const snapshot = match ? snapshotArticle(match) : null;
      if (!snapshot) return entry;
      changed = true;
      return freezeEntry({ ...entry, article: snapshot });
    });
    if (changed) { persist(entries); publish(entries); }
  }
  return { getSnapshot: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    hydrate, toggle, remove, reconcile };
}
export type NewsReadingListStore = ReturnType<typeof createNewsReadingListStore>;
// Access the browser getter only after mount. This module memory also survives NEWS unmounts.
export const newsReadingListStore = createNewsReadingListStore(() => typeof window === "undefined" ? null : window.localStorage);
