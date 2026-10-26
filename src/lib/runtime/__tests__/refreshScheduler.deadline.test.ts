import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RefreshScheduler, type SchedulerTaskEvent } from "../refreshScheduler";
import { fetchJsonWithPolicy } from "../fetchJson";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("RefreshScheduler deadline semantics", () => {
  it("reports deadline failures and applies failure backoff through fetchJson", async () => {
    const events: SchedulerTaskEvent[] = [];
    const attempts: number[] = [];
    const fetchMock = vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init!.signal!;
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);
    const scheduler = new RefreshScheduler({ onTaskEvent: (event) => events.push(event) });
    scheduler.registerTask({
      key: "deadline", intervalMs: 1000, timeoutMs: 500, jitterPct: 0, runOnStart: true,
      run: async ({ signal, attempt }) => {
        attempts.push(attempt);
        await fetchJsonWithPolicy("/deadline-test", { signal, timeoutMs: 5000, retries: 2, negativeTtlMs: 0 });
      },
    });
    try {
      scheduler.start();
      await vi.advanceTimersByTimeAsync(2600);
      expect(events.filter((e) => e.phase === "error")).toHaveLength(2);
      expect(events.find((e) => e.phase === "error")?.error).toMatchObject({ name: "TimeoutError" });
      expect(events.some((e) => e.phase === "aborted")).toBe(false);
      expect(attempts).toEqual([0, 1]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(500);
      expect(attempts).toEqual([0, 1, 2]);
    } finally {
      scheduler.dispose();
      await vi.advanceTimersByTimeAsync(0);
    }
  });
});
