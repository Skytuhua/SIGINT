import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetchJsonOrThrow: vi.fn(), cachedFetch: vi.fn() }));
vi.mock("../../../../../lib/server/news/upstream", () => mocks);
vi.mock("../../../../../lib/server/withRateLimit", () => ({ withRateLimit: (_limit: unknown, handler: unknown) => handler }));
vi.mock("../../../../../lib/server/news/providers/worldbank", () => ({
  getCountryInfo: async () => ({ data: null, degraded: false }),
  getGovernanceIndicators: async () => ({ data: { politicalStability: null, ruleOfLaw: null, controlOfCorruption: null, governmentEffectiveness: null, regulatoryQuality: null, voiceAccountability: null }, degraded: false }),
}));
vi.mock("../../../../../lib/server/news/providers/polymarket", () => ({ searchPolymarketByCountry: async () => ({ data: [], degraded: false }) }));
import { GET } from "../route";
import { GET as acledGet } from "../../acled/route";
import { getAcledCountryEvents } from "../../../../../lib/server/news/providers/acled";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.cachedFetch.mockImplementation(async (options) => ({ data: await options.request(new AbortController().signal), degraded: false }));
  mocks.fetchJsonOrThrow.mockResolvedValue({ articles: [] });
});

it.each([["RS", "RI"], ["CH", "SZ"], ["IS", "IC"], ["US", "US"]])("keeps country profile ISO %s at the GDELT %s boundary", async (iso, fips) => {
  const response = await GET(new Request(`http://localhost/api/news/country-profile?country=${iso}`));
  expect(response.status).toBe(200);
  expect((await response.json()).countryCode).toBe(iso);
  expect(mocks.fetchJsonOrThrow).toHaveBeenCalledOnce();
  expect(new URL(mocks.fetchJsonOrThrow.mock.calls[0][0]).searchParams.get("query")).toBe(`(conflict OR protest OR military OR violence OR attack OR bombing) sourcecountry:${fips}`);
});

it.each([["United States", "US"], ["Switzerland", "SZ"], ["Iceland", "IC"], ["Serbia", "RI"]])("supports existing full country name %s through the ACLED route", async (name, fips) => {
  const response = await acledGet(new Request(`http://localhost/api/news/acled?country=${encodeURIComponent(name)}`));
  expect(response.status).toBe(200);
  expect(new URL(mocks.fetchJsonOrThrow.mock.calls[0][0]).searchParams.get("query")).toContain(`sourcecountry:${fips}`);
});

it.each(["ZZ", "Atlantis", "RS OR sourcecountry:CH"])("rejects unknown country input %s without a provider query", async country => {
  await expect(getAcledCountryEvents(country)).rejects.toThrow(/country/i);
  expect(mocks.cachedFetch).not.toHaveBeenCalled();
  expect(mocks.fetchJsonOrThrow).not.toHaveBeenCalled();
});

it.each(["ZZ", "Atlantis"])("rejects unsupported country %s in the direct route", async country => {
  const response = await acledGet(new Request(`http://localhost/api/news/acled?country=${encodeURIComponent(country)}`));
  expect(response.status).toBe(400);
  expect(mocks.fetchJsonOrThrow).not.toHaveBeenCalled();
});

it("rejects unsupported profile ISO2 codes before requesting any providers", async () => {
  const response = await GET(new Request("http://localhost/api/news/country-profile?country=ZZ"));
  expect(response.status).toBe(400);
  expect(mocks.fetchJsonOrThrow).not.toHaveBeenCalled();
});
