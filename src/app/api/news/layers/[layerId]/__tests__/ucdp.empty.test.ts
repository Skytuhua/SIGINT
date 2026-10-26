import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Exercise the actual store; only the external HTTP boundary is simulated.
async function request(query = "") {
  const { GET } = await import("../route");
  const response = await GET(new Request(`http://localhost/api/news/layers/ucdp-events?${query}`), {
    params: Promise.resolve({ layerId: "ucdp-events" }),
  });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.type).toBe("FeatureCollection");
  expect(body).not.toHaveProperty("authoritative");
  return body;
}
const liveRow = { id: 999, year: 2025, type_of_violence: 1, conflict_new_id: 1,
  latitude: 48, longitude: 37, country: "Ukraine", best: 20, low: 20, high: 20 };
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("UCDP_GED_VERSION", "25.1");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-26T00:00:00Z"));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("UCDP query availability", () => {
  it("uses a filtered snapshot after an actual provider failure for the requested year", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    const body = await request("fromYear=2024&toYear=2024&countries=Ukraine&minFatalities=10&violenceTypes=state-based");
    expect(body.features.map((feature: { id: string }) => feature.id)).toEqual(["ucdp-snap-1"]);
    const { getUcdpMeta } = await import("../../../../../../lib/server/ucdp/ucdpGedStore");
    expect(getUcdpMeta().status).toBe("unavailable");
  });

  it("replaces a stale outage snapshot after a successful empty recovery", async () => {
    const query = "fromYear=2024&toYear=2024&countries=Ukraine&minFatalities=10&violenceTypes=state-based";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    expect((await request(query)).features.map((feature: { id: string }) => feature.id)).toEqual(["ucdp-snap-1"]);

    vi.setSystemTime(new Date("2026-10-26T07:00:00Z"));
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ Result: [], TotalCount: 0 })));
    // The stale response is immediate; wait until the actual store has recovered.
    await request(query);
    const { getUcdpMeta } = await import("../../../../../../lib/server/ucdp/ucdpGedStore");
    await vi.waitFor(() => expect(getUcdpMeta().status).toBe("live"));
    expect((await request(query)).features).toEqual([]);
  });

  it("caches a successful empty cold result", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ Result: [], TotalCount: 0 })));
    await request("fromYear=2024&toYear=2024&countries=Ukraine");
    const { GET } = await import("../route");
    const response = await GET(new Request("http://localhost/api/news/layers/ucdp-events?fromYear=2024&toYear=2024&countries=Ukraine"), {
      params: Promise.resolve({ layerId: "ucdp-events" }),
    });
    expect(response.headers.get("X-Cache")).toBe("hit");
    expect((await response.json()).features).toEqual([]);
  });

  it("keeps the nonempty-only cache policy for unrelated layers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([])));
    const { GET } = await import("../route");
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await GET(new Request("http://localhost/api/news/layers/earthquakes"), {
        params: Promise.resolve({ layerId: "earthquakes" }),
      });
      expect(response.headers.get("X-Cache")).toBe("miss");
      expect((await response.json()).features).toEqual([]);
    }
  });

  it("does not cache an unavailable empty cold result as authoritative", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    const query = "fromYear=2024&toYear=2024&countries=Iceland";
    expect((await request(query)).features).toEqual([]);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ Result: [{ ...liveRow, year: 2024, country: "Iceland" }], TotalCount: 1 })));
    expect((await request(query)).features.map((feature: { id: string }) => feature.id)).toEqual(["ucdp-999"]);
  });

  it("preserves stale live results after an actual provider refresh failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ Result: [{ ...liveRow, year: 2024, country: "Iceland" }], TotalCount: 1 })));
    const query = "fromYear=2024&toYear=2024&countries=Iceland";
    await request(query);
    // The actual store retains its loaded year when the next refresh fails.
    vi.setSystemTime(new Date("2026-10-26T13:00:00Z"));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    expect((await request(query)).features.map((feature: { id: string }) => feature.id)).toEqual(["ucdp-999"]);
    const { getUcdpMeta } = await import("../../../../../../lib/server/ucdp/ucdpGedStore");
    await vi.waitFor(() => expect(getUcdpMeta().status).toBe("cached"));
    expect((await request(query)).features.map((feature: { id: string }) => feature.id)).toEqual(["ucdp-999"]);
  });

  it("uses the dataset release year when default-year loading fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    const body = await request();
    expect(body.features.length).toBe(15);
    expect(body.features.every((feature: { properties: { year: number } }) => feature.properties.year === 2024)).toBe(true);
  });

  it("remembers successfully loaded empty years and keeps filtered results empty", async () => {
    const fetchMock = vi.fn(async () => Response.json({ Result: [], TotalCount: 0 }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await request("fromYear=2024&toYear=2024&countries=Ukraine")).features).toEqual([]);
    expect((await request("fromYear=2024&toYear=2024&countries=Iceland")).features).toEqual([]);
    const { getUcdpMeta, getUcdpDefaultYear } = await import("../../../../../../lib/server/ucdp/ucdpGedStore");
    expect(getUcdpMeta().status).toBe("live");
    expect(getUcdpDefaultYear()).toBe(2024);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the data coverage and default year after loading an empty later year", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json({
      Result: new URL(url).searchParams.get("Year") === "2024" ? [{ ...liveRow, year: 2024 }] : [],
    })));
    const { ensureUcdpLoaded, getUcdpMeta, getUcdpDefaultYear } = await import("../../../../../../lib/server/ucdp/ucdpGedStore");
    await ensureUcdpLoaded();
    expect((await request("fromYear=2025&toYear=2025")).features).toEqual([]);
    const body = await request();
    expect({
      defaultYear: getUcdpDefaultYear(),
      coverage: getUcdpMeta().coverage,
      defaultIds: body.features.map((feature: { id: string }) => feature.id),
    }).toEqual({ defaultYear: 2024, coverage: { fromYear: 2024, toYear: 2024 }, defaultIds: ["ucdp-999"] });
  });

  it("fills a failed additional year while preserving live years in the same range", async () => {
    vi.stubEnv("UCDP_GED_VERSION", "26.1");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new URL(url).searchParams.get("Year") === "2025"
      ? Response.json({ Result: [liveRow], TotalCount: 1 }) : new Response(null, { status: 503 })));
    const body = await request("fromYear=2024&toYear=2025&countries=Ukraine&minFatalities=10&violenceTypes=state-based");
    expect(body.features.map((feature: { id: string }) => feature.id).sort()).toEqual(["ucdp-999", "ucdp-snap-1"]);
  });

  it("keeps a successfully empty requested year empty after another year's failure", async () => {
    vi.stubEnv("UCDP_GED_VERSION", "26.1");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new URL(url).searchParams.get("Year") === "2024"
      ? Response.json({ Result: [], TotalCount: 0 }) : new Response(null, { status: 503 })));
    expect((await request("fromYear=2024&toYear=2024&countries=Ukraine")).features).toEqual([]);
  });

  it("retains zero matches when no fallback event satisfies the requested filters", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    expect((await request("fromYear=2024&toYear=2024&countries=Iceland&minFatalities=999999&violenceTypes=one-sided")).features).toEqual([]);
    expect((await request("fromYear=2023&toYear=2023&countries=Ukraine")).features).toEqual([]);
  });
});
