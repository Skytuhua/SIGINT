export class HttpError extends Error {
  status: number;

  retryAfterMs: number | null;

  constructor(status: number, message: string, retryAfterMs: number | null = null) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export interface FetchJsonPolicy {
  key?: string;
  init?: RequestInit;
  signal?: AbortSignal;
  cache?: RequestCache;
  timeoutMs?: number;
  retries?: number;
  backoffBaseMs?: number;
  maxBackoffMs?: number;
  negativeTtlMs?: number;
}

interface NegativeEntry {
  until: number;
  error: Error;
}

const inFlight = new Map<string, Promise<unknown>>();
const negativeCache = new Map<string, NegativeEntry>();

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 1;
const DEFAULT_BACKOFF_MS = 400;
const DEFAULT_MAX_BACKOFF_MS = 8_000;
const DEFAULT_NEGATIVE_TTL_MS = 1_200;

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    return Math.max(0, Math.round(numeric * 1000));
  }
  const parsedDate = Date.parse(trimmed);
  if (!Number.isFinite(parsedDate)) return null;
  return Math.max(0, parsedDate - Date.now());
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function isAbortError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof DOMException) return error.name === "AbortError";
  return error instanceof Error && error.name === "AbortError";
}

function isRetryable(error: unknown): boolean {
  if (isAbortError(error)) return false;
  if (error instanceof HttpError) {
    return error.status === 408 || error.status === 429 || error.status >= 500;
  }
  const msg = toErrorMessage(error).toLowerCase();
  return msg.includes("timeout") || msg.includes("network") || msg.includes("fetch");
}

function backoffWithJitter(baseMs: number): number {
  const jitter = Math.round((Math.random() * 0.4 - 0.2) * baseMs);
  return Math.max(120, baseMs + jitter);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

function composeSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new DOMException(`Timeout after ${timeoutMs}ms`, "TimeoutError"));
  }, timeoutMs);

  const onAbort = () => controller.abort(new DOMException("Aborted", "AbortError"));
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }

  controller.signal.addEventListener(
    "abort",
    () => {
      clearTimeout(timeout);
      if (signal) signal.removeEventListener("abort", onAbort);
    },
    { once: true }
  );

  return controller.signal;
}

async function awaitWithSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

function maybeApplyNegativeCache(key: string, error: unknown, ttlMs: number): void {
  if (ttlMs <= 0) return;
  if (isAbortError(error)) return;
  const until = Date.now() + ttlMs;
  const wrapped = error instanceof Error ? error : new Error(String(error));
  negativeCache.set(key, { until, error: wrapped });
}

function cleanNegativeCache(): void {
  const now = Date.now();
  negativeCache.forEach((entry, key) => {
    if (entry.until <= now) negativeCache.delete(key);
  });
}

export async function fetchJsonWithPolicy<T>(
  url: string,
  policy: FetchJsonPolicy = {}
): Promise<T> {
  const key = policy.key ?? url;
  const timeoutMs = Math.max(500, policy.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const retries = Math.max(0, policy.retries ?? DEFAULT_RETRIES);
  const backoffBaseMs = Math.max(50, policy.backoffBaseMs ?? DEFAULT_BACKOFF_MS);
  const maxBackoffMs = Math.max(backoffBaseMs, policy.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS);
  const negativeTtlMs = Math.max(0, policy.negativeTtlMs ?? DEFAULT_NEGATIVE_TTL_MS);

  cleanNegativeCache();
  const negative = negativeCache.get(key);
  if (negative && negative.until > Date.now()) {
    throw new Error(`cooldown:${key}:${negative.error.message}`);
  }

  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) {
    return await awaitWithSignal(existing, policy.signal);
  }

  const run = (async (): Promise<T> => {
    let attempt = 0;
    while (attempt <= retries) {
      const combinedSignal = composeSignal(policy.signal, timeoutMs);
      try {
        const response = await fetch(url, {
          ...policy.init,
          cache: policy.cache ?? "no-store",
          signal: combinedSignal,
        });
        if (!response.ok) {
          throw new HttpError(
            response.status,
            `${url} returned ${response.status}`,
            parseRetryAfterMs(response.headers.get("retry-after"))
          );
        }
        const payload = (await response.json()) as T;
        negativeCache.delete(key);
        return payload;
      } catch (error) {
        if (!isRetryable(error) || attempt >= retries) {
          maybeApplyNegativeCache(key, error, negativeTtlMs);
          throw error;
        }
        const retryAfterMs =
          error instanceof HttpError && Number.isFinite(error.retryAfterMs)
            ? (error.retryAfterMs as number)
            : 0;
        const backoffMs = Math.min(maxBackoffMs, backoffBaseMs * Math.pow(2, attempt));
        const waitMs = Math.max(retryAfterMs, backoffWithJitter(backoffMs));
        attempt += 1;
        await sleep(waitMs, policy.signal);
      }
    }

    throw new Error(`retry-exhausted:${key}`);
  })();

  inFlight.set(key, run as Promise<unknown>);
  try {
    return await awaitWithSignal(run, policy.signal);
  } finally {
    if (inFlight.get(key) === run) {
      inFlight.delete(key);
    }
  }
}
