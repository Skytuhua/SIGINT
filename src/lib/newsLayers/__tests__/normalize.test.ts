import { describe, expect, it } from "vitest";
import { capAndAggregateFeatures, normalizeLayerFeatureCollection } from "../normalize";

describe("newsLayers normalize", () => {
  it("drops malformed features and normalizes valid ones", () => {
    const input = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", id: "ok", geometry: { type: "Point", coordinates: [10, 20] }, properties: { ts: "2026-01-02T00:00:00Z" } },
        { type: "Feature", id: "bad1", geometry: { type: "Point", coordinates: ["x", 20] }, properties: {} },
        { type: "Feature", id: "bad2", geometry: { type: "LineString", coordinates: [[1, 2]] }, properties: {} },
      ],
    };

    const normalized = normalizeLayerFeatureCollection(input, "test");
    expect(normalized.features).toHaveLength(1);
    expect(normalized.features[0].id).toBe("ok");
    expect(normalized.features[0].ts).toBeGreaterThan(0);
  });

  it("dedupes repeated records by stable key", () => {
    const input = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", id: "dup", geometry: { type: "Point", coordinates: [10, 20] }, properties: { ts: 1000 } },
        { type: "Feature", id: "dup", geometry: { type: "Point", coordinates: [10, 20] }, properties: { ts: 1000 } },
      ],
    };

    const normalized = normalizeLayerFeatureCollection(input, "test");
    expect(normalized.features).toHaveLength(1);
  });

  it("aggregates points when above maxFeatures", () => {
    const input = {
      type: "FeatureCollection" as const,
      features: Array.from({ length: 100 }, (_, idx) => ({
        id: `f-${idx}`,
        ts: idx,
        properties: {},
        geometry: {
          type: "Point" as const,
          coordinates: [idx % 20, idx % 10] as [number, number],
        },
      })),
    };

    const capped = capAndAggregateFeatures(input, 10);
    expect(capped.features.length).toBeLessThanOrEqual(10);
    expect(capped.features[0]?.properties).toHaveProperty("aggregateCount");
  });
});
