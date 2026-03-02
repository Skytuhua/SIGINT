import { describe, expect, it } from "vitest";
import { normalizeGdacsItems } from "../gdacsNormalizer";

describe("normalizeGdacsItems", () => {
  it("normalizes and caps gdacs rows", () => {
    const rows = [
      {
        guid: "EQ123",
        title: "Green earthquake event",
        "gdacs:eventtype": "EQ",
        "gdacs:eventid": "123",
        "gdacs:episodeid": "1",
        "gdacs:alertlevel": "Green",
        "gdacs:severity": "4.8M",
        "gdacs:datemodified": "2026-03-02T05:00:00Z",
        "geo:lat": "10.1",
        "geo:long": "20.2",
      },
    ];

    const normalized = normalizeGdacsItems(rows);
    expect(normalized).toHaveLength(1);
    expect(normalized[0]).toMatchObject({
      source: "gdacs",
      upstreamId: "EQ123",
      eventType: "eq",
      alertLevel: "Green",
      severityValue: 4.8,
      lat: 10.1,
      lon: 20.2,
    });
  });

  it("replaces older row with newer update when IDs match", () => {
    const older = normalizeGdacsItems([
      {
        guid: "EQ999",
        title: "Older",
        "gdacs:eventtype": "EQ",
        "gdacs:datemodified": "2026-03-01T00:00:00Z",
        "geo:lat": "1",
        "geo:long": "2",
      },
    ]);

    const merged = normalizeGdacsItems(
      [
        {
          guid: "EQ999",
          title: "Newer",
          "gdacs:eventtype": "EQ",
          "gdacs:datemodified": "2026-03-02T00:00:00Z",
          "geo:lat": "1",
          "geo:long": "2",
        },
      ],
      older
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe("Newer");
  });
});
