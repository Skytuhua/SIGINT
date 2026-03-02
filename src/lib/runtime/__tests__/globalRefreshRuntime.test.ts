import { afterEach, describe, expect, it } from "vitest";
import { globalRefreshRuntime } from "../globalRefreshRuntime";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("globalRefreshRuntime", () => {
  afterEach(() => {
    globalRefreshRuntime.stopAll();
  });

  it("keeps at most one in-flight run per task key", async () => {
    let callCount = 0;
    let release: (() => void) | null = null;
    const block = new Promise<void>((resolve) => {
      release = resolve;
    });

    const dispose = globalRefreshRuntime.register({
      pool: "ops",
      task: {
        key: "test:coalesce",
        intervalMs: 60_000,
        runOnStart: false,
        run: async () => {
          callCount += 1;
          await block;
        },
      },
    });

    globalRefreshRuntime.trigger("test:coalesce");
    globalRefreshRuntime.trigger("test:coalesce");
    globalRefreshRuntime.trigger("test:coalesce");

    await sleep(40);
    expect(callCount).toBe(1);

    release?.();
    await sleep(40);
    dispose();
  });
});
