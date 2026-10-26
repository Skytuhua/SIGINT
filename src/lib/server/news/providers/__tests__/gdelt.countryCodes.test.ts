import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetchJsonOrThrow: vi.fn(), cachedFetch: vi.fn() }));
vi.mock("../../upstream", () => mocks);
import { getGdeltArticles, getGdeltGeo } from "../gdelt";
afterEach(() => vi.resetAllMocks());
it.each([["CH", "SZ"], ["IS", "IC"], ["RS", "RI"], ["AU", "AS"], ["SG", "SN"]])("sends ISO %s as GDELT FIPS %s", async (iso, fips) => {
 mocks.fetchJsonOrThrow.mockResolvedValue({ articles: [] });
 mocks.cachedFetch.mockImplementation(async (options) => ({ data: await options.request() }));
 await getGdeltArticles({ country: iso });
 expect(new URL(mocks.fetchJsonOrThrow.mock.calls[0][0]).searchParams.get("query")).toBe(`sourcecountry:${fips}`);
});
it("normalizes FIPS article and map country codes once at provider ingestion", async () => {
 mocks.cachedFetch.mockImplementation(async (options) => ({ data: await options.request() }));
 mocks.fetchJsonOrThrow.mockResolvedValueOnce({ articles: [{ sourcecountry: "CH", title: "China" }] });
 const articles = await getGdeltArticles({});
 expect(articles.data[0].sourcecountry).toBe("CN");
 mocks.fetchJsonOrThrow.mockResolvedValueOnce({ map: [{ countrycode: "SZ", lat: 47, lon: 8 }] });
 const geo = await getGdeltGeo({});
 expect(geo.data.points[0].countrycode).toBe("CH");
});
