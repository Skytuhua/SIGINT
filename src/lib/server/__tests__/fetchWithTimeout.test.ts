import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "../fetchWithTimeout";

afterEach(() => vi.unstubAllGlobals());

describe("fetch deadline", () => {
  it("keeps the abort signal active after response headers", async () => {
    let signal!: AbortSignal;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url, init) => {
      signal = init.signal;
      return Promise.resolve(new Response(new ReadableStream({
        start(controller) { signal.addEventListener("abort", () => controller.error(signal.reason), { once: true }); },
      })));
    }));
    const response = await fetchWithTimeout("https://provider.example/", {}, 10);
    await expect(response.text()).rejects.toThrow();
    expect(signal.aborted).toBe(true);
  });
  it("composes the caller's cancellation signal", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    await fetchWithTimeout("https://provider.example/", { signal: controller.signal });
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    controller.abort();
    expect(signal.aborted).toBe(true);
  });
});
