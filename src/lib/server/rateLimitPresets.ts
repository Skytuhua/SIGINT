/**
 * Pre-configured rate limiter instances for API routes.
 *
 * Three tiers based on route sensitivity:
 * - STRICT:   10 req/min — LLM proxies, enrichment endpoints
 * - MODERATE: 30 req/min — search, suggest, geocoding
 * - STANDARD: 60 req/min — read-only data feeds
 */
import { createRateLimiter } from "./rateLimit";

export const STRICT_LIMITER = createRateLimiter({ windowMs: 60_000, maxRequests: 10 });
export const MODERATE_LIMITER = createRateLimiter({ windowMs: 60_000, maxRequests: 30 });
export const STANDARD_LIMITER = createRateLimiter({ windowMs: 60_000, maxRequests: 60 });
