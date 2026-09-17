import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import CategoryFeedPanel from "../CategoryFeedPanel";
import type { NewsArticle } from "../../../lib/news/types";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  state: { news: { feedItems: [] }, setNewsCategoryPanelHasArticles: vi.fn() },
}));
vi.mock("../../../store", () => ({
  useSIGINTStore: Object.assign(
    (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
    { getState: () => mocks.state },
  ),
}));
vi.mock("../../../hooks/useIsMobile", () => ({ useIsMobile: () => false }));
vi.mock("../../../lib/runtime/fetchJson", () => ({
  fetchJsonWithPolicy: mocks.fetch,
  isAbortError: (err: Error) => err.name === "AbortError",
}));

let renderer: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  mocks.fetch.mockReset();
  vi.stubGlobal("window", { location: { origin: "https://example.test" } });
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

it.each(["failure", "empty"] as const)("recovers after an initial %s and stops polling on unmount", async (initial) => {
  const category = initial === "failure" ? "tech" : "ai";
  const article: NewsArticle = {
    id: category, headline: "Recovered article", category,
    url: "https://example.test/story", canonicalUrl: "https://example.test/story",
    domain: "example.test", source: "Test", publishedAt: Date.now(), snippet: "",
    language: "en", score: 1, backendSource: "rss",
    provenance: { headlineSource: "rss", coordsSource: "none", entitySource: "none", confidence: 1 },
  };
  if (initial === "failure") mocks.fetch.mockRejectedValueOnce(new Error("offline"));
  else mocks.fetch.mockResolvedValueOnce({ items: [] });
  mocks.fetch.mockResolvedValue({ items: [article] });

  await act(async () => {
    renderer = create(createElement(CategoryFeedPanel, {
      config: { id: `retry-${category}`, title: "Test", category, dedicatedFeeds: ["test"], refreshMs: 12_000 },
    }));
  });
  await advance(3_499);
  expect(mocks.fetch).not.toHaveBeenCalled();
  await advance(1);
  // The module staggers panels by 400 ms; allow both test panels to start.
  await advance(401);
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect(renderer!.root.findAllByProps({ className: "si-catfeed-item" })).toHaveLength(0);

  await advance(12_000);
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
  expect(renderer!.root.findByProps({ className: "si-catfeed-headline" }).children).toEqual(["Recovered article"]);
  act(() => renderer?.unmount());
  renderer = undefined;
  await advance(24_000);
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
});
