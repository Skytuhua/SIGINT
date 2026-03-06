import { describe, it, expect } from "vitest";
import type { WorldEvent } from "../schema";
import {
  normalizeUsgsEarthquake,
  normalizeEonetEvent,
  normalizeNwsAlert,
  normalizeGdeltPoint,
  normalizeFaaStatus,
  dedupeEvents,
  filterByTimeWindow,
  filterBySeverity,
} from "../normalizers";

function assertWorldEvent(e: WorldEvent) {
  expect(typeof e.id).toBe("string");
  expect(e.id.length).toBeGreaterThan(0);
  expect(typeof e.type).toBe("string");
  expect(typeof e.lat).toBe("number");
  expect(typeof e.lon).toBe("number");
  expect(Number.isFinite(e.lat)).toBe(true);
  expect(Number.isFinite(e.lon)).toBe(true);
  expect(typeof e.startTime).toBe("number");
  expect(typeof e.headline).toBe("string");
  expect(e.headline.length).toBeGreaterThan(0);
  expect(typeof e.sourceName).toBe("string");
}

describe("USGS Earthquake normalizer", () => {
  const sample = {
    id: "us7000m1ab",
    properties: {
      mag: 5.2,
      place: "10 km NW of Tofino, Canada",
      time: 1709000000000,
      url: "https://earthquake.usgs.gov/earthquakes/eventpage/us7000m1ab",
      type: "earthquake",
      title: "M 5.2 - 10 km NW of Tofino, Canada",
    },
    geometry: { coordinates: [-126.1, 49.2, 10.5] as [number, number, number] },
  };

  it("produces a valid WorldEvent", () => {
    const result = normalizeUsgsEarthquake(sample);
    assertWorldEvent(result);
    expect(result.type).toBe("earthquake");
    expect(result.severity).toBe(5.2);
    expect(result.sourceName).toBe("USGS");
    expect(result.lat).toBeCloseTo(49.2);
    expect(result.lon).toBeCloseTo(-126.1);
  });
});

describe("NASA EONET normalizer", () => {
  const sample = {
    id: "EONET_6789",
    title: "Wildfire - Central California",
    categories: [{ id: "wildfires", title: "Wildfires" }],
    geometry: [
      { date: "2024-06-15T10:00:00Z", coordinates: [-119.5, 36.7] as [number, number] },
    ],
    sources: [{ url: "https://firms.modaps.eosdis.nasa.gov/" }],
  };

  it("produces valid WorldEvents for each geometry point", () => {
    const results = normalizeEonetEvent(sample);
    expect(results.length).toBe(1);
    assertWorldEvent(results[0]);
    expect(results[0].type).toBe("natural-event");
    expect(results[0].subtype).toBe("wildfires");
    expect(results[0].sourceName).toBe("NASA EONET");
  });

  it("handles event with no geometry gracefully", () => {
    const noGeo = { ...sample, geometry: [] };
    expect(normalizeEonetEvent(noGeo)).toHaveLength(0);
  });
});

describe("NWS Weather Alert normalizer", () => {
  const sample = {
    id: "urn:oid:2.49.0.1.840.0.abc123",
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        [
          [-97.5, 30.0],
          [-97.0, 30.0],
          [-97.0, 30.5],
          [-97.5, 30.5],
          [-97.5, 30.0],
        ],
      ],
    },
    properties: {
      event: "Severe Thunderstorm Warning",
      severity: "Severe",
      headline: "Severe Thunderstorm Warning issued for Travis County",
      onset: "2024-06-15T18:00:00-05:00",
      expires: "2024-06-15T19:30:00-05:00",
    },
  };

  it("produces a valid WorldEvent from polygon alert", () => {
    const result = normalizeNwsAlert(sample);
    expect(result).not.toBeNull();
    assertWorldEvent(result!);
    expect(result!.type).toBe("weather-alert");
    expect(result!.severity).toBe(4);
    expect(result!.sourceName).toBe("NWS");
    expect(result!.geometry?.type).toBe("Polygon");
  });

  it("returns null for alert with no geometry", () => {
    expect(normalizeNwsAlert({ id: "test" })).toBeNull();
  });
});

describe("GDELT point normalizer", () => {
  it("produces a valid WorldEvent", () => {
    const result = normalizeGdeltPoint(
      { lat: 33.5, lon: 36.3, name: "Damascus unrest", count: 12 },
      "protests",
      0
    );
    assertWorldEvent(result);
    expect(result.type).toBe("protests");
    expect(result.sourceName).toBe("GDELT");
  });
});

describe("FAA status normalizer", () => {
  it("produces a valid WorldEvent for delayed airport", () => {
    const result = normalizeFaaStatus({
      icao: "KJFK",
      iata: "JFK",
      name: "John F. Kennedy International",
      lat: 40.6413,
      lon: -73.7781,
      delayType: "Ground Delay",
      avgDelay: "45 minutes",
      reason: "WEATHER / THUNDERSTORMS",
    });
    assertWorldEvent(result);
    expect(result.type).toBe("faa-status");
    expect(result.severity).toBe(3);
  });

  it("produces severity 0 for no-delay airport", () => {
    const result = normalizeFaaStatus({
      icao: "KATL",
      name: "Hartsfield-Jackson",
      lat: 33.6407,
      lon: -84.4277,
    });
    expect(result.severity).toBe(0);
  });
});

describe("Utility filters", () => {
  const now = Date.now();
  const events: WorldEvent[] = [
    { id: "a", type: "t", lat: 0, lon: 0, startTime: now - 3600_000, headline: "A", sourceName: "X", severity: 2 },
    { id: "b", type: "t", lat: 0, lon: 0, startTime: now - 3600_000, headline: "B", sourceName: "X", severity: 4 },
    { id: "a", type: "t", lat: 0, lon: 0, startTime: now - 3600_000, headline: "A dup", sourceName: "X", severity: 2 },
    { id: "c", type: "t", lat: 0, lon: 0, startTime: now - 48 * 3600_000, headline: "C old", sourceName: "X", severity: 1 },
  ];

  it("dedupeEvents removes duplicates by id", () => {
    expect(dedupeEvents(events)).toHaveLength(3);
  });

  it("filterByTimeWindow filters old events", () => {
    const filtered = filterByTimeWindow(events, 24 * 3600_000);
    expect(filtered.every((e) => e.startTime >= now - 24 * 3600_000)).toBe(true);
  });

  it("filterBySeverity filters by minimum severity", () => {
    const filtered = filterBySeverity(events, 3);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("b");
  });
});
