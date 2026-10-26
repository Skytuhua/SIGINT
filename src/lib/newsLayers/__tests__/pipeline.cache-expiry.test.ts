import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ readPersistentFeedCache: vi.fn() }));
vi.mock("../../runtime/persistentFeedCache", () => ({ ...mocks, writePersistentFeedCache: vi.fn() }));
import { loadLayerFromCache } from "../pipeline";
import type { LayerRegistryEntry } from "../types";
const layer = { dataSource: { cacheKey: "expiry-test" } } as LayerRegistryEntry;
it("does not prime map layers from a cache past its stale deadline", async () => {
 mocks.readPersistentFeedCache.mockResolvedValue({ entry: { payload: { type: "FeatureCollection", features: [] }, staleUntil: Date.now() - 1 } });
 expect(await loadLayerFromCache(layer)).toBeNull();
});
it("can still prime a cache during its allowed stale period", async () => {
 const payload = { type: "FeatureCollection", features: [] };
 mocks.readPersistentFeedCache.mockResolvedValue({ entry: { payload, expiresAt: Date.now() - 1, staleUntil: Date.now() + 60_000 } });
 expect(await loadLayerFromCache(layer)).toBe(payload);
});
