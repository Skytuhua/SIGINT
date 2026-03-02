import { describe, expect, it } from "vitest";
import { mergeByCanonicalId } from "../mergePolicy";

interface Row {
  upstreamId: string;
  updatedAt: number;
  value: string;
}

describe("mergeByCanonicalId", () => {
  it("replaces by newer timestamp and caps retention", () => {
    const existing: Row[] = [
      { upstreamId: "a", updatedAt: 1_000, value: "old-a" },
      { upstreamId: "b", updatedAt: 1_500, value: "b" },
    ];
    const incoming: Row[] = [
      { upstreamId: "a", updatedAt: 2_000, value: "new-a" },
      { upstreamId: "c", updatedAt: 3_000, value: "c" },
    ];

    const merged = mergeByCanonicalId(existing, incoming, {
      source: "test",
      maxItems: 2,
      getUpstreamId: (item) => item.upstreamId,
      getUpdatedAt: (item) => item.updatedAt,
    });

    expect(merged).toHaveLength(2);
    expect(merged[0].upstreamId).toBe("c");
    expect(merged[1].value).toBe("new-a");
  });
});
