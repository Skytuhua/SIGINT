import { beforeEach, expect, it, vi } from "vitest";
import { NewsLayerRuntime } from "../runtime";
import type { LayerFeatureCollection, LayerHealthState, LayerRegistryEntry } from "../types";

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  pipeline: vi.fn(),
  cache: vi.fn(),
}));
vi.mock("../../runtime/globalRefreshRuntime", () => ({
  globalRefreshRuntime: { register: mocks.register, trigger: vi.fn() },
}));
vi.mock("../pipeline", () => ({
  runLayerPipeline: mocks.pipeline,
  loadLayerFromCache: mocks.cache,
}));

const layer: LayerRegistryEntry = {
  id: "test-layer", label: "Test", icon: "", category: "test",
  defaultEnabled: false, type: "geojsonPoints", stackOrder: 1,
  dataSource: {
    adapter: "route", refreshMs: 60_000, cacheKey: "test",
    cacheTtlMs: 60_000, staleTtlMs: 120_000,
  },
  style: {}, performance: { maxFeatures: 100 },
};
const health: LayerHealthState = {
  status: "live", lastSuccessAt: 1000, lastError: null,
  nextRetryAt: null, consecutiveFailures: 0,
};
function collection(): LayerFeatureCollection {
  return {
    type: "FeatureCollection",
    features: [0, 1, 2].map((n) => ({
      id: `feature-${n}`, ts: 1000,
      geometry: { type: "Point", coordinates: [n, 10] },
      properties: { title: `Feature ${n}`, severity: 1 },
    })),
  };
}
function setup() {
  const onData = vi.fn();
  const onHealth = vi.fn();
  const runtime = new NewsLayerRuntime([layer], { onData, onHealth });
  runtime.enable(layer.id);
  const run = mocks.register.mock.calls[0][0].task.run as
    (context: { signal: AbortSignal }) => Promise<void>;
  return { runtime, onData, onHealth, run: () => run({ signal: new AbortController().signal }) };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.register.mockReturnValue(vi.fn());
});

it.each(["point", "line", "polygon", "properties", "timestamp", "id", "order"])("emits changed feature %s content", async (change) => {
  const first = collection();
  const next = collection();
  switch (change) {
    case "point": next.features[1].geometry.coordinates = [99, 10]; break;
    case "line":
      first.features[1].geometry = { type: "LineString", coordinates: [[0, 0], [1, 1], [2, 2]] };
      next.features[1].geometry = { type: "LineString", coordinates: [[0, 0], [9, 9], [2, 2]] };
      break;
    case "polygon":
      first.features[1].geometry = { type: "Polygon", coordinates: [[[0, 0], [1, 1], [2, 0], [0, 0]]] };
      next.features[1].geometry = { type: "Polygon", coordinates: [[[0, 0], [9, 9], [2, 0], [0, 0]]] };
      break;
    case "properties": next.features[1].properties = { title: "Updated", severity: 5, nested: { count: 3 } }; break;
    case "timestamp": next.features[1].ts = 2000; break;
    case "id": next.features[1].id = "replacement"; break;
    case "order": next.features.reverse(); break;
  }
  mocks.pipeline
    .mockResolvedValueOnce({ data: first, health, cacheHit: false })
    .mockResolvedValueOnce({ data: next, health, cacheHit: false });
  const { runtime, onData, run } = setup();
  try {
    await run();
    expect(onData).toHaveBeenCalledTimes(1);
    await run();
    expect(onData).toHaveBeenCalledTimes(2);
    expect(onData).toHaveBeenLastCalledWith(layer.id, next, health);
  } finally {
    runtime.dispose();
  }
});


it("suppresses identical fresh payloads while still delivering health", async () => {
  const updatedHealth = { ...health, lastSuccessAt: 2000 };
  mocks.pipeline
    .mockResolvedValueOnce({ data: collection(), health, cacheHit: false })
    .mockResolvedValueOnce({ data: collection(), health: updatedHealth, cacheHit: false });
  const { runtime, onData, onHealth, run } = setup();
  try {
    await run();
    await run();
    expect(onData).toHaveBeenCalledTimes(1);
    expect(onHealth).toHaveBeenLastCalledWith(layer.id, updatedHealth);
  } finally { runtime.dispose(); }
});

it("compares cached content with subsequent live content", async () => {
  const cached = collection();
  const changed = collection();
  changed.features[1].properties.title = "Updated from live source";
  mocks.cache.mockResolvedValue(cached);
  mocks.pipeline
    .mockResolvedValueOnce({ data: collection(), health, cacheHit: false })
    .mockResolvedValueOnce({ data: changed, health, cacheHit: false });
  const { runtime, onData, run } = setup();
  try {
    await runtime.primeFromCache(layer.id);
    expect(onData).toHaveBeenCalledTimes(1);
    await run();
    expect(onData).toHaveBeenCalledTimes(1);
    await run();
    expect(onData).toHaveBeenCalledTimes(2);
    expect(onData).toHaveBeenLastCalledWith(layer.id, changed, health);
  } finally { runtime.dispose(); }
});

it("emits empty transitions once and then emits repopulated data", async () => {
  const empty: LayerFeatureCollection = { type: "FeatureCollection", features: [] };
  mocks.pipeline
    .mockResolvedValueOnce({ data: collection(), health, cacheHit: false })
    .mockResolvedValueOnce({ data: empty, health, cacheHit: false })
    .mockResolvedValueOnce({ data: empty, health, cacheHit: false })
    .mockResolvedValueOnce({ data: collection(), health, cacheHit: false });
  const { runtime, onData, run } = setup();
  try {
    await run(); await run();
    expect(onData).toHaveBeenCalledTimes(2);
    expect(onData).toHaveBeenLastCalledWith(layer.id, empty, health);
    await run();
    expect(onData).toHaveBeenCalledTimes(2);
    await run();
    expect(onData).toHaveBeenCalledTimes(3);
  } finally { runtime.dispose(); }
});
