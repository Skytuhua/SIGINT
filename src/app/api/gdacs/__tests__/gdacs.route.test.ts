import { afterEach, describe, expect, it, vi } from "vitest";

const SAMPLE_GDACS_XML = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:geo="http://www.w3.org/2003/01/geo/wgs84_pos#" xmlns:gdacs="http://www.gdacs.org">
  <channel>
    <item>
      <title>Green earthquake test</title>
      <description>desc</description>
      <link>https://example.test/event</link>
      <pubDate>Mon, 02 Mar 2026 05:01:45 GMT</pubDate>
      <gdacs:datemodified>Mon, 02 Mar 2026 05:01:45 GMT</gdacs:datemodified>
      <gdacs:eventtype>EQ</gdacs:eventtype>
      <gdacs:eventid>1526959</gdacs:eventid>
      <gdacs:episodeid>1</gdacs:episodeid>
      <gdacs:alertlevel>Green</gdacs:alertlevel>
      <gdacs:severity>Magnitude 4.8M</gdacs:severity>
      <geo:lat>51.8743</geo:lat>
      <geo:long>159.7552</geo:long>
    </item>
  </channel>
</rss>`;

describe("/api/gdacs route", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("normalizes GDACS XML into disaster alerts", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(SAMPLE_GDACS_XML, {
          status: 200,
          headers: {
            etag: '"gdacs-1"',
            "last-modified": "Mon, 02 Mar 2026 05:16:12 GMT",
            "content-type": "application/xml",
          },
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);

    const { GET } = await import("../route");
    const response = await GET();
    const payload = await response.json();

    expect(payload.status).toBe("live");
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      source: "gdacs",
      eventType: "eq",
      alertLevel: "Green",
      severityValue: 4.8,
    });
  });

  it("uses conditional headers after cache expires and upstream returns 304", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(SAMPLE_GDACS_XML, {
          status: 200,
          headers: {
            etag: '"gdacs-2"',
            "last-modified": "Mon, 02 Mar 2026 05:16:12 GMT",
            "content-type": "application/xml",
          },
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    vi.stubGlobal("fetch", fetchMock);

    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1_000_000);

    const { GET } = await import("../route");
    await GET();

    now.mockReturnValue(1_000_000 + 6 * 60_000 + 1);
    const response = await GET();
    const payload = await response.json();

    expect(payload.status).toBe("live");
    const secondCallInit = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
    const headers = (secondCallInit?.headers ?? {}) as Record<string, string>;
    expect(headers["If-None-Match"]).toBe('"gdacs-2"');
  });

  it("returns degraded stale cache when upstream fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(SAMPLE_GDACS_XML, {
          status: 200,
          headers: {
            etag: '"gdacs-3"',
            "last-modified": "Mon, 02 Mar 2026 05:16:12 GMT",
            "content-type": "application/xml",
          },
        })
      )
      .mockRejectedValueOnce(new Error("upstream down"));
    vi.stubGlobal("fetch", fetchMock);

    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1_000_000);

    const { GET } = await import("../route");
    await GET();

    now.mockReturnValue(1_000_000 + 6 * 60_000 + 5);
    const response = await GET();
    const payload = await response.json();

    expect(payload.status).toBe("degraded");
    expect(payload.items.length).toBeGreaterThan(0);
  });
});
