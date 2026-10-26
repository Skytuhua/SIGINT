import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]) }));
vi.mock("undici", () => ({
  Agent: class { destroy = vi.fn().mockResolvedValue(undefined); },
  fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
}));
vi.mock("../../../../../../lib/server/withRateLimit", () => ({
  withRateLimit: (_limiter: unknown, handler: (req: Request) => Promise<Response>) => handler,
}));

import { GET } from "../route";

const request = () => new Request("http://localhost/api/cctv/insecam/proxy?url=https%3A%2F%2Fcamera.example%2Fsnapshot");

afterEach(() => vi.unstubAllGlobals());

describe("snapshot proxy content types", () => {
  it.each(["application/json", "image/svg+xml", "application/octet-stream", "text/html", ""])(
    "rejects unsupported or missing content type %s before reading the body",
    async (type) => {
      const body = vi.fn().mockResolvedValue(new ArrayBuffer(3));
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        status: 200, ok: true,
        headers: new Headers(type ? { "content-type": type } : {}),
        arrayBuffer: body,
      }));
      const response = await GET(request());
      expect(response.status).toBe(502);
      expect(body).not.toHaveBeenCalled();
    },
  );

  it.each(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif", "image/apng", "IMAGE/JPEG; charset=binary"])(
    "preserves raster snapshots with content type %s",
    async (type) => {
      const bytes = new Uint8Array([1, 2, 3]);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(bytes, { headers: { "content-type": type } })));
      const response = await GET(request());
      expect(response.status).toBe(200);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
      expect(response.headers.get("content-type")).toBe(type.split(";", 1)[0].trim().toLowerCase());
    },
  );
});

describe("snapshot resource boundaries", () => {
  it("cancels chunked data at the byte cap rather than reading the whole upstream", async () => {
    const cancel = vi.fn();
    let pulls = 0;
    const upstream = new Response(new ReadableStream({
      pull(controller) { pulls++; controller.enqueue(new Uint8Array(6 * 1024 * 1024)); }, cancel,
    }, { highWaterMark: 0 }), { headers: { "content-type": "image/jpeg" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(upstream));
    const response = await GET(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Response too large" });
    expect(pulls).toBe(2);
    expect(cancel).toHaveBeenCalled();
  });

  it("keeps the deadline active after headers and cancels a stalled body", async () => {
    const deadline = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    const cancel = vi.fn();
    let started!: () => void;
    const headers = new Promise<void>((resolve) => { started = resolve; });
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
      started();
      return Promise.resolve(new Response(new ReadableStream({ cancel }), { headers: { "content-type": "image/jpeg" } }));
    }));
    try {
      const pending = GET(request());
      await headers;
      deadline.abort(new DOMException("deadline", "TimeoutError"));
      expect((await pending).status).toBe(502);
      expect(cancel).toHaveBeenCalled();
    } finally { timeout.mockRestore(); }
  });
});
