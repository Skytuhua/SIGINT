import { aggregateUcdpStats } from "../aggregation";
import type { LayerFeatureCollection } from "../../newsLayers/types";

function makeFeature(id: string, props: Record<string, unknown>): any {
  return {
    id,
    geometry: {
      type: "Point" as const,
      coordinates: [Number(props.lon ?? 0), Number(props.lat ?? 0)],
    },
    properties: props,
    ts: Date.now(),
  };
}

describe("aggregateUcdpStats", () => {
  it("returns empty stats for empty data", () => {
    const data: LayerFeatureCollection = { type: "FeatureCollection", features: [] };
    const stats = aggregateUcdpStats(data);
    expect(stats.eventCount).toBe(0);
    expect(stats.fatalitiesBestTotal).toBe(0);
    expect(stats.highestDay).toBeNull();
    expect(stats.topLocations).toHaveLength(0);
    expect(stats.topEvents).toHaveLength(0);
  });

  it("computes correct totals for a small set", () => {
    const data: LayerFeatureCollection = {
      type: "FeatureCollection",
      features: [
        makeFeature("a", {
          date: "2024-01-15",
          fatalities_best: 10,
          country: "SY",
          locationName: "Aleppo",
          actor1Name: "Gov",
          actor2Name: "Rebels",
          admin1: "Aleppo",
          lat: 36.2,
          lon: 37.15,
        }),
        makeFeature("b", {
          date: "2024-01-16",
          fatalities_best: 25,
          country: "SY",
          locationName: "Idlib",
          actor1Name: "Gov",
          actor2Name: null,
          admin1: "Idlib",
          lat: 35.93,
          lon: 36.63,
        }),
        makeFeature("c", {
          date: "2024-01-15",
          fatalities_best: 5,
          country: "IQ",
          locationName: "Mosul",
          actor1Name: "IS",
          actor2Name: "Peshmerga",
          admin1: "Ninawa",
          lat: 36.34,
          lon: 43.12,
        }),
      ],
    };

    const stats = aggregateUcdpStats(data);
    expect(stats.eventCount).toBe(3);
    expect(stats.fatalitiesBestTotal).toBe(40);
    expect(stats.dateRange.from).toBe("2024-01-15");
    expect(stats.dateRange.to).toBe("2024-01-16");
    expect(stats.highestDay).toEqual({ date: "2024-01-16", fatalitiesBest: 25 });
    expect(stats.topLocations.length).toBeGreaterThan(0);
    expect(stats.topEvents.length).toBe(3);
    expect(stats.topEvents[0].fatalitiesBest).toBe(25);
  });

  it("limits topLocations to 4 entries", () => {
    const features = Array.from({ length: 10 }, (_, i) =>
      makeFeature(`e${i}`, {
        date: "2024-06-01",
        fatalities_best: i + 1,
        country: `C${i}`,
        locationName: `Loc${i}`,
        actor1Name: "A",
        admin1: `Adm${i}`,
        lat: i,
        lon: i,
      })
    );
    const data: LayerFeatureCollection = { type: "FeatureCollection", features };
    const stats = aggregateUcdpStats(data);
    expect(stats.topLocations.length).toBeLessThanOrEqual(4);
  });

  it("limits topEvents to 10 entries", () => {
    const features = Array.from({ length: 20 }, (_, i) =>
      makeFeature(`e${i}`, {
        date: "2024-06-01",
        fatalities_best: i + 1,
        country: "XX",
        locationName: "Place",
        actor1Name: "A",
        admin1: "Adm",
        lat: 0,
        lon: 0,
      })
    );
    const data: LayerFeatureCollection = { type: "FeatureCollection", features };
    const stats = aggregateUcdpStats(data);
    expect(stats.topEvents.length).toBeLessThanOrEqual(10);
  });
});
