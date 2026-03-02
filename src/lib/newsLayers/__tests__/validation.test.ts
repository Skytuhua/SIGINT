import { describe, expect, it } from "vitest";
import { validateLayerRegistry } from "../validation";
import type { LayerRegistryEntry } from "../types";

function validLayer(): LayerRegistryEntry {
  return {
    id: "x",
    label: "X",
    icon: "*",
    category: "test",
    defaultEnabled: false,
    type: "geojsonPoints",
    stackOrder: 1,
    dataSource: {
      adapter: "route",
      routePath: "/api/news/layers/x",
      refreshMs: 1000,
      cacheKey: "k",
      cacheTtlMs: 1000,
      staleTtlMs: 1000,
    },
    style: {},
    performance: {
      maxFeatures: 10,
    },
  };
}

describe("validateLayerRegistry", () => {
  it("returns no errors for valid config", () => {
    expect(validateLayerRegistry([validLayer()])).toEqual([]);
  });

  it("flags missing and invalid fields", () => {
    const bad = validLayer();
    bad.id = "";
    bad.dataSource.refreshMs = 100;
    bad.performance.maxFeatures = 0;

    const errors = validateLayerRegistry([bad]);
    expect(errors.some((e) => e.includes("missing id"))).toBe(true);
    expect(errors.some((e) => e.includes("invalid dataSource.refreshMs"))).toBe(true);
    expect(errors.some((e) => e.includes("invalid performance.maxFeatures"))).toBe(true);
  });

  it("flags duplicate ids and stack orders", () => {
    const a = validLayer();
    a.id = "dup";
    a.stackOrder = 4;
    const b = validLayer();
    b.id = "dup";
    b.stackOrder = 4;

    const errors = validateLayerRegistry([a, b]);
    expect(errors.some((e) => e.includes("duplicate id"))).toBe(true);
    expect(errors.some((e) => e.includes("duplicate stackOrder"))).toBe(true);
  });
});
