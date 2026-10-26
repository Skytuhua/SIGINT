/**
 * Shared fetch deadline. The signal remains active while callers read the body.
 *
 * Prefer this over raw `fetch()` in all server-side API routes to prevent
 * hanging upstream requests from tying up the Node.js event loop.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10_000,
): Promise<Response> {
  return fetch(url, { ...options, signal: requestDeadline(timeoutMs, options.signal) });
}

export function requestDeadline(timeoutMs: number, parent?: AbortSignal | null): AbortSignal {
  const deadline = AbortSignal.timeout(timeoutMs);
  return parent ? AbortSignal.any([parent, deadline]) : deadline;
}

/** Also race operations such as DNS/stream reads that do not accept a signal. */
export async function abortable<T>(operation: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return operation;
  if (signal.aborted) void operation.catch(() => undefined);
  signal.throwIfAborted();
  let onAbort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([operation, aborted]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

/** Count streamed bytes (including decompressed fetch bodies) before retaining them. */
export async function readResponseBytes(
  response: Response,
  maxBytes: number,
  signal?: AbortSignal | null,
): Promise<Uint8Array> {
  signal?.throwIfAborted();
  const declaredSize = response.headers.get("content-length");
  if (declaredSize && Number(declaredSize) > maxBytes) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error("Response too large");
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await abortable(reader.read(), signal);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("Response too large");
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } catch (error) {
    void reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}
