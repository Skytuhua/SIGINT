import { afterEach, describe, expect, it, vi } from "vitest";
import { pollHackerNews } from "../adapters/hackerNews";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("polling body deadlines", () => {
  it("keeps Hacker News cancellation active after headers", async () => {
    const deadline = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    let started!: () => void;
    const headers = new Promise<void>((resolve) => { started = resolve; });
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url, init: RequestInit) => {
      const signal = init.signal!;
      const body = new ReadableStream({ start(controller) {
        signal.addEventListener("abort", () => controller.error(signal.reason), { once: true });
      } });
      started();
      return Promise.resolve(new Response(body));
    }));
    const pending = pollHackerNews();
    await headers;
    deadline.abort(new DOMException("deadline", "TimeoutError"));
    expect((await pending).healthUpdate.ok).toBe(false);
  });

  it("finishes the Wikimedia collection window even when its next read stalls", async () => {
    vi.stubEnv("NEWS_WIKIMEDIA_STREAM_ENABLED", "true");
    vi.resetModules();
    const overall = new AbortController();
    const collection = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => ms === 8_000 ? overall.signal : collection.signal);
    const cancel = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }))));
    const { pollWikimediaFallback } = await import("../adapters/wikimedia");
    const pending = pollWikimediaFallback();
    await vi.waitFor(() => expect(timeout).toHaveBeenCalledWith(5_000));
    collection.abort(new DOMException("collection complete", "TimeoutError"));
    expect((await pending).healthUpdate).toEqual({ ok: true, count: 0 });
    expect(cancel).toHaveBeenCalled();
  });

  it("releases the Wikimedia body on the overall deadline", async () => {
    vi.stubEnv("NEWS_WIKIMEDIA_STREAM_ENABLED", "true");
    vi.resetModules();
    const overall = new AbortController();
    const collection = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => ms === 8_000 ? overall.signal : collection.signal);
    const cancel = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }))));
    const { pollWikimediaFallback } = await import("../adapters/wikimedia");
    const pending = pollWikimediaFallback();
    await vi.waitFor(() => expect(timeout).toHaveBeenCalledWith(5_000));
    overall.abort(new DOMException("deadline", "TimeoutError"));
    expect((await pending).healthUpdate.ok).toBe(false);
    expect(cancel).toHaveBeenCalled();
  });
});
