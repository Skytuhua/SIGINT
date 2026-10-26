import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { article } from "../../../lib/news/__tests__/readingListFixtures";
import { createNewsReadingListStore, type NewsReadingListStore } from "../../../lib/news/readingList";
import NewsWorkspace from "../NewsWorkspace";
const mocks = vi.hoisted(() => ({ mobile: true, state: {} as Record<string, any>, listStore: null as NewsReadingListStore | null, publishedAt: null as number | null, items: null as ReturnType<typeof article>[] | null, calls: [] as string[] }));
vi.mock("../../../lib/runtime/globalRefreshRuntime", () => ({ globalRefreshRuntime: { register: () => () => {} } }));
vi.mock("../../../lib/runtime/fetchJson", () => ({ fetchJsonWithPolicy: (url: string) => { mocks.calls.push(url); return url.startsWith("/api/news/search") ? Promise.resolve({ items: mocks.items ?? [{ ...article("search-result"), publishedAt: mocks.publishedAt ?? Date.now() }], markers: [], facets: {}, degraded: {} }) : new Promise(() => {}); }, isAbortError: () => false }));
vi.mock("react-window", () => ({ List: ({ rowCount, rowComponent, rowProps }: any) => createElement("div", null, Array.from({ length: rowCount }, (_, index) => createElement(rowComponent, { ...rowProps, index, style: {}, key: index }))) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("../NewsDraggableGrid", () => ({ default: () => null }));
vi.mock("../NewsTickerBar", () => ({ default: () => null, CATEGORY_COLORS: {} }));
vi.mock("../CategoryFeedPanel", () => ({ default: () => null }));
vi.mock("../../../hooks/useIsMobile", () => ({ useIsMobile: () => mocks.mobile }));
vi.mock("../../../hooks/useNewsReadingList", async importOriginal => {
  const actual = await importOriginal<typeof import("../../../hooks/useNewsReadingList")>();
  return { useNewsReadingList: () => actual.useNewsReadingList(mocks.listStore!) };
});
vi.mock("../../../store", async importOriginal => {
  const actual = await importOriginal<typeof import("../../../store")>();
  mocks.state = actual.useSIGINTStore.getState();
  return { useSIGINTStore: Object.assign((select: (state: typeof mocks.state) => unknown) => select(mocks.state), { getState: () => mocks.state }) };
});
let renderer: ReactTestRenderer | undefined;
const listeners = new Map<string, Set<(event: unknown) => void>>();
class Target {
  constructor(private selectors: string[]) {}
  closest(query: string) { return query.split(",").some(selector => this.selectors.includes(selector.trim())) ? this : null; }
}
class InputTarget extends Target {}
class TextareaTarget extends Target {}
beforeEach(() => {
  vi.useFakeTimers(); listeners.clear(); mocks.calls = []; mocks.publishedAt = null; mocks.items = null;
  vi.stubGlobal("fetch", () => new Promise(() => {}));
  vi.stubGlobal("HTMLInputElement", InputTarget); vi.stubGlobal("HTMLTextAreaElement", TextareaTarget);
  const disk = new Map<string, string>();
  const storage = { getItem: (key: string) => disk.get(key) ?? null, setItem: (key: string, value: string) => { disk.set(key, value); }, removeItem: (key: string) => { disk.delete(key); } };
  vi.stubGlobal("window", { localStorage: storage, addEventListener: (name: string, cb: (event: unknown) => void) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)!.add(cb); }, removeEventListener: (name: string, cb: (event: unknown) => void) => listeners.get(name)?.delete(cb) });
  vi.stubGlobal("localStorage", storage); vi.stubGlobal("HTMLElement", Target); vi.stubGlobal("Element", Target);
  mocks.listStore = createNewsReadingListStore(() => storage); mocks.listStore.hydrate(); mocks.listStore.toggle(article("saved-only"));
  mocks.state = { ...mocks.state, dashboard: { ...mocks.state.dashboard, activeView: "ops" }, news: { ...mocks.state.news, feedItems: [], storyPopupArticle: null }, setStoryPopupArticle: vi.fn() };
});
afterEach(() => { act(() => renderer?.unmount()); renderer = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });


it("requests the explicit primary query before widening its time range", async () => {
  mocks.mobile = true;
  mocks.state = { ...mocks.state, dashboard: { ...mocks.state.dashboard, activeView: "news" }, news: { ...mocks.state.news, query: "Apple time:24h", feedItems: [] }, setNewsQuery: vi.fn(), setNewsLayoutPreset: vi.fn(), setNewsUiState: vi.fn() };
  await act(async () => { renderer = create(createElement(NewsWorkspace)); await vi.advanceTimersByTimeAsync(1); });
  const searches = mocks.calls.filter(url => url.startsWith("/api/news/search"));
  expect(searches.length).toBe(1);
  expect(new URL(searches[0], "http://local").searchParams.get("q")).toBe("Apple time:24h");
  expect(mocks.state.setNewsQuery).not.toHaveBeenCalledWith("time:7d Apple");
});
it("displays matching one-hour-old stories in the 24h search results", () => {
  mocks.mobile = false;
  const older = { ...article("older-match"), publishedAt: Date.now() - 60 * 60_000 };
  mocks.state = { ...mocks.state, dashboard: { ...mocks.state.dashboard, activeView: "news" }, news: { ...mocks.state.news, query: "Apple time:24h", feedItems: [older] }, setNewsQuery: vi.fn(), setNewsLayoutPreset: vi.fn(), setNewsUiState: vi.fn() };
  act(() => { renderer = create(createElement(NewsWorkspace)); });
  const input = renderer!.root.findAll(node => node.type === "input" && node.props.className === "si-news-search-input")[0];
  act(() => input.props.onKeyDown({ key: "Enter", preventDefault() {} }));
  const json = JSON.stringify(renderer!.toJSON());
  expect(json).not.toContain("No results for current filters");
  expect(json).toContain("Headline older-match");
  expect(mocks.state.news.feedItems).toContain(older);
});

it("renders and opens matching search results on mobile", () => {
  mocks.mobile = true;
  const fresh = { ...article("fresh-mobile-match"), publishedAt: Date.now() };
  mocks.state = { ...mocks.state, dashboard: { ...mocks.state.dashboard, activeView: "news" }, news: { ...mocks.state.news, query: "Apple time:24h", feedItems: [fresh] }, setNewsQuery: vi.fn(), setNewsLayoutPreset: vi.fn(), setNewsUiState: vi.fn() };
  act(() => { renderer = create(createElement(NewsWorkspace)); });
  const submit = renderer!.root.findAll(node => node.type === "button" && node.children.join("") === "SEARCH")[0];
  act(() => submit.props.onClick());
  expect(JSON.stringify(renderer!.toJSON())).toContain("si-news-search-overlay");
  expect(JSON.stringify(renderer!.toJSON())).toContain("Headline fresh-mobile-match");
  mocks.mobile = false;
  act(() => renderer!.update(createElement(NewsWorkspace)));
  expect(JSON.stringify(renderer!.toJSON())).toContain("si-news-search-overlay");
});

it("retains returned stories inside the requested seven-day search window", async () => {
 mocks.mobile = true;
 mocks.publishedAt = Date.now() - 2 * 86400_000;
 mocks.state = { ...mocks.state, dashboard: { ...mocks.state.dashboard, activeView: "news" }, news: { ...mocks.state.news, query: "Apple time:7d", feedItems: [] }, setNewsFeedItems: vi.fn(), setNewsQuery: vi.fn(), setNewsLayoutPreset: vi.fn(), setNewsUiState: vi.fn() };
 await act(async () => { renderer = create(createElement(NewsWorkspace)); await vi.advanceTimersByTimeAsync(1); });
 expect(mocks.state.setNewsFeedItems).toHaveBeenCalledWith([expect.objectContaining({ id: "search-result", publishedAt: mocks.publishedAt })]);
});
it.each(["Enter", " "])("opens mobile search results with the %s key", key => {
 mocks.mobile = true;
 const fresh = { ...article("keyboard-mobile"), publishedAt: Date.now() };
 mocks.state = { ...mocks.state, dashboard: { ...mocks.state.dashboard, activeView: "news" }, news: { ...mocks.state.news, query: "Apple time:24h", feedItems: [fresh] }, setNewsQuery: vi.fn(), setNewsLayoutPreset: vi.fn(), setNewsUiState: vi.fn(), setStoryPopupArticle: vi.fn() };
 act(() => { renderer = create(createElement(NewsWorkspace)); });
 act(() => renderer!.root.findAll(node => node.type === "button" && node.children.join("") === "SEARCH")[0].props.onClick());
 const card = renderer!.root.findAll(node => node.props.role === "button" && String(node.props.className).includes("si-news-mobile-result-card"))[0];
 expect(card.props.onKeyDown).toBeTypeOf("function");
 const preventDefault = vi.fn();
 act(() => card.props.onKeyDown({ key, preventDefault }));
 expect(preventDefault).toHaveBeenCalledOnce();
 expect(mocks.state.setStoryPopupArticle).toHaveBeenCalledWith(fresh);
});


it.each([
  ["Apple from:2024-01-01 time:24h", ["after", "last", "first"]],
  ["Apple to:2024-01-02", ["last", "first", "before"]],
  ["Apple to:2024-01-02 time:24h", ["last", "first", "before"]],
  ["Apple from:2024-01-01 to:2024-01-02 time:24h", ["last", "first"]],
])("retains the inclusive calendar range with server precedence for %s", async (query, expectedIds) => {
  mocks.mobile = true;
  mocks.items = [
    { ...article("before"), publishedAt: Date.parse("2023-12-31T23:59:59.999Z") },
    { ...article("first"), publishedAt: Date.parse("2024-01-01T00:00:00Z") },
    { ...article("last"), publishedAt: Date.parse("2024-01-02T23:59:59.999Z") },
    { ...article("after"), publishedAt: Date.parse("2024-01-03T00:00:00Z") },
  ];
  mocks.state = { ...mocks.state, dashboard: { ...mocks.state.dashboard, activeView: "news" }, news: { ...mocks.state.news, query, feedItems: [] }, setNewsFeedItems: vi.fn(), setNewsQuery: vi.fn(), setNewsLayoutPreset: vi.fn(), setNewsUiState: vi.fn() };
  await act(async () => { renderer = create(createElement(NewsWorkspace)); await vi.advanceTimersByTimeAsync(1); });
  expect(mocks.state.setNewsFeedItems.mock.calls.at(-1)[0].map((item: ReturnType<typeof article>) => item.id)).toEqual(expectedIds);
});

it("keeps historical to-only rolling memory bounded by item count", async () => {
  mocks.mobile = true;
  mocks.items = Array.from({ length: 1201 }, (_, index) => ({ ...article(`historical-${index}`), publishedAt: Date.parse("2024-01-01T12:00:00Z") + index }));
  mocks.state = { ...mocks.state, dashboard: { ...mocks.state.dashboard, activeView: "news" }, news: { ...mocks.state.news, query: "Apple to:2024-01-02", feedItems: [] }, setNewsFeedItems: vi.fn(), setNewsQuery: vi.fn(), setNewsLayoutPreset: vi.fn(), setNewsUiState: vi.fn() };
  await act(async () => { renderer = create(createElement(NewsWorkspace)); await vi.advanceTimersByTimeAsync(1); });
  const retained = mocks.state.setNewsFeedItems.mock.calls.at(-1)[0];
  expect(retained).toHaveLength(1200);
  expect(retained[0].id).toBe("historical-1200");
  expect(retained.at(-1).id).toBe("historical-1");
});
