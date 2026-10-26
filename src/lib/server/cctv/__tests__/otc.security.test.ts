import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]) }));
vi.mock("undici", () => ({
  Agent: class { destroy = vi.fn().mockResolvedValue(undefined); },
  fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
}));
import { validateCameraHead } from "../otc";
afterEach(() => vi.unstubAllGlobals());

describe("OTC connection policy", () => {
  it("preserves HEAD and range-GET fallback and releases the range body", async () => {
    const cancel = vi.fn();
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 405 }))
      .mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), { status: 206, headers: { "content-type": "image/jpeg" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await validateCameraHead("https://camera.example/snapshot")).toBe(true);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "HEAD", redirect: "manual" });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "GET", headers: { Range: "bytes=0-0" } });
    expect(cancel).toHaveBeenCalled();
  });
  it("blocks a redirected private destination before the second connection", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "http://[::ffff:127.0.0.1]/" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await validateCameraHead("https://camera.example/snapshot")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("preserves ordinary public redirects", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "/new/snapshot" } }))
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { "content-type": "image/jpeg" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await validateCameraHead("https://camera.example/snapshot")).toBe(true);
    expect(fetchMock.mock.calls[1][0]).toBe("https://camera.example/new/snapshot");
  });
});
