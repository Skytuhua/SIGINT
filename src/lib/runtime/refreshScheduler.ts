export type SchedulerRunReason = "start" | "interval" | "visibility";

export interface SchedulerTaskContext {
  signal: AbortSignal;
  reason: SchedulerRunReason;
  attempt: number;
  now: number;
}

export interface SchedulerTaskConfig {
  key: string;
  intervalMs: number;
  run: (ctx: SchedulerTaskContext) => Promise<void> | void;
  runOnStart?: boolean;
  jitterPct?: number;
  hiddenIntervalMultiplier?: number;
  maxBackoffMultiplier?: number;
  timeoutMs?: number;
}

export interface SchedulerTaskEvent {
  taskKey: string;
  phase: "start" | "success" | "error" | "aborted";
  reason: SchedulerRunReason;
  durationMs: number;
  attempt: number;
  error?: unknown;
}

export interface RefreshSchedulerOptions {
  maxConcurrent?: number;
  hiddenIntervalMultiplier?: number;
  defaultTimeoutMs?: number;
  onTaskEvent?: (event: SchedulerTaskEvent) => void;
}

interface TaskState {
  config: SchedulerTaskConfig;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  attempt: number;
  nextDueAt: number;
  plannedDueAt: number;
  abortController: AbortController | null;
}

const DEFAULT_JITTER = 0.12;
const DEFAULT_MAX_BACKOFF_MULTIPLIER = 8;
const DEFAULT_TIMEOUT_MS = 30_000;

function isAbortError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof DOMException) return error.name === "AbortError";
  return error instanceof Error && error.name === "AbortError";
}

function jitterMs(baseMs: number, pct: number): number {
  if (pct <= 0 || baseMs <= 0) return baseMs;
  const spread = Math.max(1, baseMs * pct);
  const offset = (Math.random() * 2 - 1) * spread;
  return Math.max(250, Math.round(baseMs + offset));
}

function withTimeoutSignal(signal: AbortSignal, timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  const onAbort = () => controller.abort(new DOMException("Aborted", "AbortError"));
  const timeout = setTimeout(() => {
    controller.abort(new DOMException(`Timeout after ${timeoutMs}ms`, "AbortError"));
  }, Math.max(100, timeoutMs));

  if (signal.aborted) {
    onAbort();
  } else {
    signal.addEventListener("abort", onAbort, { once: true });
  }

  controller.signal.addEventListener(
    "abort",
    () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
    },
    { once: true }
  );

  return controller.signal;
}

export class RefreshScheduler {
  private readonly tasks = new Map<string, TaskState>();

  private readonly waiters: Array<() => void> = [];

  private readonly maxConcurrent: number;

  private readonly defaultHiddenIntervalMultiplier: number;

  private readonly defaultTimeoutMs: number;

  private readonly onTaskEvent?: (event: SchedulerTaskEvent) => void;

  private activeRuns = 0;

  private running = false;

  private disposed = false;

  private onVisibility = () => {
    if (!this.running || this.disposed) return;
    if (typeof document === "undefined" || document.hidden) return;

    const now = Date.now();
    this.tasks.forEach((task, key) => {
      if (task.inFlight) return;
      if (task.nextDueAt <= now) {
        this.scheduleAt(key, now, "visibility");
      }
    });
  };

  constructor(options: RefreshSchedulerOptions = {}) {
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? 2);
    this.defaultHiddenIntervalMultiplier = Math.max(
      1,
      options.hiddenIntervalMultiplier ?? 2.5
    );
    this.defaultTimeoutMs = Math.max(1_000, options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS);
    this.onTaskEvent = options.onTaskEvent;
  }

  registerTask(config: SchedulerTaskConfig): () => void {
    if (this.disposed) {
      throw new Error("RefreshScheduler has been disposed");
    }
    if (!config.key.trim()) {
      throw new Error("Scheduler task key is required");
    }
    if (config.intervalMs < 250) {
      throw new Error(`Scheduler task ${config.key} interval must be >= 250ms`);
    }

    this.unregisterTask(config.key);
    const now = Date.now();
    this.tasks.set(config.key, {
      config,
      timer: null,
      inFlight: false,
      attempt: 0,
      nextDueAt: now,
      plannedDueAt: now,
      abortController: null,
    });

    if (this.running) {
      if (config.runOnStart === false) {
        this.scheduleAt(config.key, now + config.intervalMs, "interval");
      } else {
        this.scheduleAt(config.key, now, "start");
      }
    }

    return () => this.unregisterTask(config.key);
  }

  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.onVisibility);
    }

    const now = Date.now();
    this.tasks.forEach((task, key) => {
      if (task.config.runOnStart === false) {
        this.scheduleAt(key, now + task.config.intervalMs, "interval");
      } else {
        this.scheduleAt(key, now, "start");
      }
    });
  }

  stop(): void {
    if (!this.running && !this.disposed) return;
    this.running = false;
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.onVisibility);
    }

    this.tasks.forEach((task) => {
      if (task.timer) {
        clearTimeout(task.timer);
        task.timer = null;
      }
      task.abortController?.abort();
      task.abortController = null;
      task.inFlight = false;
      task.attempt = 0;
      task.nextDueAt = 0;
      task.plannedDueAt = 0;
    });

    while (this.waiters.length) {
      const next = this.waiters.shift();
      next?.();
    }
  }

  dispose(): void {
    this.stop();
    this.disposed = true;
    this.tasks.clear();
  }

  trigger(key: string): void {
    const task = this.tasks.get(key);
    if (!task) return;
    // Abort stale run and retrigger immediately.
    task.abortController?.abort();
    this.scheduleAt(key, Date.now(), "interval");
  }

  private unregisterTask(key: string): void {
    const existing = this.tasks.get(key);
    if (!existing) return;
    if (existing.timer) clearTimeout(existing.timer);
    existing.abortController?.abort();
    this.tasks.delete(key);
  }

  private scheduleAt(key: string, dueAt: number, reason: SchedulerRunReason): void {
    if (!this.running || this.disposed) return;
    const task = this.tasks.get(key);
    if (!task) return;
    if (task.timer) clearTimeout(task.timer);

    const now = Date.now();
    const nextDueAt = Math.max(now, dueAt);
    task.nextDueAt = nextDueAt;
    task.plannedDueAt = nextDueAt;
    task.timer = setTimeout(() => {
      task.timer = null;
      void this.executeTask(key, reason);
    }, Math.max(0, nextDueAt - now));
  }

  private computeNextInterval(task: TaskState): number {
    const jitterPct = Math.max(0, task.config.jitterPct ?? DEFAULT_JITTER);
    const hiddenMultiplier = Math.max(
      1,
      task.config.hiddenIntervalMultiplier ?? this.defaultHiddenIntervalMultiplier
    );
    const maxBackoffMultiplier = Math.max(
      1,
      task.config.maxBackoffMultiplier ?? DEFAULT_MAX_BACKOFF_MULTIPLIER
    );
    const hidden = typeof document !== "undefined" ? document.hidden : false;
    const base = task.config.intervalMs * (hidden ? hiddenMultiplier : 1);
    const backoffMultiplier =
      task.attempt > 0
        ? Math.min(maxBackoffMultiplier, Math.pow(2, task.attempt - 1))
        : 1;
    return jitterMs(base * backoffMultiplier, jitterPct);
  }

  private scheduleNext(key: string): void {
    const task = this.tasks.get(key);
    if (!task) return;
    const interval = this.computeNextInterval(task);
    const now = Date.now();
    let nextDueAt = task.plannedDueAt + interval;
    while (nextDueAt <= now + 20) {
      nextDueAt += interval;
    }
    this.scheduleAt(key, nextDueAt, "interval");
  }

  private emit(event: SchedulerTaskEvent): void {
    this.onTaskEvent?.(event);
  }

  private async executeTask(key: string, reason: SchedulerRunReason): Promise<void> {
    if (!this.running || this.disposed) return;
    const task = this.tasks.get(key);
    if (!task || task.inFlight) return;

    task.inFlight = true;
    task.abortController?.abort();
    const controller = new AbortController();
    task.abortController = controller;

    let releaseSlot: (() => void) | null = null;
    const started = Date.now();
    this.emit({
      taskKey: key,
      phase: "start",
      reason,
      durationMs: 0,
      attempt: task.attempt,
    });

    try {
      releaseSlot = await this.acquireSlot(controller.signal);
      if (!this.running || this.disposed || controller.signal.aborted) return;

      const timeoutMs = Math.max(500, task.config.timeoutMs ?? this.defaultTimeoutMs);
      const signal = withTimeoutSignal(controller.signal, timeoutMs);
      await task.config.run({
        signal,
        reason,
        attempt: task.attempt,
        now: Date.now(),
      });

      task.attempt = 0;
      this.emit({
        taskKey: key,
        phase: "success",
        reason,
        durationMs: Date.now() - started,
        attempt: 0,
      });
    } catch (error) {
      if (isAbortError(error)) {
        this.emit({
          taskKey: key,
          phase: "aborted",
          reason,
          durationMs: Date.now() - started,
          attempt: task.attempt,
          error,
        });
      } else {
        task.attempt += 1;
        this.emit({
          taskKey: key,
          phase: "error",
          reason,
          durationMs: Date.now() - started,
          attempt: task.attempt,
          error,
        });
      }
    } finally {
      if (releaseSlot) releaseSlot();
      task.inFlight = false;
      if (task.abortController === controller) {
        task.abortController = null;
      }
      if (!this.running || this.disposed) return;
      this.scheduleNext(key);
    }
  }

  private async acquireSlot(signal: AbortSignal): Promise<() => void> {
    if (this.activeRuns < this.maxConcurrent) {
      this.activeRuns += 1;
      return this.releaseSlot;
    }

    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        signal.removeEventListener("abort", onAbort);
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      this.waiters.push(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      });
    });

    if (signal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    this.activeRuns += 1;
    return this.releaseSlot;
  }

  private releaseSlot = (): void => {
    this.activeRuns = Math.max(0, this.activeRuns - 1);
    const next = this.waiters.shift();
    next?.();
  };
}
