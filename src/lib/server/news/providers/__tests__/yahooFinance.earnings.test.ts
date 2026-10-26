import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../upstream", () => ({
  cachedFetch: async (options: { request: () => Promise<unknown> }) => ({ data: await options.request() }),
}));

async function calendar(now: string, dates: string[]) {
  vi.resetModules();
  vi.spyOn(Date, "now").mockReturnValue(Date.parse(now));
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === "https://fc.yahoo.com") return new Response(null);
    if (url.includes("/getcrumb")) return new Response("test-crumb");
    return Response.json({ quoteResponse: { result: dates.map((date, i) => ({
      symbol: `SYM${i}`, shortName: `Company ${i}`, earningsTimestamp: Date.parse(date) / 1000,
    })) } });
  }));
  const { getEarningsCalendar } = await import("../yahooFinance");
  return (await getEarningsCalendar()).data;
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("earnings calendar ordering", () => {
  it("leaves quarterly EPS unknown when quotes only provide annual metrics", async () => {
    vi.resetModules();
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-26T00:00:00Z"));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "https://fc.yahoo.com") return new Response(null);
      if (url.includes("/getcrumb")) return new Response("test-crumb");
      return Response.json({ quoteResponse: { result: [{ symbol: "AAPL", shortName: "Apple",
        earningsTimestamp: Date.parse("2026-10-25T16:00:00Z") / 1000,
        epsTrailingTwelveMonths: 4, epsForward: 5, epsCurrentYear: 4.5,
      }] } });
    }));
    const { getEarningsCalendar } = await import("../yahooFinance");
    const entry = (await getEarningsCalendar()).data.recent[0];
    expect(entry.epsEst).toBe("—");
    expect(entry.epsAct).toBeUndefined();
    expect(entry.surprise).toBeUndefined();
  });

  it("orders upcoming events chronologically across months and day digits", async () => {
    const data = await calendar("2026-09-01T00:00:00Z", [
      "2026-10-02T16:00:00Z", "2026-09-30T16:00:00Z", "2026-09-10T16:00:00Z", "2026-09-02T16:00:00Z",
    ]);
    expect(data.upcoming.map(e => e.sym)).toEqual(["SYM3", "SYM2", "SYM1", "SYM0"]);
  });

  it("orders recent events newest first across a year boundary", async () => {
    const data = await calendar("2027-01-10T00:00:00Z", [
      "2026-12-30T16:00:00Z", "2027-01-02T16:00:00Z", "2027-01-09T16:00:00Z",
    ]);
    expect(data.recent.map(e => e.sym)).toEqual(["SYM2", "SYM1", "SYM0"]);
  });
});
