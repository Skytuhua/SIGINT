import { afterEach, expect, it, vi } from "vitest";

vi.mock("../../../../lib/server/withRateLimit", () => ({ withRateLimit: (_: unknown, handler: unknown) => handler }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("requires affirmative military evidence for aircraft from the PIA privacy list", async () => {
  vi.resetModules();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubGlobal("fetch", async (url: string) => Response.json({ ac: url.endsWith("/pia") ? [
    { hex: "a12345", flight: "N12345", lat: 40, lon: -70, t: "C172", db_flags: "4" },
    { hex: "a23456", flight: "MILTEST", lat: 40, lon: -70, t: "C172", db_flags: "5" },
  ] : [] }));
  const { GET } = await import("../route");
  const flights = await (await GET(new Request("http://localhost/api/military?phase=1"))).json();
  expect(flights.map((flight: { icao: string }) => flight.icao)).toEqual(["a23456"]);
  expect(flights[0].isMilitary).toBe(true);
});
