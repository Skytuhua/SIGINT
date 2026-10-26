import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { results } = vi.hoisted(() => ({ results: new Map<string, unknown>() }));
vi.mock("node:dns/promises", () => ({ lookup: vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]) }));
vi.mock("undici", () => ({
  Agent: class { destroy = vi.fn().mockResolvedValue(undefined); },
  fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
}));
vi.mock("../../upstream", () => ({
  cachedFetch: async (options: { cacheKey: string; request: (signal: AbortSignal) => Promise<unknown>; fallbackValue: unknown }) => {
    if (results.has(options.cacheKey)) return { data: results.get(options.cacheKey), degraded: false, cacheHit: "fresh", latencyMs: 0 };
    try {
      const data = await options.request(new AbortController().signal);
      results.set(options.cacheKey, data);
      return { data, degraded: false, cacheHit: "miss", latencyMs: 0 };
    } catch {
      return { data: options.fallbackValue, degraded: true, cacheHit: "miss", latencyMs: 0 };
    }
  },
}));
import { getArticleSummary } from "../articleSummary";

function html(): Response {
  return new Response("<article><p>" + "Reporters documented harbor repairs after the overnight storm caused flooding near the waterfront. ".repeat(15) + "</p></article>", { headers: { "content-type": "text/html" } });
}
beforeEach(() => { vi.stubEnv("OPENAI_API_KEY", ""); results.clear(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("article summary cache context", () => {
  it("isolates a headline-induced negative and still reuses URL-only extraction", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(html()));
    vi.stubGlobal("fetch", fetchMock);
    const url = "https://publisher.example/headline-context";
    expect((await getArticleSummary({ url, headline: "Quantum semiconductor satellite earnings" })).unavailableReason).toBe("low_relevance");
    const result = await getArticleSummary({ url, headline: "Harbor repairs after overnight storm flooding" });
    expect(result.summary).toBeTruthy();
    expect(result.engine).toBe("extractive");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await getArticleSummary({ url, headline: "  Harbor repairs  after overnight storm flooding " })).cacheHit).toBe("fresh");
  });

  it("separates query parameters that reach the publisher even when canonicalization drops them", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(html()));
    vi.stubGlobal("fetch", fetchMock);
    const one = await getArticleSummary({ url: "https://publisher.example/query-context?utm_source=one" });
    const two = await getArticleSummary({ url: "https://publisher.example/query-context?utm_source=two" });
    expect(one.summary).toBeTruthy();
    expect(two.summary).toBeTruthy();
    expect(one.sourceUrl).toBe(two.sourceUrl);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("cancels an oversized article before reading its remaining chunks", async () => {
    const cancel = vi.fn();
    let pulls = 0;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({
      pull(controller) { pulls++; controller.enqueue(new Uint8Array(1_500_000)); }, cancel,
    }, { highWaterMark: 0 }), { headers: { "content-type": "text/html" } })));
    const result = await getArticleSummary({ url: "https://publisher.example/oversized" });
    expect(result.unavailableReason).toBe("fetch_failed");
    expect(pulls).toBe(2);
    expect(cancel).toHaveBeenCalled();
  });

  it("propagates caller cancellation after article headers", async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    let started!: () => void;
    const headers = new Promise<void>((resolve) => { started = resolve; });
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
      started();
      return Promise.resolve(new Response(new ReadableStream({ cancel }), { headers: { "content-type": "text/html" } }));
    }));
    const pending = getArticleSummary({ url: "https://publisher.example/cancelled", signal: controller.signal });
    await headers;
    controller.abort();
    expect((await pending).unavailableReason).toBe("fetch_failed");
    expect(cancel).toHaveBeenCalled();
  });
});
