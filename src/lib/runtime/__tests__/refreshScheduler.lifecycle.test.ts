import { afterEach, expect, it, vi } from "vitest";
import { RefreshScheduler } from "../refreshScheduler";

afterEach(() => vi.useRealTimers());
it("does not carry an old supersede request across stop/start", async () => {
  vi.useFakeTimers();
  let runs = 0;
  const scheduler = new RefreshScheduler({ maxConcurrent: 2 });
  scheduler.registerTask({
    key: "k", intervalMs: 60_000, jitterPct: 0,
    run: async ({ signal }) => {
      runs += 1;
      if (runs === 1) await new Promise<void>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    },
  });
  try {
    scheduler.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(runs).toBe(1);
    scheduler.trigger("k");
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(runs).toBe(2);
  } finally { scheduler.dispose(); }
});

it("does not let an old completion consume a newer run's supersede request", async () => {
  vi.useFakeTimers();
  let runs = 0;
  let finishOld!: () => void;
  let finishNew!: () => void;
  const old = new Promise<void>(resolve => { finishOld = resolve; });
  const current = new Promise<void>(resolve => { finishNew = resolve; });
  const scheduler = new RefreshScheduler({ maxConcurrent: 3 });
  scheduler.registerTask({
    key: "k", intervalMs: 60_000, jitterPct: 0,
    run: async () => {
      const run = ++runs;
      if (run === 1) await old;
      if (run === 2) await current;
    },
  });
  try {
    scheduler.start();
    await vi.advanceTimersByTimeAsync(10);
    scheduler.stop();
    scheduler.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(runs).toBe(2);
    scheduler.trigger("k");
    finishOld();
    await vi.advanceTimersByTimeAsync(10);
    expect(runs).toBe(2);
    finishNew();
    await vi.advanceTimersByTimeAsync(10);
    expect(runs).toBe(3);
  } finally { finishOld(); finishNew(); scheduler.dispose(); }
});

it("does not carry a retired run's failure into the current run's backoff", async () => {
  vi.useFakeTimers();
  let failOld!: (error: Error) => void;
  const old = new Promise<void>((_resolve, reject) => { failOld = reject; });
  const attempts: number[] = [];
  const scheduler = new RefreshScheduler({ maxConcurrent: 3 });
  scheduler.registerTask({
    key: "k", intervalMs: 60_000, jitterPct: 0,
    run: async ({ signal, attempt }) => {
      attempts.push(attempt);
      if (attempts.length === 1) await old;
      else if (attempts.length === 2) await new Promise<void>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    },
  });
  try {
    scheduler.start();
    await vi.advanceTimersByTimeAsync(10);
    scheduler.stop();
    scheduler.start();
    await vi.advanceTimersByTimeAsync(10);
    failOld(new Error("Retired request failed"));
    await vi.advanceTimersByTimeAsync(0);
    scheduler.trigger("k");
    await vi.advanceTimersByTimeAsync(10);
    expect(attempts).toEqual([0, 0, 0]);
  } finally { scheduler.dispose(); }
});
