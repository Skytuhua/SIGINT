import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../../lib/server/ucdp/ucdpGedStore", () => ({
  ensureUcdpLoaded: vi.fn(async () => undefined),
  loadAdditionalYear: vi.fn(async () => true),
  getUcdpDefaultYear: () => 2024,
  getUcdpMeta: () => ({ datasetVersion: "25.1" }),
  queryUcdpEvents: vi.fn(() => [{
    id: "fixture", lon: 0, lat: 0, year: 2024,
    fatalities_best: 1, violenceType: "state-based",
  }]),
}));

import { GET } from "../route";
import { ensureUcdpLoaded, loadAdditionalYear } from "../../../../../../lib/server/ucdp/ucdpGedStore";

function request(query: string) {
  return GET(new Request(`http://localhost/api/news/layers/ucdp-events?${query}`), {
    params: Promise.resolve({ layerId: "ucdp-events" }),
  });
}

describe("UCDP validation before cache and data loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network disabled in validation tests"); }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("rejects an unsupported year without loading data", async () => {
    const response = await request("fromYear=1988&toYear=1988");
    expect(response.status).toBe(400);
    expect(ensureUcdpLoaded).not.toHaveBeenCalled();
    expect(loadAdditionalYear).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["fromYear=2025", "toYear=2023"])("rejects inverted effective defaults: %s", async (query) => {
    const response = await request(query);
    expect(response.status).toBe(400);
    expect(ensureUcdpLoaded).toHaveBeenCalled();
    expect(loadAdditionalYear).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects invalid input even when valid data is cached", async () => {
    const valid = await request("fromYear=2024&toYear=2024");
    expect(valid.status).toBe(200);
    expect(valid.headers.get("X-Cache")).toBe("miss");
    const cached = await request("fromYear=2024&toYear=2024");
    expect(cached.headers.get("X-Cache")).toBe("hit");
    expect((await request("fromYear=2025")).status).toBe(400);
    expect((await request("fromYear=2024")).headers.get("X-Cache")).toBe("hit");
    expect((await request("toYear=2024")).headers.get("X-Cache")).toBe("hit");
    vi.clearAllMocks();
    const invalid = await request("fromYear=2024&toYear=2023");
    expect(invalid.status).toBe(400);
    expect(ensureUcdpLoaded).not.toHaveBeenCalled();
    expect(loadAdditionalYear).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
