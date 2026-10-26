import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RefreshScheduler } from "../refreshScheduler";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("scheduler queue cancellation", () => {
  let scheduler: RefreshScheduler;
  beforeEach(() => {
    vi.useFakeTimers();
    scheduler = new RefreshScheduler({ maxConcurrent: 1 });
  });
  afterEach(() => {
    scheduler.dispose();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it.each([1, 3])("skips %i cancelled waiters without starving live tasks", async (count) => {
    const blocker = deferred();
    const active = vi.fn(() => blocker.promise);
    const cancelled = vi.fn();
    const live = vi.fn();
    const register = (key: string, run: () => void | Promise<void>) =>
      scheduler.registerTask({ key, run, intervalMs: 60_000 });
    register("active", active);
    const unregister = Array.from({ length: count }, (_, i) => register(`cancelled-${i}`, cancelled));
    register("live", live);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(1);
    expect(active).toHaveBeenCalledTimes(1);
    expect(cancelled).not.toHaveBeenCalled();
    expect(live).not.toHaveBeenCalled();

    unregister.forEach((cancel) => cancel());
    blocker.resolve();
    await vi.advanceTimersByTimeAsync(1);

    expect(cancelled).not.toHaveBeenCalled();
    expect(live).toHaveBeenCalledTimes(1);
  });

  it("runs queued tasks in order without exceeding the slot limit", async () => {
    const blocks = [deferred(), deferred(), deferred()];
    const order: number[] = [];
    let active = 0;
    let peak = 0;
    blocks.forEach((block, i) => scheduler.registerTask({
      key: `task-${i}`, intervalMs: 60_000,
      run: async () => {
        order.push(i);
        peak = Math.max(peak, ++active);
        await block.promise;
        active--;
      },
    }));
    scheduler.start();
    await vi.advanceTimersByTimeAsync(1);
    expect(order).toEqual([0]);
    blocks[0].resolve();
    await vi.advanceTimersByTimeAsync(1);
    expect(order).toEqual([0, 1]);
    blocks[1].resolve();
    await vi.advanceTimersByTimeAsync(1);
    expect(order).toEqual([0, 1, 2]);
    blocks[2].resolve();
    await vi.advanceTimersByTimeAsync(1);
    expect(active).toBe(0);
    expect(peak).toBe(1);
  });
});
