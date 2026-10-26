import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConflictZonesPipelineParams } from "../../../../../../lib/server/news/conflictZones/pipeline";

// Keep the URL adapter and route cache real; replace the pipeline's external
// GDELT/UCDP work with a result that identifies the filters it received.
vi.mock("../../../../../../lib/server/news/conflictZones/pipeline", () => ({
  runConflictZonesPipeline: vi.fn(async (params: ConflictZonesPipelineParams) => ({
    collection: {
      type: "FeatureCollection",
      features: [{
        id: "filtered-zone",
        geometry: { type: "Point", coordinates: [0, 0] },
        properties: {
          timeWindow: params.timeWindow,
          mode: params.mode,
          includeUcdp: params.includeUcdp,
          viewport: params.viewport,
        },
        ts: 1,
      }],
    },
    sourceStatus: { gdeltEvents: "live", gdeltGeo: "live", ucdpGed: "live" },
    lastRefreshedAt: 1,
  })),
}));

import { GET } from "../route";
import { clearLayerCache } from "../layerCache";

const baseQuery = "timeWindow=7d&mode=strict&verifiedOverlay=1&west=-20&south=-10&east=20&north=10";

function request(query: string) {
  return GET(new Request(`http://localhost/api/news/layers/conflict-zones?${query}`), {
    params: { layerId: "conflict-zones" },
  });
}

describe("conflict-zone route cache variants", () => {
  beforeEach(() => clearLayerCache());

  it.each([
    ["timeWindow", "24h", { timeWindow: "24h" }],
    ["mode", "broad", { mode: "broad" }],
    ["verifiedOverlay", "0", { includeUcdp: false }],
    ["west", "0", { viewport: { west: 0, south: -10, east: 20, north: 10 } }],
    ["south", "0", { viewport: { west: -20, south: 0, east: 20, north: 10 } }],
    ["east", "30", { viewport: { west: -20, south: -10, east: 30, north: 10 } }],
    ["north", "30", { viewport: { west: -20, south: -10, east: 20, north: 30 } }],
  ] as const)("does not reuse another request's %s filter", async (name, value, expected) => {
    const initial = await request(baseQuery);
    expect(initial.headers.get("X-Cache")).toBe("miss");

    const changed = new URLSearchParams(baseQuery);
    changed.set(name, value);
    const response = await request(changed.toString());
    expect(response.headers.get("X-Cache")).toBe("miss");
    const payload = await response.json();
    expect(payload.features[0].properties).toMatchObject(expected);

    const repeat = await request(changed.toString());
    expect(repeat.headers.get("X-Cache")).toBe("hit");
    expect(await repeat.json()).toEqual(payload);
  });

  it("shares a cached variant across query order and unrelated parameters", async () => {
    await request(baseQuery);
    const response = await request("north=10&east=20&south=-10&west=-20&verifiedOverlay=1&mode=strict&timeWindow=7d&utm_source=test");
    expect(response.headers.get("X-Cache")).toBe("hit");
    const payload = await response.json();
    expect(payload.features[0].properties).toMatchObject({
      timeWindow: "7d", mode: "strict", includeUcdp: true,
      viewport: { west: -20, south: -10, east: 20, north: 10 },
    });
  });
});
