import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { article } from "../../../lib/news/__tests__/readingListFixtures";
import { createNewsReadingListStore, type NewsReadingListStore } from "../../../lib/news/readingList";
import NewsWorkspace from "../NewsWorkspace";
const mocks = vi.hoisted(() => ({ mobile: true, state: {} as Record<string, any>, listStore: null as NewsReadingListStore | null }));
vi.mock("../../../lib/runtime/globalRefreshRuntime", () => ({ globalRefreshRuntime: { register: () => () => {} } }));
vi.mock("../../../lib/runtime/fetchJson", () => ({ fetchJsonWithPolicy: () => new Promise(() => {}), isAbortError: () => false }));
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
  vi.useFakeTimers(); listeners.clear();
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

it.each([true, false])("keeps inside Saved mousedown actions alive and opens a snapshot outside the feed (mobile=%s)", mobile => {
  mocks.mobile = mobile;
  act(() => { renderer = create(createElement(NewsWorkspace)); });
  const savedToggle = renderer!.root.findAll(node => node.type === "button" && node.children.join("").startsWith("SAVED"))[0];
  act(() => savedToggle.props.onClick());
  const surface = mobile ? ".si-news-phone-saved-list" : ".si-news-bookmarks-popover";
  act(() => listeners.get("mousedown")?.forEach(callback => callback({ target: new Target([surface, "[data-news-saved-surface]"]) })));
  const open = renderer!.root.findAll(node => node.type === "button" && node.props["aria-label"] === "Open saved article: Headline saved-only");
  expect(open).toHaveLength(1);
  act(() => open[0].props.onClick());
  expect(mocks.state.setStoryPopupArticle).toHaveBeenCalledWith(expect.objectContaining({ headline: "Headline saved-only" }));
  act(() => savedToggle.props.onClick());
  act(() => listeners.get("mousedown")?.forEach(callback => callback({ target: new Target([surface, "[data-news-saved-surface]"]) })));
  act(() => renderer!.root.findByProps({ "aria-label": "Remove saved article: Headline saved-only" }).props.onClick());
  expect(mocks.listStore!.getSnapshot().entries).toHaveLength(0);
  expect(JSON.stringify(renderer!.toJSON())).toContain("No saved articles");
  act(() => listeners.get("mousedown")?.forEach(callback => callback({ target: new Target([]) })));
  expect(JSON.stringify(renderer!.toJSON())).not.toContain("No saved articles");
});

it("keeps NEWS usable and displays a warning when browser storage reads throw", () => {
  window.localStorage.getItem = () => { throw new Error("denied"); };
  mocks.listStore = createNewsReadingListStore(() => window.localStorage);
  expect(() => act(() => { renderer = create(createElement(NewsWorkspace)); })).not.toThrow();
  expect(renderer!.root.findAllByProps({ role: "status" }).some(node => node.children.join("").includes("reload"))).toBe(true);
});

function enter(target: Target, nativeActivate?: () => void, alreadyPrevented = false) {
  const event = { key: "Enter", target, defaultPrevented: alreadyPrevented,
    preventDefault() { this.defaultPrevented = true; } };
  act(() => listeners.get("keydown")?.forEach(callback => callback(event)));
  // Model the browser's native default action only when window shortcuts leave it available.
  if (!event.defaultPrevented) act(() => nativeActivate?.());
  return event;
}
function activeNews() {
  const live = { ...article("live-feed"), publishedAt: Date.now(), recencyMinutes: 0, watchlistHits: 0, keywordScore: 0, filingBoost: 0 };
  mocks.state = { ...mocks.state, dashboard: { ...mocks.state.dashboard, activeView: "news" },
    news: { ...mocks.state.news, query: "time:24h", feedItems: [live], selectedStoryId: live.id },
    setSelectedStory: vi.fn(), setHighlightMarker: vi.fn(), setStoryPopupArticle: vi.fn(),
    setNewsLayoutPreset: vi.fn(), setNewsPanelLayouts: vi.fn(), setNewsUiState: vi.fn() };
  return live;
}
it.each([true, false])("preserves native Enter activation on Saved, Open, Remove and popup Bookmark with NEWS active (mobile=%s)", mobile => {
  mocks.mobile = mobile; activeNews();
  mocks.state.news.storyPopupArticle = article("popup-category-only");
  act(() => { renderer = create(createElement(NewsWorkspace)); });
  mocks.state.setSelectedStory.mockClear(); mocks.state.setStoryPopupArticle.mockClear();
  const savedToggle = () => renderer!.root.findAll(node => node.type === "button" && node.children.join("").startsWith("SAVED"))[0];
  expect(enter(new Target(["button", "[data-news-saved-toggle]"]), () => savedToggle().props.onClick()).defaultPrevented).toBe(false);
  const open = renderer!.root.findByProps({ "aria-label": "Open saved article: Headline saved-only" });
  expect(enter(new Target(["button", "[data-news-saved-surface]"]), () => open.props.onClick()).defaultPrevented).toBe(false);
  expect(mocks.state.setStoryPopupArticle).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "saved-only" }));
  mocks.state.setStoryPopupArticle.mockClear();
  enter(new Target(["button", "[data-news-saved-toggle]"]), () => savedToggle().props.onClick());
  const remove = renderer!.root.findByProps({ "aria-label": "Remove saved article: Headline saved-only" });
  expect(enter(new Target(["button", "[data-news-saved-surface]"]), () => remove.props.onClick()).defaultPrevented).toBe(false);
  expect(mocks.listStore!.getSnapshot().entries).toHaveLength(0);
  const bookmark = renderer!.root.findByProps({ title: "Bookmark" });
  expect(enter(new Target(["button"]), () => bookmark.props.onClick()).defaultPrevented).toBe(false);
  expect(mocks.listStore!.getSnapshot().entries[0].id).toBe("popup-category-only");
  expect(mocks.state.setSelectedStory).not.toHaveBeenCalled(); expect(mocks.state.setStoryPopupArticle).not.toHaveBeenCalled();
});
it("honors handled key events while keeping Enter terminal navigation available elsewhere", () => {
  mocks.mobile = false; const live = activeNews();
  act(() => { renderer = create(createElement(NewsWorkspace)); });
  mocks.state.setSelectedStory.mockClear(); mocks.state.setStoryPopupArticle.mockClear();
  enter(new Target([]), undefined, true);
  expect(mocks.state.setSelectedStory).not.toHaveBeenCalled(); expect(mocks.state.setStoryPopupArticle).not.toHaveBeenCalled();
  expect(enter(new Target([])).defaultPrevented).toBe(true);
  expect(mocks.state.setSelectedStory).toHaveBeenCalledExactlyOnceWith(live.id);
  expect(mocks.state.setStoryPopupArticle).toHaveBeenCalledExactlyOnceWith(live);
});
