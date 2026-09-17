import { describe, expect, it } from "vitest";
import { RefreshScheduler } from "../refreshScheduler";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("RefreshScheduler.trigger supersede", () => {
  it("starts a fresh run immediately when trigger aborts an in-flight run", async () => {
    const scheduler = new RefreshScheduler({ maxConcurrent: 1 });
    let runs = 0;

    scheduler.registerTask({
      key: "k",
      intervalMs: 60_000,
      runOnStart: false,
      run: async ({ signal }) => {
        runs += 1;
        if (runs === 1) {
          // Simulate a long fetch that observes the abort signal.
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, 5_000);
            signal.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
              },
              { once: true }
            );
          });
        }
      },
    });

    scheduler.start();
    scheduler.trigger("k");

    await sleep(20);
    expect(runs).toBe(1);

    // First run still in flight; manual refresh supersedes it.
    scheduler.trigger("k");
    await sleep(30);

    // The replacement run must actually start, not be cancelled by the
    // aborted run's scheduleNext() clearTimeout.
    expect(runs).toBeGreaterThanOrEqual(2);

    scheduler.stop();
  });
});
