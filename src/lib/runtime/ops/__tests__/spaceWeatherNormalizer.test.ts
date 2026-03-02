import { describe, expect, it } from "vitest";
import { normalizeSwpcItems } from "../spaceWeatherNormalizer";

describe("normalizeSwpcItems", () => {
  it("maps SWPC alert schema to normalized alert", () => {
    const rows = [
      {
        product_id: "EF3A",
        issue_datetime: "2026-03-02 05:00:13.617",
        message:
          "Space Weather Message Code: ALTEF3\nCONTINUED ALERT: Electron 2MeV Integral Flux exceeded 1000pfu",
      },
    ];

    const normalized = normalizeSwpcItems(rows);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].productId).toBe("EF3A");
    expect(normalized[0].level).toBe("ALERT");
    expect(normalized[0].title).toContain("Space Weather Message Code");
    expect(normalized[0].rawMessage).toContain("CONTINUED ALERT");
  });

  it("keeps existing entry when duplicate ids have equal timestamps", () => {
    const older = normalizeSwpcItems([
      {
        product_id: "EF3A",
        issue_datetime: "2026-03-02 05:00:13.617",
        message: "ALERT older payload",
      },
    ]);

    const merged = normalizeSwpcItems(
      [
        {
          product_id: "EF3A",
          issue_datetime: "2026-03-02 05:00:13.617",
          message: "ALERT newer payload",
        },
      ],
      older
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].rawMessage).toContain("older payload");
  });
});
