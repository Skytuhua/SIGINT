import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { createNewsReadingListStore, READING_LIST_KEY } from "../../lib/news/readingList";
import { article } from "../../lib/news/__tests__/readingListFixtures";
import { useNewsReadingList } from "../useNewsReadingList";
let renderer: ReactTestRenderer | undefined;
afterEach(() => { act(() => renderer?.unmount()); renderer = undefined; vi.unstubAllGlobals(); });

it("uses a consistent empty server snapshot without accessing storage during render", () => {
  let gets = 0;
  const store = createNewsReadingListStore(() => { gets++; throw new Error("denied"); });
  function Probe() { const list = useNewsReadingList(store); return createElement("span", null, list.entries.length); }
  expect(renderToString(createElement(Probe))).toContain(">0<"); expect(gets).toBe(0);
  store.hydrate(); store.toggle(article());
  expect(renderToString(createElement(Probe))).toContain(">0<");
});
it("updates membership and exposes warnings while retaining default session memory across NEWS remounts", () => {
  const browser = Object.defineProperty({}, "localStorage", { get: () => { throw new Error("denied"); } });
  vi.stubGlobal("window", browser);
  let current!: ReturnType<typeof useNewsReadingList>;
  function Probe() { current = useNewsReadingList(); return null; }
  act(() => { renderer = create(createElement(Probe)); });
  act(() => current.toggle(article("session-only")));
  expect(current.savedIds.has("session-only")).toBe(true); expect(current.warning).toMatch(/reload/);
  act(() => renderer?.unmount()); act(() => { renderer = create(createElement(Probe)); });
  expect(current.entries[0].article?.headline).toBe("Headline session-only");
  act(() => current.remove("session-only")); expect(current.savedIds.size).toBe(0);
});
it("hydrates a persisted story and keeps actions stable after removal", () => {
  const disk = new Map([[READING_LIST_KEY, JSON.stringify({ version: 1, entries: [{ id: "stored", savedAt: 1, article: article("stored") }] })]]);
  const store = createNewsReadingListStore(() => ({ getItem: key => disk.get(key) ?? null, setItem: (key, value) => { disk.set(key, value); }, removeItem: key => { disk.delete(key); } }));
  let current!: ReturnType<typeof useNewsReadingList>;
  function Probe() { current = useNewsReadingList(store); return null; }
  act(() => { renderer = create(createElement(Probe)); });
  expect(current.entries[0].article?.headline).toBe("Headline stored");
  const actions = [current.toggle, current.remove, current.reconcile];
  act(() => current.remove("stored")); expect(current.entries).toHaveLength(0);
  expect([current.toggle, current.remove, current.reconcile]).toEqual(actions);
});
