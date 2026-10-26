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

it("lets slow searches finish, resumes polling, and aborts active work on unmount", async () => {
  const article: NewsArticle = {
    id: "slow-markets", headline: "Slow recovered article", category: "markets",
    url: "https://example.test/slow-story", canonicalUrl: "https://example.test/slow-story",
    domain: "example.test", source: "Test", publishedAt: Date.now(), snippet: "",
    language: "en", score: 1, backendSource: "rss",
    provenance: { headlineSource: "rss", coordsSource: "none", entitySource: "none", confidence: 1 },
  };
  const signals: AbortSignal[] = [];
  mocks.fetch.mockImplementation((_url: string, policy: { signal: AbortSignal }) => {
    signals.push(policy.signal);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve({ items: [article] }), 11_000);
      policy.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    });
  });

  await act(async () => {
    renderer = create(createElement(CategoryFeedPanel, {
      config: { id: "retry-slow-markets", title: "Test", category: "markets", dedicatedFeeds: ["test"], refreshMs: 8_000 },
    }));
  });
  await advance(3_500);
  // Allow this panel's staggered first request to begin.
  await advance(1_000);
  expect(mocks.fetch).toHaveBeenCalledTimes(1);

  await advance(8_000);
  expect(signals[0].aborted).toBe(false);
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  await advance(3_000);
  expect(renderer!.root.findByProps({ className: "si-catfeed-headline" }).children).toEqual(["Slow recovered article"]);

  // The next poll can use the fresh memo; the following poll must fetch again.
  await advance(13_000);
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
  act(() => renderer?.unmount());
  renderer = undefined;
  expect(signals[1].aborted).toBe(true);
  await advance(24_000);
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
});
