import { afterEach, expect, it, vi } from "vitest";
import { fetchJsonWithPolicy } from "../fetchJson";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it("retries a shared request when only its original caller hits a deadline", async () => {
  vi.useFakeTimers();
  let calls = 0;
  vi.stubGlobal("fetch", vi.fn((_url, init) => {
    calls++;
    if (calls > 1) return Promise.resolve(new Response(JSON.stringify({ ok: true })));
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
    });
  }));
  const owner = new AbortController();
  const joiner = new AbortController();
  const first = fetchJsonWithPolicy("/review/shared", { signal: owner.signal, retries: 0, negativeTtlMs: 0 }).catch(e => e);
  const second = fetchJsonWithPolicy("/review/shared", { signal: joiner.signal, retries: 0, negativeTtlMs: 0 });
  const outcome = second.then(value => ({ value }), error => ({ error }));
  owner.abort(new DOMException("Timeout after 500ms", "TimeoutError"));
  await vi.advanceTimersByTimeAsync(0);
  expect(await first).toMatchObject({ name: "TimeoutError" });
  expect(await outcome).toEqual({ value: { ok: true } });
  expect(calls).toBe(2);
});

it("shares an exhausted request timeout when its owner is still active", async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
  }));
  vi.stubGlobal("fetch", fetchMock);
  const owner = new AbortController();
  const joiner = new AbortController();
  const policy = { timeoutMs: 500, retries: 0, negativeTtlMs: 0 };
  const first = fetchJsonWithPolicy("/review/request-timeout", { ...policy, signal: owner.signal }).catch(e => e);
  const second = fetchJsonWithPolicy("/review/request-timeout", { ...policy, signal: joiner.signal }).catch(e => e);
  await vi.advanceTimersByTimeAsync(500);
  expect(await first).toMatchObject({ name: "TimeoutError" });
  expect(await second).toMatchObject({ name: "TimeoutError" });
  expect(owner.signal.aborted).toBe(false);
  expect(joiner.signal.aborted).toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
