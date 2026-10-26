import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import NewsPopupModal from "../NewsPopupModal";
import { article } from "../../../lib/news/__tests__/readingListFixtures";
let renderer: ReactTestRenderer | undefined;
afterEach(() => { act(() => renderer?.unmount()); renderer=undefined; vi.unstubAllGlobals(); });
it("fetches context once when optional props are omitted", async () => {
  vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {} });
  const pending: Array<{url:string; resolve: (response: Response) => void}> = [];
  const fetchMock=vi.fn((url:string) => new Promise<Response>(resolve => { pending.push({ url, resolve }); }));
  vi.stubGlobal("fetch", fetchMock);
  await act(async () => { renderer=create(createElement(NewsPopupModal, { article: article("popup-loop"), onClose() {} })); });
  const initialContext = pending.filter(p => p.url.includes("gdelt-"));
  expect(initialContext).toHaveLength(2);
  await act(async () => { initialContext.forEach(p => p.resolve(Response.json(p.url.includes("timeline") ? {timeline:[]} : {articles:[]}))); });
  const afterFirst = pending.filter(p => p.url.includes("gdelt-")).length;
  expect(afterFirst).toBe(initialContext.length);
  await act(async () => { pending.slice(-2).forEach(p => p.resolve(Response.json(p.url.includes("timeline") ? {timeline:[]} : {articles:[]}))); });
  expect(pending.filter(p => p.url.includes("gdelt-")).length).toBe(afterFirst);
});
it("ignores context responses from an article that is no longer open", async () => {
  vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {} });
  const pending: Array<{ url: string; signal: AbortSignal; resolve: (response: Response) => void }> = [];
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => new Promise<Response>(resolve => {
    if (url.includes("gdelt-")) pending.push({ url, signal: init.signal as AbortSignal, resolve });
  }));
  await act(async () => { renderer = create(createElement(NewsPopupModal, { article: article("context-a"), onClose() {} })); });
  const oldRequests = pending.slice();
  await act(async () => { renderer!.update(createElement(NewsPopupModal, { article: article("context-b"), onClose() {} })); });
  expect(oldRequests.every(request => request.signal.aborted)).toBe(true);
  await act(async () => {
    oldRequests.forEach(request => request.resolve(Response.json(request.url.includes("timeline") ? { timeline: [] } : { articles: [{ title: "STALE ARTICLE A", url: "https://a.test" }] })));
  });
  expect(JSON.stringify(renderer!.toJSON())).not.toContain("STALE ARTICLE A");
  expect(pending).toHaveLength(4);
});
