import { describe, expect, it } from "vitest";
import { createNewsReadingListStore, READING_LIST_KEY, LEGACY_BOOKMARKS_KEY } from "../readingList";

import { article } from "./readingListFixtures";
function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return { values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
}
const saved = (store: ReturnType<typeof createNewsReadingListStore>) => store.getSnapshot().entries;

describe("durable news reading list", () => {
  it("reopens an independent snapshot after feed replacement and reconstruction", () => {
    const disk = storage(); const store = createNewsReadingListStore(() => disk);
    const input = Object.assign(article(), { unrelatedPayload: "must not persist" });
    store.hydrate(); store.toggle(input);
    input.headline = "Changed feed"; input.aliases!.push("Changed"); input.provenance.confidence = 0;
    store.reconcile([article("replacement")]);
    const reload = createNewsReadingListStore(() => disk); reload.hydrate();
    expect(saved(reload)[0].article).toMatchObject({ headline: "Headline story", aliases: ["Example"], provenance: { confidence: 1 } });
    expect(saved(reload)[0].article).not.toHaveProperty("unrelatedPayload");
    expect(saved(reload)[0].savedAt).toEqual(expect.any(Number));
  });
  it("is lazy and has stable snapshots until an operation changes state", () => {
    let gets = 0; const store = createNewsReadingListStore(() => { gets++; return storage(); });
    expect(gets).toBe(0); expect(store.getSnapshot()).toBe(store.getSnapshot());
    let calls = 0; const unsubscribe = store.subscribe(() => calls++);
    store.hydrate(); const snapshot = store.getSnapshot(); store.hydrate(); store.reconcile([]);
    expect(store.getSnapshot()).toBe(snapshot); expect(gets).toBe(1);
    store.toggle(article()); expect(calls).toBeGreaterThan(0); unsubscribe();
  });
  it("migrates legacy IDs only after a successful write, resolves later, and never resurrects removals", () => {
    const disk = storage({ [LEGACY_BOOKMARKS_KEY]: JSON.stringify(["a", "b", "c"]) });
    const store = createNewsReadingListStore(() => disk); store.hydrate();
    expect(disk.values.has(LEGACY_BOOKMARKS_KEY)).toBe(false);
    expect(saved(store)).toEqual(["a", "b", "c"].map(id => ({ id, savedAt: null, article: null })));
    store.remove("b"); store.reconcile([article("a"), article("b")]);
    expect(saved(store).map(e => e.id)).toEqual(["a", "c"]);
    expect(saved(store)[0].article?.headline).toBe("Headline a");
    expect(saved(store)[1].article).toBeNull();
  });
  it("a valid empty new document overrides legacy IDs", () => {
    const disk = storage({ [READING_LIST_KEY]: JSON.stringify({ version: 1, entries: [] }), [LEGACY_BOOKMARKS_KEY]: '["old"]' });
    const store = createNewsReadingListStore(() => disk); store.hydrate(); expect(saved(store)).toEqual([]);
  });
  it("preserves legacy IDs if migration cannot be written, while allowing session resolution", () => {
    const disk = storage({ [LEGACY_BOOKMARKS_KEY]: '["a"]' }); disk.setItem = () => { throw new Error("quota"); };
    const store = createNewsReadingListStore(() => disk); store.hydrate(); store.reconcile([article("a")]);
    expect(saved(store)[0].article?.id).toBe("a"); expect(disk.values.get(LEGACY_BOOKMARKS_KEY)).toBe('["a"]');
    expect(store.getSnapshot().warning).toMatch(/reload/i);
  });
  it.each(["getter", "read", "write"])("keeps edits and removals usable after a throwing storage %s", failure => {
    const disk = storage();
    if (failure === "read") disk.getItem = () => { throw new Error("blocked"); };
    if (failure === "write") disk.setItem = () => { throw new Error("quota"); };
    const store = createNewsReadingListStore(() => { if (failure === "getter") throw new Error("denied"); return disk; });
    expect(() => { store.hydrate(); store.toggle(article()); }).not.toThrow();
    expect(saved(store)[0].article?.headline).toBe("Headline story"); expect(store.getSnapshot().warning).toMatch(/reload/i);
    store.remove("story"); expect(saved(store)).toEqual([]);
  });
  it.each(['{bad', '{"version":2,"entries":[]}', '{"version":1,"entries":[{"id":"x"}]}'])("protects unsupported or malformed documents: %s", raw => {
    const disk = storage({ [READING_LIST_KEY]: raw, [LEGACY_BOOKMARKS_KEY]: '["old"]' });
    const store = createNewsReadingListStore(() => disk); store.hydrate(); store.toggle(article());
    expect(saved(store)).toHaveLength(1); expect(disk.values.get(READING_LIST_KEY)).toBe(raw);
    expect(disk.values.get(LEGACY_BOOKMARKS_KEY)).toBe('["old"]'); expect(store.getSnapshot().warning).toMatch(/reload/i);
  });
  it.each(["javascript:alert(1)", "file:///tmp/story", "https://user:secret@example.test/story"])("rejects unsafe persisted and new URLs: %s", url => {
    const unsafe = { ...article(), url };
    const raw = JSON.stringify({ version: 1, entries: [{ id: unsafe.id, savedAt: 1, article: unsafe }] });
    const disk = storage({ [READING_LIST_KEY]: raw }); const store = createNewsReadingListStore(() => disk); store.hydrate();
    expect(saved(store)).toEqual([]); store.toggle(unsafe); expect(saved(store)).toEqual([]); expect(disk.values.get(READING_LIST_KEY)).toBe(raw);
  });
  it("rejects unsafe canonical URLs and bounds selected fields and metadata", () => {
    const store = createNewsReadingListStore(() => storage()); store.hydrate();
    store.toggle({ ...article(), canonicalUrl: "javascript:alert(1)" }); expect(saved(store)).toHaveLength(0);
    store.toggle({ ...article(), snippet: "s".repeat(100_000), aliases: Array(1000).fill("a".repeat(2000)) });
    expect(saved(store)[0].article!.snippet.length).toBeLessThanOrEqual(12_000);
    expect(saved(store)[0].article!.aliases!.length).toBeLessThanOrEqual(32);
    expect(saved(store)[0].article!.aliases![0].length).toBeLessThanOrEqual(256);
  });
  it("refuses a 201st entry without eviction and allows saving again after removal", () => {
    const disk = storage(); const store = createNewsReadingListStore(() => disk); store.hydrate();
    for (let i = 0; i < 200; i++) store.toggle(article(String(i)));
    store.toggle(article("extra")); expect(saved(store)).toHaveLength(200); expect(saved(store)[0].id).toBe("0");
    expect(store.getSnapshot().warning).toMatch(/200/); store.remove("0"); store.toggle(article("extra"));
    expect(saved(store)).toHaveLength(200); expect(saved(store).some(e => e.id === "extra")).toBe(true);
    expect(store.getSnapshot().warning).toBeNull();
  });
  it("retains oversized legacy lists without writes until removals bring them within capacity", () => {
    const legacy = JSON.stringify(Array.from({ length: 202 }, (_, i) => String(i)));
    const disk = storage({ [LEGACY_BOOKMARKS_KEY]: legacy }); const store = createNewsReadingListStore(() => disk); store.hydrate();
    expect(saved(store)).toHaveLength(202); expect(disk.values.has(READING_LIST_KEY)).toBe(false); expect(store.getSnapshot().warning).toMatch(/200/);
    store.reconcile([article("0")]); store.remove("201"); expect(disk.values.get(LEGACY_BOOKMARKS_KEY)).toBe(legacy);
    store.remove("200"); expect(JSON.parse(disk.values.get(READING_LIST_KEY)!).entries).toHaveLength(200);
    expect(disk.values.has(LEGACY_BOOKMARKS_KEY)).toBe(false);
  });
});

it("rejects malformed runtime metadata without throwing through the save action", () => {
  const store = createNewsReadingListStore(() => ({ getItem: () => null, setItem: () => {}, removeItem: () => {} }));
  const malformed = { ...article(), aliases: [42] } as unknown as ReturnType<typeof article>;
  expect(() => store.toggle(malformed)).not.toThrow();
  expect(store.getSnapshot().entries).toHaveLength(0); expect(store.getSnapshot().warning).toMatch(/could not be saved/);
});
it("can reload bounded snapshots whose JSON grows through escaped text", () => {
  const disk = new Map<string, string>();
  const provider = () => ({ getItem: (key: string) => disk.get(key) ?? null, setItem: (key: string, value: string) => { disk.set(key, value); }, removeItem: (key: string) => { disk.delete(key); } });
  const store = createNewsReadingListStore(provider); store.hydrate();
  const snapshot = { ...article(), snippet: "\u0000".repeat(12_000) };
  // Build the same valid bounded entries a long-lived list can contain, without repetitive writes.
  disk.set(READING_LIST_KEY, JSON.stringify({ version: 1, entries: Array.from({ length: 120 }, (_, i) => ({ id: String(i), savedAt: 1, article: { ...snapshot, id: String(i) } })) }));
  const reload = createNewsReadingListStore(provider); reload.hydrate();
  expect(reload.getSnapshot().entries).toHaveLength(120);
  reload.toggle(article("additional"));
  const again = createNewsReadingListStore(provider); again.hydrate(); expect(again.getSnapshot().entries).toHaveLength(121);
});

it.each([
  ["empty", ""], ["blank", "   "], ["invalid URL", "not an image URL"],
  ["unsafe protocol", "javascript:alert(1)"], ["credentials", "https://user:secret@example.test/image"],
  ["oversized", "https://example.test/" + "x".repeat(4096)],
])("saves and reloads stories while omitting %s optional image data", (_label, imageUrl) => {
  const disk = new Map<string, string>();
  const provider = () => ({ getItem: (key: string) => disk.get(key) ?? null, setItem: (key: string, value: string) => { disk.set(key, value); }, removeItem: (key: string) => { disk.delete(key); } });
  const store = createNewsReadingListStore(provider); store.toggle({ ...article(), imageUrl });
  expect(store.getSnapshot().entries).toHaveLength(1); expect(store.getSnapshot().warning).toBeNull();
  const reload = createNewsReadingListStore(provider); reload.hydrate();
  expect(reload.getSnapshot().entries[0].article).toMatchObject({ headline: "Headline story", url: "https://example.test/story" });
  expect(reload.getSnapshot().entries[0].article).not.toHaveProperty("imageUrl");
});
it("resolves legacy stories without an image and retains valid HTTP(S) optional images", () => {
  const disk = new Map([[LEGACY_BOOKMARKS_KEY, '["legacy"]']]);
  const store = createNewsReadingListStore(() => ({ getItem: key => disk.get(key) ?? null, setItem: (key, value) => { disk.set(key, value); }, removeItem: key => { disk.delete(key); } }));
  store.hydrate(); store.reconcile([{ ...article("legacy"), imageUrl: "" }]);
  expect(store.getSnapshot().entries[0].article?.headline).toBe("Headline legacy");
  store.toggle({ ...article("with-image"), imageUrl: "https://example.test/image.jpg" });
  expect(store.getSnapshot().entries[1].article?.imageUrl).toBe("https://example.test/image.jpg");
});
