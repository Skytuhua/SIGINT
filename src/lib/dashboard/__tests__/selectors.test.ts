import { describe, expect, it } from "vitest";
import type { LiveDataState } from "../types";
import { selectFeedItems, selectKpiTiles } from "../selectors";

function buildState(partial: Partial<LiveDataState> = {}): LiveDataState {
  return {
    flights: [],
    military: [],
    earthquakes: [],
    disasters: [],
    spaceWeather: [],
    satellites: [],
    satelliteCatalog: [],
    cctv: [],
    scenes: [],
    airspaceAnomalies: [],
    disappearedFlights: [],
    lastUpdated: {
      opensky: null,
      military: null,
      earthquakes: null,
      gdacs: null,
      spaceWeather: null,
      satellites: null,
      cctv: null,
      scenes: null,
    },
    health: {
      opensky: "idle",
      military: "idle",
      earthquakes: "idle",
      gdacs: "idle",
      spaceWeather: "idle",
      satellites: "idle",
      cctv: "idle",
      scenes: "idle",
    },
    sourceHealth: {},
    trendHistory: {
      timeline: [],
      entityCount: [],
      flightCount: [],
      militaryCount: [],
      quakeAvgMag: [],
    },
    feedLog: [],
    refreshTick: 0,
    ...partial,
  };
}

describe("dashboard selectors", () => {
  it("returns KPI tiles with tracked counts", () => {
    const state = buildState({
      flights: [{ icao: "a", lat: 0, lon: 0, callsign: null, altM: 0, speedMs: 0, heading: 0, vRate: 0, onGround: false }] as any,
      military: [{ icao: "b", lat: 0, lon: 0, callsign: null, altM: 0, speedMs: 0, heading: 0, vRate: 0, onGround: false, isMilitary: true }] as any,
      earthquakes: [{ id: "q1", mag: 4.2, place: "x", time: 1, lat: 0, lon: 0, depthKm: 10 }] as any,
    });
    const tiles = selectKpiTiles(state);
    const flightsTile = tiles.find((tile) => tile.id === "flt");
    expect(flightsTile?.value).toBe("2");
  });

  it("falls back to seeded feed messages when feed log is empty", () => {
    const items = selectFeedItems(buildState());
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].source).toBeTruthy();
  });
});
