import { afterEach, describe, expect, it, vi } from "vitest";

const SAMPLE_SWPC = [
  {
    product_id: "EF3A",
    issue_datetime: "2026-03-02 05:00:13.617",
    message:
      "Space Weather Message Code: ALTEF3\r\nCONTINUED ALERT: Electron 2MeV Integral Flux exceeded 1000pfu",
  },
];

describe("/api/space-weather route", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("normalizes SWPC alert schema", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(SAMPLE_SWPC), {
          status: 200,
          headers: {
            etag: '"swpc-1"',
            "last-modified": "Mon, 02 Mar 2026 05:22:04 GMT",
            "content-type": "application/json",
          },
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);

    const { GET } = await import("../route");
    const response = await GET();
    const payload = await response.json();

    expect(payload.status).toBe("live");
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      source: "swpc",
      productId: "EF3A",
      level: "ALERT",
    });
  });

  it("sends conditional headers after fresh ttl and handles 304", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(SAMPLE_SWPC), {
          status: 200,
          headers: {
            etag: '"swpc-2"',
            "last-modified": "Mon, 02 Mar 2026 05:22:04 GMT",
            "content-type": "application/json",
          },
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    vi.stubGlobal("fetch", fetchMock);

    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(2_000_000);

    const { GET } = await import("../route");
    await GET();

    now.mockReturnValue(2_000_000 + 2 * 60_000 + 1);
    const response = await GET();
    const payload = await response.json();

    expect(payload.status).toBe("live");
    const secondCallInit = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
    const headers = (secondCallInit?.headers ?? {}) as Record<string, string>;
    expect(headers["If-None-Match"]).toBe('"swpc-2"');
  });

  it("uses stale cached payload when upstream fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(SAMPLE_SWPC), {
          status: 200,
          headers: {
            etag: '"swpc-3"',
            "last-modified": "Mon, 02 Mar 2026 05:22:04 GMT",
            "content-type": "application/json",
          },
        })
      )
      .mockRejectedValueOnce(new Error("swpc down"));
    vi.stubGlobal("fetch", fetchMock);

    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(2_000_000);

    const { GET } = await import("../route");
    await GET();

    now.mockReturnValue(2_000_000 + 2 * 60_000 + 1);
    const response = await GET();
    const payload = await response.json();

    expect(payload.status).toBe("degraded");
    expect(payload.items.length).toBeGreaterThan(0);
  });
});
