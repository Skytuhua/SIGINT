import type { StreamItem, SourceHealthEntry, StreamFilterParams, TerminalTab } from "../../../news/stream/types";
import { TAB_CATEGORY_MAP } from "../../../news/stream/types";
import type { InsertEvent, UpdateEvent, StreamEvent } from "../../../news/stream/events";
import { computeTopScore, selectTopItems } from "../../../news/engine/topScore";

// ---------------------------------------------------------------------------
// StreamStore — singleton in-memory ring buffer for the news tape.
// ---------------------------------------------------------------------------

const MAX_ITEMS = 5_000;
const FLOW_WINDOW_MS = 5 * 60_000;
const TITLE_SIMILARITY_THRESHOLD = 0.85;

type Listener = (event: StreamEvent) => void;

interface DuplicateGroup {
  primaryId: string;
  sources: Set<string>;
  count: number;
}

export class StreamStore {
  private items: Map<string, StreamItem> = new Map();
  private insertionOrder: string[] = [];
  private categoryIndex: Map<string, Set<string>> = new Map();
  private domainIndex: Map<string, Set<string>> = new Map();
  private duplicateGroups: Map<string, DuplicateGroup> = new Map();
  private ingestTimestamps: number[] = [];
  private categoryIngestTimestamps: Map<string, number[]> = new Map();
  private listeners: Set<Listener> = new Set();
  private sourceHealth: Map<string, SourceHealthEntry> = new Map();

  // ---- Subscription ----

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private emit(event: StreamEvent) {
    this.listeners.forEach((listener) => {
      try { listener(event); } catch { /* swallow per-listener errors */ }
    });
  }

  // ---- Ingestion ----

  ingest(sourceId: string, incoming: StreamItem[]): { inserted: StreamItem[]; updated: StreamItem[] } {
    const now = Date.now();
    const inserted: StreamItem[] = [];
    const updated: StreamItem[] = [];

    for (const raw of incoming) {
      // Compute importance via TOP scorer if not already set
      if (raw.importance === 0) {
        const { importance, signals } = computeTopScore(raw, { now });
        raw.importance = importance;
        raw.topSignals = signals;
      }

      const existing = this.items.get(raw.id);
      if (existing) {
        const merged = this.mergeExisting(existing, raw);
        if (merged) updated.push(merged);
        continue;
      }

      if (raw.duplicateGroupId) {
        const group = this.duplicateGroups.get(raw.duplicateGroupId);
        if (group) {
          const primary = this.items.get(group.primaryId);
          if (primary) {
            group.sources.add(raw.sourceName);
            group.count++;
            primary.duplicateCount = group.count;
            primary.sources = Array.from(group.sources);
            if (raw.importance > primary.importance) {
              primary.importance = raw.importance;
              primary.topSignals = raw.topSignals;
            }
            updated.push(primary);
            continue;
          }
        }
      }

      const titleDup = this.findTitleDuplicate(raw);
      if (titleDup) {
        const groupId = titleDup.duplicateGroupId || titleDup.id;
        const group = this.duplicateGroups.get(groupId) || {
          primaryId: titleDup.id,
          sources: new Set([titleDup.sourceName]),
          count: titleDup.duplicateCount,
        };
        group.sources.add(raw.sourceName);
        group.count++;
        this.duplicateGroups.set(groupId, group);
        titleDup.duplicateGroupId = groupId;
        titleDup.duplicateCount = group.count;
        titleDup.sources = Array.from(group.sources);
        updated.push(titleDup);
        continue;
      }

      this.addItem(raw);
      inserted.push(raw);
      this.ingestTimestamps.push(now);
      const catTs = this.categoryIngestTimestamps.get(raw.category) || [];
      catTs.push(now);
      this.categoryIngestTimestamps.set(raw.category, catTs);

      if (raw.duplicateGroupId) {
        this.duplicateGroups.set(raw.duplicateGroupId, {
          primaryId: raw.id,
          sources: new Set(raw.sources),
          count: raw.duplicateCount,
        });
      }
    }

    this.trimOldMetrics(now);
    this.enforceCapacity();

    if (inserted.length > 0) {
      this.emit({ type: "insert", items: inserted } satisfies InsertEvent);
    }
    if (updated.length > 0) {
      this.emit({ type: "update", items: updated } satisfies UpdateEvent);
    }

    return { inserted, updated };
  }

  private addItem(item: StreamItem) {
    this.items.set(item.id, item);
    this.insertionOrder.push(item.id);

    const catSet = this.categoryIndex.get(item.category) || new Set();
    catSet.add(item.id);
    this.categoryIndex.set(item.category, catSet);

    const domSet = this.domainIndex.get(item.sourceDomain) || new Set();
    domSet.add(item.id);
    this.domainIndex.set(item.sourceDomain, domSet);
  }

  private removeItem(id: string) {
    const item = this.items.get(id);
    if (!item) return;
    this.items.delete(id);
    this.categoryIndex.get(item.category)?.delete(id);
    this.domainIndex.get(item.sourceDomain)?.delete(id);
    if (item.duplicateGroupId) {
      const group = this.duplicateGroups.get(item.duplicateGroupId);
      if (group?.primaryId === id) this.duplicateGroups.delete(item.duplicateGroupId);
    }
  }

  private mergeExisting(existing: StreamItem, incoming: StreamItem): StreamItem | null {
    let changed = false;
    if (incoming.importance > existing.importance) {
      existing.importance = incoming.importance;
      existing.topSignals = incoming.topSignals;
      changed = true;
    }
    if (incoming.geo && !existing.geo) {
      existing.geo = incoming.geo;
      changed = true;
    }
    for (const src of incoming.sources) {
      if (!existing.sources.includes(src)) {
        existing.sources.push(src);
        existing.duplicateCount++;
        changed = true;
      }
    }
    return changed ? existing : null;
  }

  private findTitleDuplicate(item: StreamItem): StreamItem | null {
    const normTitle = normalizeTitle(item.headline);
    const windowMs = 6 * 60 * 60_000;
    const allItems = Array.from(this.items.values());
    for (let i = 0; i < allItems.length; i++) {
      const existing = allItems[i];
      if (Math.abs(existing.timestamp - item.timestamp) > windowMs) continue;
      if (existing.sourceDomain === item.sourceDomain) {
        if (diceSimilarity(normalizeTitle(existing.headline), normTitle) >= 0.9) {
          return existing;
        }
      } else {
        if (diceSimilarity(normalizeTitle(existing.headline), normTitle) >= TITLE_SIMILARITY_THRESHOLD) {
          return existing;
        }
      }
    }
    return null;
  }

  private enforceCapacity() {
    while (this.items.size > MAX_ITEMS && this.insertionOrder.length > 0) {
      const oldId = this.insertionOrder.shift()!;
      this.removeItem(oldId);
    }
  }

  private trimOldMetrics(now: number) {
    const cutoff = now - FLOW_WINDOW_MS;
    this.ingestTimestamps = this.ingestTimestamps.filter((t) => t > cutoff);
    const catEntries = Array.from(this.categoryIngestTimestamps.entries());
    for (let i = 0; i < catEntries.length; i++) {
      const [cat, ts] = catEntries[i];
      const filtered = ts.filter((t) => t > cutoff);
      if (filtered.length === 0) this.categoryIngestTimestamps.delete(cat);
      else this.categoryIngestTimestamps.set(cat, filtered);
    }
  }

  // ---- Reads ----

  getSnapshot(filters?: StreamFilterParams): StreamItem[] {
    let result: StreamItem[];
    if (filters?.tab === "TOP") {
      result = this.getTopItems(500);
    } else {
      result = this.getAllSorted();
    }
    if (filters) result = applyFilters(result, filters);
    return result.slice(0, 500);
  }

  getItem(id: string): StreamItem | undefined {
    return this.items.get(id);
  }

  getAllSorted(): StreamItem[] {
    return Array.from(this.items.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  getByCategory(category: string): StreamItem[] {
    const ids = this.categoryIndex.get(category);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.items.get(id)!)
      .filter(Boolean)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  searchRecent(query: string, since?: number): StreamItem[] {
    const q = query.toLowerCase();
    const cutoff = since ?? Date.now() - 24 * 60 * 60_000;
    const results: StreamItem[] = [];
    const allValues = Array.from(this.items.values());
    for (let i = 0; i < allValues.length; i++) {
      const item = allValues[i];
      if (item.timestamp < cutoff) continue;
      const text = `${item.headline} ${item.summary ?? ""} ${item.entities.map((e) => e.name).join(" ")} ${item.tickers.join(" ")} ${item.sourceDomain} ${item.geo?.placeName ?? ""}`.toLowerCase();
      if (text.includes(q)) results.push(item);
    }
    return results.sort((a, b) => b.timestamp - a.timestamp);
  }

  getTopItems(limit = 200): StreamItem[] {
    return selectTopItems(this.getAllSorted(), { limit });
  }

  get size() { return this.items.size; }

  // ---- Metrics ----

  getExpectedFlowPerMin(category?: string): number {
    const ts = category
      ? (this.categoryIngestTimestamps.get(category) ?? [])
      : this.ingestTimestamps;
    if (ts.length < 2) return 0;
    const windowMs = FLOW_WINDOW_MS;
    return Math.round((ts.length / windowMs) * 60_000);
  }

  // ---- Source health ----

  updateSourceHealth(sourceId: string, update: Partial<SourceHealthEntry>) {
    const existing = this.sourceHealth.get(sourceId) || {
      sourceId,
      status: "unavailable" as const,
      lastSuccessAt: null,
      lastPollAt: null,
      errorCode: null,
      nextRetryAt: null,
      consecutiveFailures: 0,
      itemsLastPoll: 0,
    };
    this.sourceHealth.set(sourceId, { ...existing, ...update, sourceId });
  }

  getSourceHealth(): Record<string, SourceHealthEntry> {
    return Object.fromEntries(this.sourceHealth);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function diceSimilarity(a: string, b: string): number {
  const bigA = bigrams(a);
  const bigB = bigrams(b);
  if (!bigA.size || !bigB.size) return 0;
  let overlap = 0;
  bigA.forEach((tok) => { if (bigB.has(tok)) overlap++; });
  return (2 * overlap) / (bigA.size + bigB.size);
}

function bigrams(s: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

export function applyFilters(items: StreamItem[], filters: StreamFilterParams): StreamItem[] {
  let result = items;
  const now = Date.now();

  if (filters.tab && filters.tab !== "TOP" && filters.tab !== "LOCAL") {
    const cats = TAB_CATEGORY_MAP[filters.tab];
    if (cats.length > 0) {
      result = result.filter((item) => cats.includes(item.category));
    }
  }

  if (filters.categories && filters.categories.length > 0) {
    const catSet = new Set(filters.categories);
    result = result.filter((item) => catSet.has(item.category));
  }

  if (filters.timeWindow) {
    const windowMs = parseTimeWindow(filters.timeWindow);
    const cutoff = now - windowMs;
    result = result.filter((item) => item.timestamp >= cutoff);
  }

  if (filters.minImportance != null && filters.minImportance > 0) {
    result = result.filter((item) => item.importance >= filters.minImportance!);
  }

  if (filters.sourceAllowlist && filters.sourceAllowlist.length > 0) {
    const allow = new Set(filters.sourceAllowlist.map((s) => s.toLowerCase()));
    result = result.filter((item) => allow.has(item.sourceDomain.toLowerCase()));
  }

  if (filters.sourceBlocklist && filters.sourceBlocklist.length > 0) {
    const block = new Set(filters.sourceBlocklist.map((s) => s.toLowerCase()));
    result = result.filter((item) => !block.has(item.sourceDomain.toLowerCase()));
  }

  if (filters.entityWatchlist && filters.entityWatchlist.length > 0) {
    const watch = new Set(filters.entityWatchlist.map((s) => s.toLowerCase()));
    result = result.filter((item) =>
      item.entities.some((e) => watch.has(e.name.toLowerCase())) ||
      item.tickers.some((t) => watch.has(t.toLowerCase()))
    );
  }

  if (filters.viewportOnly && filters.bbox) {
    const { west, south, east, north } = filters.bbox;
    result = result.filter((item) => {
      if (!item.geo) return false;
      const { lat, lon } = item.geo;
      const latOk = lat >= south && lat <= north;
      const lonOk = west <= east
        ? lon >= west && lon <= east
        : lon >= west || lon <= east;
      return latOk && lonOk;
    });
  }

  if (filters.searchQuery) {
    const q = filters.searchQuery.toLowerCase();
    result = result.filter((item) => {
      const text = `${item.headline} ${item.summary ?? ""} ${item.entities.map((e) => e.name).join(" ")} ${item.tickers.join(" ")}`.toLowerCase();
      return text.includes(q);
    });
  }

  return result;
}

function parseTimeWindow(w: string): number {
  switch (w) {
    case "5m": return 5 * 60_000;
    case "30m": return 30 * 60_000;
    case "2h": return 2 * 60 * 60_000;
    case "24h": return 24 * 60 * 60_000;
    default: return 24 * 60 * 60_000;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: StreamStore | null = null;

export function getStreamStore(): StreamStore {
  if (!_instance) _instance = new StreamStore();
  return _instance;
}
