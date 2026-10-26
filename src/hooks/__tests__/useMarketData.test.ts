import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { useMarketData } from "../useMarketData";

const fallback = { quotes: [] as number[] };
let renderer: ReactTestRenderer | undefined;
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function mount() {
  let result!: ReturnType<typeof useMarketData<typeof fallback>>;
  function Probe() {
    result = useMarketData("/api/market/quotes", 60_000, fallback);
    return null;
  }
  await act(async () => { renderer = create(createElement(Probe)); });
  return () => result;
}

it("retains fetched quotes through repeated failed refreshes and recovers", async () => {
  const live = { quotes: [123] };
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(Response.json(live))
    .mockRejectedValue(new Error("offline"));
  vi.stubGlobal("fetch", fetchMock);
  const current = await mount();
  expect(current().data).toEqual(live);
  expect(current().isLive).toBe(true);
  const refresh = current().refresh;
  for (let i = 0; i < 2; i++) {
    await act(async () => { await current().refresh(); });
    expect(current().data).toEqual(live);
    expect(current().isLive).toBe(false);
    expect(current().error).toBe("offline");
    expect(current().loading).toBe(false);
    expect(current().refresh).toBe(refresh);
  }
  fetchMock.mockResolvedValueOnce(Response.json({ quotes: [456] }));
  await act(async () => { await current().refresh(); });
  expect(current().data).toEqual({ quotes: [456] });
  expect(current().isLive).toBe(true);
  expect(current().error).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

it("retains initial fallback when the first request fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
  const current = await mount();
  expect(current().data).toBe(fallback);
  expect(current().isLive).toBe(false);
  expect(current().loading).toBe(false);
  expect(current().error).toBe("HTTP 503");
});

it("retains a degraded response through a failed scheduled poll without restarting polling", async () => {
  vi.useFakeTimers();
  const degraded = { quotes: [123], degraded: true };
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(Response.json(degraded))
    .mockRejectedValue(new Error("offline"));
  vi.stubGlobal("fetch", fetchMock);
  const current = await mount();
  expect(current().data).toEqual(degraded);
  expect(current().isLive).toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(current().data).toEqual(degraded);
  expect(current().error).toBe("offline");
  expect(fetchMock).toHaveBeenCalledTimes(2);
  act(() => renderer?.unmount());
  renderer = undefined;
  await vi.advanceTimersByTimeAsync(60_000);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
