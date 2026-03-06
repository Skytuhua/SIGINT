import { computeUcdpSeverity, severityLabel } from "../severity";

describe("computeUcdpSeverity", () => {
  it("returns a value between 0 and 100", () => {
    for (const fb of [0, 1, 5, 25, 100, 500, 2000]) {
      for (const vt of ["state-based", "non-state", "one-sided"] as const) {
        const s = computeUcdpSeverity(fb, vt);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(100);
      }
    }
  });

  it("scores higher for more fatalities", () => {
    const low = computeUcdpSeverity(1, "state-based");
    const mid = computeUcdpSeverity(10, "state-based");
    const high = computeUcdpSeverity(100, "state-based");
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
  });

  it("scores one-sided violence higher than state-based for same fatalities", () => {
    const stateBased = computeUcdpSeverity(10, "state-based");
    const oneSided = computeUcdpSeverity(10, "one-sided");
    expect(oneSided).toBeGreaterThanOrEqual(stateBased);
  });

  it("adds a persistence boost for cluster count > 1", () => {
    const single = computeUcdpSeverity(5, "state-based", 1);
    const cluster = computeUcdpSeverity(5, "state-based", 10);
    expect(cluster).toBeGreaterThan(single);
  });

  it("clamps the score to 100 for extreme fatality counts", () => {
    const extreme = computeUcdpSeverity(100000, "one-sided", 50);
    expect(extreme).toBeLessThanOrEqual(100);
  });

  it("is deterministic", () => {
    const a = computeUcdpSeverity(25, "non-state", 3);
    const b = computeUcdpSeverity(25, "non-state", 3);
    expect(a).toBe(b);
  });
});

describe("severityLabel", () => {
  it("returns Low for scores 0–24", () => {
    expect(severityLabel(0)).toBe("Low");
    expect(severityLabel(10)).toBe("Low");
    expect(severityLabel(24)).toBe("Low");
  });

  it("returns Moderate for scores 25–49", () => {
    expect(severityLabel(25)).toBe("Moderate");
    expect(severityLabel(49)).toBe("Moderate");
  });

  it("returns High for scores 50–74", () => {
    expect(severityLabel(50)).toBe("High");
    expect(severityLabel(74)).toBe("High");
  });

  it("returns Severe for scores 75–100", () => {
    expect(severityLabel(75)).toBe("Severe");
    expect(severityLabel(100)).toBe("Severe");
  });
});
