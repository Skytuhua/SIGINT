import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../../lib/server/ssrf", () => ({
  isBlockedHost: vi.fn().mockResolvedValue(false),
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
