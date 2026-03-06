const ENABLED =
  typeof window !== "undefined" &&
  typeof performance !== "undefined" &&
  (process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_NEWS_PERF_DEBUG === "1");

export function perfMark(name: string): void {
  if (!ENABLED) return;
  try {
    performance.mark(name);
  } catch { /* ignore */ }
}

export function perfMeasure(name: string, startMark: string, endMark?: string): void {
  if (!ENABLED) return;
  try {
    const measure = performance.measure(name, startMark, endMark);
    // eslint-disable-next-line no-console
    console.info(`[news/perf] ${name}: ${measure.duration.toFixed(1)}ms`);
  } catch { /* marks may not exist */ }
}

let jankRafId: number | null = null;
let jankLastTime = 0;
let jankFrames = 0;
let jankMaxDelta = 0;
let jankWindowStart = 0;

function jankLoop(now: number) {
  if (jankLastTime > 0) {
    const delta = now - jankLastTime;
    if (delta > 32) jankFrames++;
    if (delta > jankMaxDelta) jankMaxDelta = delta;
  }
  jankLastTime = now;
  jankRafId = requestAnimationFrame(jankLoop);
}

export function startJankSampler(): void {
  if (!ENABLED || jankRafId !== null) return;
  jankFrames = 0;
  jankMaxDelta = 0;
  jankLastTime = 0;
  jankWindowStart = performance.now();
  jankRafId = requestAnimationFrame(jankLoop);
}

export function stopJankSampler(): void {
  if (jankRafId !== null) {
    cancelAnimationFrame(jankRafId);
    jankRafId = null;
  }
  if (!ENABLED) return;
  const elapsed = performance.now() - jankWindowStart;
  if (elapsed > 500) {
    // eslint-disable-next-line no-console
    console.info(
      `[news/perf] jitter window: ${elapsed.toFixed(0)}ms, jankFrames=${jankFrames}, maxDelta=${jankMaxDelta.toFixed(1)}ms`,
    );
  }
  jankFrames = 0;
  jankMaxDelta = 0;
}
