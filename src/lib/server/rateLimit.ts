/**
 * In-memory fixed-window rate limiter.
 *
 * Each limiter tracks request counts per key (typically client IP)
 * within a configurable time window. Expired entries are cleaned up
 * automatically every 5 minutes to prevent unbounded memory growth.
 */
import net from "node:net";

interface RateLimitConfig {
  /** Time window in milliseconds (e.g. 60_000 for 1 minute). */
  windowMs: number;
  /** Maximum requests allowed per window. */
  maxRequests: number;
  /** Fail closed rather than evict active quotas when identity storage is full. */
  maxEntries?: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

interface Entry {
  count: number;
  windowStart: number;
}

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

export function createRateLimiter(config: RateLimitConfig) {
  const entries = new Map<string, Entry>();
  const maxEntries = config.maxEntries ?? 10_000;

  // Periodic cleanup of expired entries
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of entries) {
      if (now - entry.windowStart >= config.windowMs) {
        entries.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);

  // Allow GC if the module is unloaded
  if (typeof cleanup === "object" && "unref" in cleanup) {
    cleanup.unref();
  }

  return function check(key: string): RateLimitResult {
    const now = Date.now();
    const existing = entries.get(key);

    // If no entry or window expired, start fresh
    if (!existing || now - existing.windowStart >= config.windowMs) {
      if (!existing && entries.size >= maxEntries) {
        for (const [entryKey, entry] of entries) {
          if (now - entry.windowStart >= config.windowMs) entries.delete(entryKey);
        }
        if (entries.size >= maxEntries) {
          return { allowed: false, remaining: 0, retryAfterMs: config.windowMs };
        }
      }
      entries.set(key, { count: 1, windowStart: now });
      return { allowed: true, remaining: config.maxRequests - 1, retryAfterMs: 0 };
    }

    // Within current window
    if (existing.count < config.maxRequests) {
      existing.count += 1;
      return {
        allowed: true,
        remaining: config.maxRequests - existing.count,
        retryAfterMs: 0,
      };
    }

    // Rate limited
    const retryAfterMs = config.windowMs - (now - existing.windowStart);
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(retryAfterMs, 0),
    };
  };
}

/** Trust a single-IP header only under the documented, explicit ingress contract. */
export function getClientIp(req: Request): string {
  const header = process.env.TRUSTED_CLIENT_IP_HEADER?.trim();
  if (!header || !/^[a-z0-9!#$%&'*+.^_`|~-]+$/i.test(header)) return "unknown";
  const address = req.headers.get(header)?.trim() ?? "";
  const family = net.isIP(address);
  if (!family) return "unknown";
  if (family === 4) return address;
  // Keep equivalent expanded/compressed IPv6 identities in one quota bucket.
  const normalized = new URL(`http://[${address.split("%", 1)[0]}]/`).hostname.slice(1, -1);
  if (normalized.startsWith("::ffff:")) {
    const [high, low] = normalized.slice(7).split(":").map((part) => Number.parseInt(part, 16));
    return [high >> 8, high & 255, low >> 8, low & 255].join(".");
  }
  return normalized;
}

/** Return a 429 NextResponse if rate limited, or null if allowed. */
export function rateLimitGuard(
  result: RateLimitResult,
): import("next/server").NextResponse | null {
  if (result.allowed) return null;

  const { NextResponse } = require("next/server");
  return NextResponse.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)),
      },
    },
  );
}
