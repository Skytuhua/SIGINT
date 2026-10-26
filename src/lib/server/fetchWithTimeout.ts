/**
 * Shared fetch wrapper with AbortController-based timeout.
 *
 * Prefer this over raw `fetch()` in all server-side API routes to prevent
 * hanging upstream requests from tying up the Node.js event loop.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10_000,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}
