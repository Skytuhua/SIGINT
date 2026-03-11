export interface PersistentFeedCacheEntry<T> {
  cacheKey: string;
  savedAt: number;
  expiresAt: number;
  staleUntil: number;
  payload: T;
  etag?: string | null;
  lastModified?: string | null;
  checksum?: string | null;
  itemCount?: number | null;
}

export interface PersistentFeedCacheRead<T> {
  entry: PersistentFeedCacheEntry<T> | null;
  source: "memory" | "indexeddb" | "none";
}

interface FeedCacheIndexDb {
  db: IDBDatabase;
  ready: Promise<void>;
}

const DB_NAME = "sigint-feed-cache";
const DB_VERSION = 1;
const STORE_NAME = "feeds";
const MEMORY_LIMIT = 32;

let memory = new Map<string, PersistentFeedCacheEntry<unknown>>();
let memoryOrder: string[] = [];
let idb: FeedCacheIndexDb | null = null;
// Deduplicates concurrent getDb() callers so only one indexedDB.open() is issued.
let idbPending: Promise<IDBDatabase | null> | null = null;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function touchMemory(key: string): void {
  memoryOrder = memoryOrder.filter((value) => value !== key);
  memoryOrder.unshift(key);
  if (memoryOrder.length <= MEMORY_LIMIT) return;
  const drop = memoryOrder.pop();
  if (drop) memory.delete(drop);
}

function setMemory<T>(entry: PersistentFeedCacheEntry<T>): void {
  memory.set(entry.cacheKey, entry as PersistentFeedCacheEntry<unknown>);
  touchMemory(entry.cacheKey);
}

function getMemory<T>(cacheKey: string): PersistentFeedCacheEntry<T> | null {
  const entry = memory.get(cacheKey) as PersistentFeedCacheEntry<T> | undefined;
  if (!entry) return null;
  touchMemory(cacheKey);
  return entry;
}

function createChecksum(value: unknown): string {
  const raw = JSON.stringify(value) ?? "";
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

async function getDb(): Promise<IDBDatabase | null> {
  if (!isBrowser() || typeof indexedDB === "undefined") return null;
  if (idb) return idb.db;
  // All concurrent callers share the same open request.
  if (idbPending) return idbPending;

  idbPending = new Promise<IDBDatabase | null>((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "cacheKey" });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      idb = { db, ready: Promise.resolve() };
      idbPending = null;
      resolve(db);
    };
    request.onerror = () => {
      idbPending = null;
      resolve(null);
    };
  });

  return idbPending;
}

function readStore<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const request = operation(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb operation failed"));
  });
}

export async function readPersistentFeedCache<T>(
  cacheKey: string
): Promise<PersistentFeedCacheRead<T>> {
  const fromMemory = getMemory<T>(cacheKey);
  if (fromMemory) {
    return {
      entry: fromMemory,
      source: "memory",
    };
  }

  const db = await getDb();
  if (!db) {
    return { entry: null, source: "none" };
  }

  try {
    const row = await readStore<PersistentFeedCacheEntry<T> | undefined>(db, "readonly", (store) =>
      store.get(cacheKey)
    );
    if (!row) return { entry: null, source: "none" };
    setMemory(row);
    return { entry: row, source: "indexeddb" };
  } catch {
    return { entry: null, source: "none" };
  }
}

export async function writePersistentFeedCache<T>(
  entry: PersistentFeedCacheEntry<T>
): Promise<void> {
  const normalized: PersistentFeedCacheEntry<T> = {
    ...entry,
    checksum: entry.checksum ?? createChecksum(entry.payload),
    itemCount:
      entry.itemCount ??
      (Array.isArray(entry.payload) ? entry.payload.length : null),
  };

  setMemory(normalized);

  const db = await getDb();
  if (!db) return;

  try {
    await readStore<IDBValidKey>(db, "readwrite", (store) => store.put(normalized));
  } catch {
    // No-op. Memory cache still holds latest payload.
  }
}

export async function deletePersistentFeedCache(cacheKey: string): Promise<void> {
  memory.delete(cacheKey);
  memoryOrder = memoryOrder.filter((value) => value !== cacheKey);

  const db = await getDb();
  if (!db) return;
  try {
    await readStore<undefined>(db, "readwrite", (store) => store.delete(cacheKey));
  } catch {
    // ignore
  }
}

export function clearPersistentFeedMemoryCache(): void {
  memory = new Map();
  memoryOrder = [];
}
