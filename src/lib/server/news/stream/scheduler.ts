import { getStreamStore } from "./store";
import { pollGdelt } from "./adapters/gdelt";
import { pollRss } from "./adapters/rss";
import { pollSec } from "./adapters/sec";
import { pollHackerNews } from "./adapters/hackerNews";
import { pollWikimediaFallback } from "./adapters/wikimedia";
import type { SourceHealthEntry } from "../../../news/stream/types";

// ---------------------------------------------------------------------------
// Scheduler configuration per source
// ---------------------------------------------------------------------------

interface SourceConfig {
  id: string;
  poll: () => Promise<{ items: any[]; healthUpdate: { ok: boolean; count: number; error?: string } }>;
  refreshMs: number;
  maxBackoffMs: number;
  enabled: boolean;
}

const JITTER_FACTOR = 0.15;

const SOURCES: SourceConfig[] = [
  { id: "gdelt",     poll: pollGdelt,             refreshMs: 45_000,  maxBackoffMs: 5 * 60_000,   enabled: true },
  { id: "rss",       poll: pollRss,               refreshMs: 30_000,  maxBackoffMs: 3 * 60_000,   enabled: true },
  { id: "sec",       poll: pollSec,               refreshMs: 60_000,  maxBackoffMs: 10 * 60_000,  enabled: true },
  { id: "hn",        poll: pollHackerNews,         refreshMs: 30_000,  maxBackoffMs: 5 * 60_000,   enabled: true },
  { id: "wikimedia", poll: pollWikimediaFallback,  refreshMs: 60_000,  maxBackoffMs: 5 * 60_000,   enabled: process.env.NEWS_WIKIMEDIA_STREAM_ENABLED === "true" },
];

// ---------------------------------------------------------------------------
// Per-source runtime state
// ---------------------------------------------------------------------------

interface SourceRuntime {
  timer: ReturnType<typeof setTimeout> | null;
  consecutiveFailures: number;
  currentBackoffMs: number;
  running: boolean;
}

const runtimes = new Map<string, SourceRuntime>();

function getRuntime(id: string): SourceRuntime {
  if (!runtimes.has(id)) {
    runtimes.set(id, { timer: null, consecutiveFailures: 0, currentBackoffMs: 0, running: false });
  }
  return runtimes.get(id)!;
}

// ---------------------------------------------------------------------------
// Poll loop for a single source
// ---------------------------------------------------------------------------

async function runPoll(config: SourceConfig) {
  const rt = getRuntime(config.id);
  if (rt.running) return;
  rt.running = true;
  const store = getStreamStore();
  const now = Date.now();

  try {
    const { items, healthUpdate } = await config.poll();

    if (healthUpdate.ok) {
      rt.consecutiveFailures = 0;
      rt.currentBackoffMs = 0;
      store.updateSourceHealth(config.id, {
        status: "live",
        lastSuccessAt: now,
        lastPollAt: now,
        errorCode: null,
        nextRetryAt: null,
        consecutiveFailures: 0,
        itemsLastPoll: healthUpdate.count,
      });
    } else {
      rt.consecutiveFailures++;
      rt.currentBackoffMs = Math.min(
        config.maxBackoffMs,
        config.refreshMs * Math.pow(2, rt.consecutiveFailures)
      );
      const status: SourceHealthEntry["status"] =
        rt.consecutiveFailures >= 5 ? "unavailable" : "degraded";
      store.updateSourceHealth(config.id, {
        status,
        lastPollAt: now,
        errorCode: healthUpdate.error ?? "unknown",
        nextRetryAt: now + rt.currentBackoffMs,
        consecutiveFailures: rt.consecutiveFailures,
        itemsLastPoll: 0,
      });
    }

    if (items.length > 0) {
      store.ingest(config.id, items);
    }
  } catch (err) {
    rt.consecutiveFailures++;
    rt.currentBackoffMs = Math.min(
      config.maxBackoffMs,
      config.refreshMs * Math.pow(2, rt.consecutiveFailures)
    );
    store.updateSourceHealth(config.id, {
      status: rt.consecutiveFailures >= 5 ? "unavailable" : "degraded",
      lastPollAt: now,
      errorCode: String(err),
      nextRetryAt: now + rt.currentBackoffMs,
      consecutiveFailures: rt.consecutiveFailures,
      itemsLastPoll: 0,
    });
  } finally {
    rt.running = false;
    scheduleNext(config);
  }
}

function scheduleNext(config: SourceConfig) {
  const rt = getRuntime(config.id);
  if (rt.timer) clearTimeout(rt.timer);

  const baseDelay = rt.currentBackoffMs > 0 ? rt.currentBackoffMs : config.refreshMs;
  const jitter = Math.round(baseDelay * JITTER_FACTOR * (Math.random() - 0.5) * 2);
  const delay = Math.max(1_000, baseDelay + jitter);

  rt.timer = setTimeout(() => void runPoll(config), delay);
}

// ---------------------------------------------------------------------------
// Singleton lifecycle
// ---------------------------------------------------------------------------

let started = false;

export function startScheduler() {
  if (started) return;
  started = true;

  for (const config of SOURCES) {
    if (!config.enabled) continue;
    const jitter = Math.round(Math.random() * 5_000);
    const rt = getRuntime(config.id);
    rt.timer = setTimeout(() => void runPoll(config), 1_000 + jitter);
  }
}

export function stopScheduler() {
  started = false;
  runtimes.forEach((rt) => {
    if (rt.timer) clearTimeout(rt.timer);
    rt.timer = null;
  });
  runtimes.clear();
}

export function isSchedulerRunning() { return started; }
