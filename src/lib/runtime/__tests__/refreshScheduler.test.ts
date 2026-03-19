import { describe, expect, it } from "vitest";
import { RefreshScheduler } from "../refreshScheduler";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("RefreshScheduler", () => {
  it("coalesces rapid triggers into one in-flight run", async () => {
    const scheduler = new RefreshScheduler({ maxConcurrent: 1 });
    let runs = 0;
    let release: (() => void) | null = null;
    const block = new Promise<void>((resolve) => {
      release = resolve;
    });

    scheduler.registerTask({
      key: "k",
      intervalMs: 60_000,
      runOnStart: false,
      run: async () => {
        runs += 1;
        await block;
      },
    });

    scheduler.start();
    scheduler.trigger("k");
    scheduler.trigger("k");
    scheduler.trigger("k");

    await sleep(40);
    expect(runs).toBe(1);

    (release as (() => void) | null)?.();
    await sleep(20);
    scheduler.stop();
  });

  it("aborts prior run when retriggered", async () => {
    const scheduler = new RefreshScheduler({ maxConcurrent: 1 });
    let aborts = 0;

    scheduler.registerTask({
      key: "abort-test",
      intervalMs: 60_000,
      runOnStart: false,
      run: async ({ signal }) => {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 150);
          signal.addEventListener("abort", () => {
            clearTimeout(timer);
            aborts += 1;
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      },
    });

    scheduler.start();
    scheduler.trigger("abort-test");
    await sleep(20);
    scheduler.trigger("abort-test");
    await sleep(50);

    expect(aborts).toBeGreaterThan(0);
    scheduler.stop();
  });
});
