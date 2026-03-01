import { performance } from "perf_hooks";

export interface UpstreamRateLimit {
  capacity: number;
  refillPerSec: number;
  minIntervalMs?: number;
}

export interface UpstreamPolicy {
  key: string;
  ttlMs: number;
  staleTtlMs?: number;
  timeoutMs: number;
  maxRetries: number;
  backoffBaseMs: number;
  circuitFailureThreshold: number;
  circuitOpenMs: number;
  rateLimit?: UpstreamRateLimit;
}

export interface CircuitState {
  failureCount: number;
  openUntil: number;
  lastFailureAt: number;
}

export interface CachedFetchOptions<T> {
  cacheKey: string;
  policy: UpstreamPolicy;
  request: () => Promise<T>;
  fallbackValue?: T;
}

export interface CachedFetchResult<T> {
  data: T;
  degraded: boolean;
  latencyMs: number;
  cacheHit: "fresh" | "stale" | "miss";
  error?: string;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  staleUntil: number;
}

interface TokenBucket {
  tokens: number;
  lastRefillAt: number;
  lastAcquireAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<CachedFetchResult<unknown>>>();
const circuits = new Map<string, CircuitState>();
const buckets = new Map<string, TokenBucket>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function cacheMapKey(policyKey: string, cacheKey: string): string {
  return `${policyKey}::${cacheKey}`;
}

function getFresh<T>(key: string): T | null {
  const now = Date.now();
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (entry.expiresAt > now) return entry.value;
  return null;
}

function getStale<T>(key: string): T | null {
  const now = Date.now();
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (entry.staleUntil > now) return entry.value;
  return null;
}

function putCache<T>(key: string, value: T, ttlMs: number, staleTtlMs: number): void {
  const now = Date.now();
  cache.set(key, {
    value,
    expiresAt: now + ttlMs,
    staleUntil: now + staleTtlMs,
  });
}

function getCircuit(policy: UpstreamPolicy): CircuitState {
  const current = circuits.get(policy.key);
  if (current) return current;
  const next: CircuitState = { failureCount: 0, openUntil: 0, lastFailureAt: 0 };
  circuits.set(policy.key, next);
  return next;
}

function recordSuccess(policy: UpstreamPolicy): void {
  const circuit = getCircuit(policy);
  circuit.failureCount = 0;
  circuit.openUntil = 0;
}

function recordFailure(policy: UpstreamPolicy): void {
  const now = Date.now();
  const circuit = getCircuit(policy);
  circuit.failureCount += 1;
  circuit.lastFailureAt = now;
  if (circuit.failureCount >= policy.circuitFailureThreshold) {
    circuit.openUntil = now + policy.circuitOpenMs;
  }
}

function circuitOpen(policy: UpstreamPolicy): boolean {
  const now = Date.now();
  const circuit = getCircuit(policy);
  return circuit.openUntil > now;
}

function getBucket(policy: UpstreamPolicy): TokenBucket | null {
  if (!policy.rateLimit) return null;
  const existing = buckets.get(policy.key);
  if (existing) return existing;
  const created: TokenBucket = {
    tokens: policy.rateLimit.capacity,
    lastRefillAt: Date.now(),
    lastAcquireAt: 0,
  };
  buckets.set(policy.key, created);
  return created;
}

async function acquireToken(policy: UpstreamPolicy): Promise<void> {
  if (!policy.rateLimit) return;
  const bucket = getBucket(policy);
  if (!bucket) return;

  while (true) {
    const now = Date.now();
    const elapsed = Math.max(0, now - bucket.lastRefillAt);
    const refill = (elapsed / 1000) * policy.rateLimit.refillPerSec;
    if (refill > 0) {
      bucket.tokens = Math.min(policy.rateLimit.capacity, bucket.tokens + refill);
      bucket.lastRefillAt = now;
    }

    const minIntervalMs = policy.rateLimit.minIntervalMs ?? 0;
    const intervalOk = now - bucket.lastAcquireAt >= minIntervalMs;
    if (bucket.tokens >= 1 && intervalOk) {
      bucket.tokens -= 1;
      bucket.lastAcquireAt = now;
      return;
    }

    await sleep(Math.max(30, Math.min(250, minIntervalMs || 120)));
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isRetryableError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof UpstreamHttpError) {
    return err.status === 429 || err.status >= 500;
  }
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return message.includes("timeout") || message.includes("network") || message.includes("fetch");
}

export class UpstreamHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "UpstreamHttpError";
  }
}

export async function fetchJsonOrThrow<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<T> {
  const response = await withTimeout(fetch(url, init), timeoutMs);
  if (!response.ok) {
    throw new UpstreamHttpError(response.status, `${url} returned ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function cachedFetch<T>(options: CachedFetchOptions<T>): Promise<CachedFetchResult<T>> {
  const { policy, cacheKey, request, fallbackValue } = options;
  const fullKey = cacheMapKey(policy.key, cacheKey);
  const fresh = getFresh<T>(fullKey);
  if (fresh != null) {
    return {
      data: fresh,
      degraded: false,
      latencyMs: 0,
      cacheHit: "fresh",
    };
  }

  if (circuitOpen(policy)) {
    const stale = getStale<T>(fullKey);
    if (stale != null) {
      return {
        data: stale,
        degraded: true,
        latencyMs: 0,
        cacheHit: "stale",
        error: "circuit-open",
      };
    }
    if (fallbackValue !== undefined) {
      return {
        data: fallbackValue,
        degraded: true,
        latencyMs: 0,
        cacheHit: "miss",
        error: "circuit-open",
      };
    }
  }

  const pendingKey = fullKey;
  const existing = inFlight.get(pendingKey) as Promise<CachedFetchResult<T>> | undefined;
  if (existing) return existing;

  const runner = (async (): Promise<CachedFetchResult<T>> => {
    const started = performance.now();
    const stale = getStale<T>(fullKey);
    const staleTtlMs = Math.max(policy.ttlMs * 2, policy.staleTtlMs ?? policy.ttlMs * 5);

    let attempt = 0;
    while (attempt <= policy.maxRetries) {
      try {
        await acquireToken(policy);
        const data = await withTimeout(request(), policy.timeoutMs);
        putCache(fullKey, data, policy.ttlMs, staleTtlMs);
        recordSuccess(policy);
        return {
          data,
          degraded: false,
          latencyMs: performance.now() - started,
          cacheHit: "miss",
        };
      } catch (err) {
        attempt += 1;
        recordFailure(policy);
        const retryable = isRetryableError(err);
        const maxed = attempt > policy.maxRetries;
        if (!retryable || maxed) {
          if (stale != null) {
            return {
              data: stale,
              degraded: true,
              latencyMs: performance.now() - started,
              cacheHit: "stale",
              error: err instanceof Error ? err.message : String(err),
            };
          }
          if (fallbackValue !== undefined) {
            return {
              data: fallbackValue,
              degraded: true,
              latencyMs: performance.now() - started,
              cacheHit: "miss",
              error: err instanceof Error ? err.message : String(err),
            };
          }
          throw err;
        }
        const backoff = policy.backoffBaseMs * Math.pow(2, attempt - 1);
        await sleep(Math.min(backoff, 8_000));
      }
    }

    if (stale != null) {
      return {
        data: stale,
        degraded: true,
        latencyMs: performance.now() - started,
        cacheHit: "stale",
        error: "retry-exhausted",
      };
    }

    if (fallbackValue !== undefined) {
      return {
        data: fallbackValue,
        degraded: true,
        latencyMs: performance.now() - started,
        cacheHit: "miss",
        error: "retry-exhausted",
      };
    }

    throw new Error(`retry-exhausted:${policy.key}`);
  })();

  inFlight.set(pendingKey, runner as Promise<CachedFetchResult<unknown>>);
  try {
    return await runner;
  } finally {
    inFlight.delete(pendingKey);
  }
}

