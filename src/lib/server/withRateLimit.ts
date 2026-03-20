/**
 * Higher-order function that wraps a Next.js route handler with rate limiting.
 *
 * Usage:
 *   import { STANDARD_LIMITER } from "@/lib/server/rateLimitPresets";
 *   import { withRateLimit } from "@/lib/server/withRateLimit";
 *
 *   async function handler(request: Request) { ... }
 *   export const GET = withRateLimit(STANDARD_LIMITER, handler);
 */
import { getClientIp, rateLimitGuard } from "./rateLimit";

type RateLimiterFn = (key: string) => { allowed: boolean; remaining: number; retryAfterMs: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- handlers may use NextRequest which extends Request
export function withRateLimit<H extends (request: any, context?: any) => Promise<Response>>(
  limiter: RateLimiterFn,
  handler: H,
) {
  return async (request: Request, context?: unknown): Promise<Response> => {
    const blocked = rateLimitGuard(limiter(getClientIp(request)));
    if (blocked) return blocked;
    return handler(request, context);
  };
}
