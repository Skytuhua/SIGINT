import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { article } from "../../../lib/news/__tests__/readingListFixtures";
import { createNewsReadingListStore } from "../../../lib/news/readingList";
import { useNewsReadingList } from "../../../hooks/useNewsReadingList";
import NewsSavedArticlesList from "../NewsSavedArticlesList";
import NewsPopupModal from "../NewsPopupModal";
vi.mock("../../../store", () => ({ useSIGINTStore: { getState: () => ({ news: { markers: [] }, setHighlightMarker: () => {} }) } }));
let renderer: ReactTestRenderer | undefined;
afterEach(() => { act(() => renderer?.unmount()); renderer = undefined; vi.unstubAllGlobals(); });

it("captures the actual popup story outside the feed and reopens its saved snapshot", () => {
  vi.stubGlobal("window", { addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal("fetch", () => new Promise(() => {}));
  const store = createNewsReadingListStore(() => { throw new Error("quota"); });
  const categoryStory = article("category-only"); const opened = vi.fn();
  const related = [{ title: "Related", url: "https://example.test/related", seendate: "", socialimage: "", domain: "example.test", language: "en", sourcecountry: "US" }];
  const timeline: [] = [];
  function Surface() {
    const list = useNewsReadingList(store);
    return createElement("div", null,
      createElement(NewsPopupModal, { article: categoryStory, onClose: () => {}, relatedItems: related, timeline,
        onToggleBookmark: list.toggle, isBookmarked: list.savedIds.has(categoryStory.id) }),
      createElement(NewsSavedArticlesList, { entries: list.entries, onOpen: opened, onRemove: list.remove, warning: list.warning }));
  }
  act(() => { renderer = create(createElement(Surface)); });
  act(() => renderer!.root.findByProps({ title: "Bookmark" }).props.onClick());
  expect(store.getSnapshot().entries).toHaveLength(1);
  expect(store.getSnapshot().entries[0].article?.headline).toBe("Headline category-only");
  categoryStory.headline = "Feed changed";
  act(() => renderer!.root.findByProps({ "aria-label": "Open saved article: Headline category-only" }).props.onClick());
  expect(opened.mock.calls[0][0].headline).toBe("Headline category-only");
  expect(renderer!.root.findAllByProps({ role: "status" }).some(node => node.children.join("").includes("reload"))).toBe(true);
  act(() => renderer!.root.findByProps({ "aria-label": "Remove saved article: Headline category-only" }).props.onClick());
  expect(store.getSnapshot().entries).toHaveLength(0);
});
it("shows empty and unavailable states with accessible removal and a Saved boundary", () => {
  const remove = vi.fn(); const open = vi.fn();
  act(() => { renderer = create(createElement(NewsSavedArticlesList, { entries: [], onOpen: open, onRemove: remove, warning: null })); });
  expect(JSON.stringify(renderer!.toJSON())).toContain("No saved articles");
  act(() => renderer!.update(createElement(NewsSavedArticlesList, {
    entries: [{ id: "old-story", savedAt: null, article: null }], onOpen: open, onRemove: remove,
    warning: "Reading list limit is 200 articles.",
  })));
  expect(renderer!.root.findByProps({ "data-news-saved-surface": true })).toBeTruthy();
  expect(JSON.stringify(renderer!.toJSON())).toContain("Unavailable");
  expect(renderer!.root.findByProps({ role: "status" }).children.join("")).toContain("200");
  expect(renderer!.root.findAll(node => node.type === "button" && node.props["aria-label"]?.startsWith("Open"))).toHaveLength(0);
  act(() => renderer!.root.findByProps({ "aria-label": "Remove saved article: old-story" }).props.onClick());
  expect(remove).toHaveBeenCalledWith("old-story"); expect(open).not.toHaveBeenCalled();
});
