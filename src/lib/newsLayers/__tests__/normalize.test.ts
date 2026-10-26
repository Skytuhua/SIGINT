import { describe, expect, it } from "vitest";
import { capAndAggregateFeatures, normalizeLayerFeatureCollection } from "../normalize";
import type { LayerFeature, LayerFeatureCollection } from "../types";

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

  it("keeps non-point features when capping an over-cap collection", () => {
    const polygons = Array.from({ length: 3 }, (_, idx) => ({
      id: `poly-${idx}`,
      ts: idx,
      properties: { kind: "zone" },
      geometry: {
        type: "Polygon" as const,
        coordinates: [[[idx, idx], [idx + 1, idx], [idx + 1, idx + 1], [idx, idx + 1], [idx, idx]]] as [
          Array<[number, number]>
        ],
      },
    }));
    const points = Array.from({ length: 200 }, (_, idx) => ({
      id: `pt-${idx}`,
      ts: idx,
      properties: {},
      geometry: { type: "Point" as const, coordinates: [(idx % 40) - 20, idx % 30] as [number, number] },
    }));

    const capped = capAndAggregateFeatures(
      { type: "FeatureCollection", features: [...polygons, ...points] },
      10
    );

    const keptPolygons = capped.features.filter((f) => f.geometry.type === "Polygon");
    expect(keptPolygons).toHaveLength(3);
    expect(capped.features.length).toBeLessThanOrEqual(10);
    expect(capped.features.some((f) => f.properties.aggregateCount)).toBe(true);
    expect(keptPolygons).toEqual(polygons);
  });

  it("caps a line-only collection without erasing it or mutating its input", () => {
    const lines: LayerFeature[] = Array.from({ length: 5 }, (_, idx) => ({
      id: `line-${idx}`,
      ts: idx,
      properties: { label: `Route ${idx}` },
      geometry: { type: "LineString", coordinates: [[idx, 0], [idx, 1]] },
    }));
    const input: LayerFeatureCollection = { type: "FeatureCollection", features: lines };
    const original = structuredClone(input);

    const capped = capAndAggregateFeatures(input, 2);
    expect(capped.features).toEqual(lines.slice(0, 2));
    expect(input).toEqual(original);
    expect(capAndAggregateFeatures(input, 0).features).toEqual([]);
    expect(capAndAggregateFeatures(input, lines.length)).toBe(input);
  });
});
