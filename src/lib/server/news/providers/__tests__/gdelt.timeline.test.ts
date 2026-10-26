import { afterEach, describe, expect, it, vi } from "vitest";

const upstream = vi.hoisted(() => ({ fetchJsonOrThrow: vi.fn(), cachedFetch: vi.fn() }));
vi.mock("../../upstream", () => upstream);
import { getGdeltTimeline } from "../gdelt";

afterEach(() => vi.resetAllMocks());

describe("GDELT TimelineVol response", () => {
  it("returns the nested Volume Intensity samples", async () => {
    upstream.cachedFetch.mockImplementation(async (options) => ({ data: await options.request() }));
    upstream.fetchJsonOrThrow.mockResolvedValue({ timeline: [
      { series: "Unrelated", data: [{ date: "20261024T000000Z", value: 999 }] },
      { series: "Volume Intensity", data: [
        { date: "20261025T000000Z", value: 8.5 },
        { date: "20261026T000000Z", value: 12.3 },
      ] },
    ] });

    const response = await getGdeltTimeline("news");

    expect(response.data).toEqual([
      { date: "20261025T000000Z", value: 8.5 },
      { date: "20261026T000000Z", value: 12.3 },
    ]);
  });

  it("drops malformed samples instead of inventing dates or zero values", async () => {
    upstream.cachedFetch.mockImplementation(async (options) => ({ data: await options.request() }));
    upstream.fetchJsonOrThrow.mockResolvedValue({ timeline: [{ series: "Volume Intensity", data: [
      { date: "20261025T000000Z", value: 0 },
      { value: 2 },
      { date: "not-a-date", value: 3 },
      { date: "20261026T000000Z", value: "bad" },
      { date: "20261026T010000Z", value: null },
    ] }] });

    const response = await getGdeltTimeline("news");

    expect(response.data).toEqual([{ date: "20261025T000000Z", value: 0 }]);
  });
});
