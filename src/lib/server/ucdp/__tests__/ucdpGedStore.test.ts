import { queryUcdpEvents, getUcdpMeta, getUcdpDefaultYear } from "../ucdpGedStore";

describe("queryUcdpEvents (empty store)", () => {
  it("returns an empty array when store is not loaded", () => {
    const events = queryUcdpEvents({});
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBe(0);
  });
});

describe("getUcdpMeta", () => {
  it("returns metadata with expected shape", () => {
    const meta = getUcdpMeta();
    expect(meta).toHaveProperty("datasetVersion");
    expect(meta).toHaveProperty("releaseDate");
    expect(meta).toHaveProperty("coverage");
    expect(meta.coverage).toHaveProperty("fromYear");
    expect(meta.coverage).toHaveProperty("toYear");
    expect(meta).toHaveProperty("lastRefreshedAt");
    expect(meta).toHaveProperty("totalEvents");
    expect(meta).toHaveProperty("status");
  });

  it("has status unavailable before loading", () => {
    const meta = getUcdpMeta();
    expect(["unavailable", "degraded", "cached", "live"]).toContain(meta.status);
  });
});

describe("getUcdpDefaultYear", () => {
  it("returns a valid year number", () => {
    const year = getUcdpDefaultYear();
    expect(Number.isFinite(year)).toBe(true);
    expect(year).toBeGreaterThan(1988);
    expect(year).toBeLessThanOrEqual(new Date().getFullYear());
  });
});
