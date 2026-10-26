import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  files: new Map<string, string>(), failWrite: false,
  entity: { id: "OFAC:1", authority: "OFAC", name: "Example", entityType: "Organization", geo: null },
}));
vi.mock("node:fs/promises", () => ({
  mkdir: async () => undefined,
  readFile: async (file: string) => { if (!state.files.has(file)) throw new Error("missing"); return state.files.get(file); },
  writeFile: async (file: string, value: string) => {
    state.files.set(file, state.failWrite ? "{partial" : value);
    if (state.failWrite) throw new Error("disk write failed");
  },
  rename: async (from: string, to: string) => { state.files.set(to, state.files.get(from)!); state.files.delete(from); },
  unlink: async (file: string) => { state.files.delete(file); },
}));
vi.mock("../ofac", () => ({ fetchOfacEntities: vi.fn(async () => ({ entities: [state.entity], status: { status: "live" } })) }));
vi.mock("../un", () => ({ fetchUnEntities: async () => ({ entities: [], status: { status: "unavailable" } }) }));
vi.mock("../eu", () => ({ fetchEuEntities: async () => ({ entities: [], status: { status: "unavailable" } }) }));
vi.mock("../uk", () => ({ fetchUkEntities: async () => ({ entities: [], status: { status: "unavailable" } }) }));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); state.files.clear(); state.failWrite = false; });

describe("sanctions snapshot refresh", () => {
  it("retries an empty outage on the next request instead of caching it for a day", async () => {
    const { fetchOfacEntities } = await import("../ofac");
    vi.mocked(fetchOfacEntities).mockResolvedValueOnce({ entities: [], status: {
      status: "unavailable", lastUpdated: null, rowCount: 0, datasetVersion: null, errorCode: "offline",
    } });
    const { getSanctionsData } = await import("../index");
    expect((await getSanctionsData()).entities).toEqual([]);
    expect((await getSanctionsData()).entities.map(entity => entity.id)).toEqual(["OFAC:1"]);
  });
  it("coalesces concurrent source refreshes", async () => {
    const { getSanctionsData } = await import("../index");
    const { fetchOfacEntities } = await import("../ofac");
    const [first, second] = await Promise.all([getSanctionsData(), getSanctionsData()]);
    expect(first.entities).toEqual(second.entities);
    expect(fetchOfacEntities).toHaveBeenCalledTimes(1);
  });
  it("preserves the previous complete snapshot when a write fails partway through", async () => {
    const file = `${process.cwd()}/public/data/news-layers/sanctions-entities.json`;
    const previous = JSON.stringify({ entities: [{ ...state.entity, id: "OFAC:previous" }] });
    state.files.set(file, previous);
    state.failWrite = true;
    const { getSanctionsData } = await import("../index");
    await getSanctionsData();
    expect(state.files.get(file)).toBe(previous);
  });
});
