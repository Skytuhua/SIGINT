import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOfacEntities } from "../ofac";

afterEach(() => vi.unstubAllGlobals());
describe("OFAC missing values", () => {
  it("does not derive a vessel identifier from a person's name in remarks", async () => {
    vi.stubGlobal("fetch", async () => new Response('123,"TEST PERSON",individual,TEST,-0-,-0-,-0-,-0-,-0-,-0-,-0-,Associated with TIMOFEEV\n'));
    expect((await fetchOfacEntities()).entities[0].identifiers.imo).toBeNull();
  });
  it("normalizes -0- before deriving types, countries and identifiers", async () => {
    vi.stubGlobal("fetch", async () => new Response([
      '123,"TEST PERSON",individual,TEST,-0-,-0-,-0-,-0-,-0-,-0-,-0-,-0-',
      '124,"TEST COMPANY",-0-,TEST,-0-,-0-,-0-,-0-,-0-,-0-,-0-,-0-',
      '125,"TEST AIRCRAFT",aircraft,TEST,-0-,-0-,-0-,-0-,-0-,-0-,-0-,-0-',
      '126,"TEST VESSEL",vessel,TEST,-0-,ABCD,Cargo,-0-,-0-,IR,-0-,IMO 1234567',
    ].join("\n")));
    const { entities } = await fetchOfacEntities();
    expect(entities.map(entity => entity.entityType)).toEqual(["Individual", "Organization", "Aircraft", "Vessel"]);
    expect(entities[0]).toMatchObject({ jurisdictionCountry: null, linkedCountries: [], identifiers: { callsign: null } });
    expect(entities[3]).toMatchObject({ jurisdictionCountry: "IR", identifiers: { callsign: "ABCD", imo: "1234567" } });
  });
});
