import { afterEach, expect, it, vi } from "vitest";

const entry = {
  cacheKey: "test:feed",
  savedAt: 1,
  expiresAt: 2,
  staleUntil: 3,
  payload: [{ id: "retained" }],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("uses memory when IndexedDB open throws and retries subsequent opens", async () => {
  vi.stubGlobal("window", {});
  const open = vi.fn(() => {
    throw new DOMException("Storage disabled", "SecurityError");
  });
  vi.stubGlobal("indexedDB", { open });
  const cache = await import("../persistentFeedCache");

  await expect(cache.readPersistentFeedCache(entry.cacheKey)).resolves.toEqual({
    entry: null,
    source: "none",
  });
  await expect(cache.writePersistentFeedCache(entry)).resolves.toBeUndefined();
  const cached = await cache.readPersistentFeedCache(entry.cacheKey);
  expect(cached.source).toBe("memory");
  expect(cached.entry?.payload).toEqual(entry.payload);
  await expect(cache.deletePersistentFeedCache(entry.cacheKey)).resolves.toBeUndefined();
  await expect(cache.readPersistentFeedCache(entry.cacheKey)).resolves.toEqual({
    entry: null,
    source: "none",
  });
  expect(open).toHaveBeenCalledTimes(4);
});

it("recovers storage after a synchronous failure and shares concurrent opens", async () => {
  vi.stubGlobal("window", {});
  const request = {} as IDBOpenDBRequest;
  const open = vi.fn()
    .mockImplementationOnce(() => { throw new Error("Storage unavailable"); })
    .mockReturnValue(request);
  vi.stubGlobal("indexedDB", { open });
  const cache = await import("../persistentFeedCache");
  await expect(cache.readPersistentFeedCache("first")).resolves.toEqual({ entry: null, source: "none" });

  const stored = { ...entry, cacheKey: "stored" };
  const get = vi.fn(() => {
    const rowRequest = { result: stored } as IDBRequest;
    queueMicrotask(() => rowRequest.onsuccess?.call(rowRequest, {} as Event));
    return rowRequest;
  });
  const db = { transaction: () => ({ objectStore: () => ({ get }) }) };
  Object.defineProperty(request, "result", { value: db });
  const first = cache.readPersistentFeedCache("stored");
  const second = cache.readPersistentFeedCache("stored");
  expect(open).toHaveBeenCalledTimes(2);
  request.onsuccess?.call(request, {} as Event);
  for (const result of await Promise.all([first, second])) {
    expect(result).toEqual({ entry: stored, source: "indexeddb" });
  }
  expect(await cache.readPersistentFeedCache("stored")).toEqual({ entry: stored, source: "memory" });
  expect(open).toHaveBeenCalledTimes(2);
});

it("falls back on asynchronous open errors and permits a retry", async () => {
  vi.stubGlobal("window", {});
  const request = {} as IDBOpenDBRequest;
  const open = vi.fn(() => request);
  vi.stubGlobal("indexedDB", { open });
  const cache = await import("../persistentFeedCache");
  for (let attempt = 0; attempt < 2; attempt++) {
    const read = cache.readPersistentFeedCache("missing");
    request.onerror?.call(request, {} as Event);
    await expect(read).resolves.toEqual({ entry: null, source: "none" });
  }
  expect(open).toHaveBeenCalledTimes(2);
});
