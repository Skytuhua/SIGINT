import type { SchedulerTaskConfig } from "./refreshScheduler";
import { RefreshScheduler } from "./refreshScheduler";

type RuntimePool = "ops" | "news";

interface RuntimeRegistration {
  pool: RuntimePool;
  task: SchedulerTaskConfig;
}

class GlobalRefreshRuntime {
  private readonly schedulers: Record<RuntimePool, RefreshScheduler>;

  private readonly refs: Record<RuntimePool, number> = {
    ops: 0,
    news: 0,
  };

  private readonly keys = new Map<string, RuntimePool>();

  constructor() {
    this.schedulers = {
      ops: new RefreshScheduler({
        maxConcurrent: 2,
        hiddenIntervalMultiplier: 2.5,
        defaultTimeoutMs: 25_000,
      }),
      news: new RefreshScheduler({
        maxConcurrent: 6,
        hiddenIntervalMultiplier: 2.5,
        defaultTimeoutMs: 25_000,
      }),
    };
  }

  register({ pool, task }: RuntimeRegistration): () => void {
    const scheduler = this.schedulers[pool];
    const unregister = scheduler.registerTask(task);
    this.keys.set(task.key, pool);
    this.refs[pool] += 1;
    scheduler.start();

    return () => {
      unregister();
      const prev = this.refs[pool];
      this.refs[pool] = Math.max(0, prev - 1);
      this.keys.delete(task.key);
      if (this.refs[pool] === 0) {
        scheduler.stop();
      }
    };
  }

  trigger(taskKey: string): void {
    const pool = this.keys.get(taskKey);
    if (!pool) return;
    this.schedulers[pool].trigger(taskKey);
  }

  stopAll(): void {
    this.schedulers.ops.stop();
    this.schedulers.news.stop();
    this.refs.ops = 0;
    this.refs.news = 0;
    this.keys.clear();
  }
}

export const globalRefreshRuntime = new GlobalRefreshRuntime();
