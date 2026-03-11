export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { isBlockedHost } from "../../../../../lib/server/ssrf";

const TIMEOUT_MS = 5_000;

/**
 * Proxy JPEG snapshots from IP cameras to bypass CORS and mixed-content
 * restrictions in the browser.
 *
 * Usage: GET /api/cctv/insecam/proxy?url=<encoded camera URL>
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json({ error: "Only HTTP/HTTPS URLs allowed" }, { status: 400 });
  }

  // SSRF protection: block requests to private/internal networks
  if (await isBlockedHost(parsed.hostname)) {
    return NextResponse.json({ error: "Blocked destination" }, { status: 403 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      return NextResponse.json(
        { error: "Upstream request failed" },
        { status: 502 },
      );
    }

    const contentType = resp.headers.get("content-type") ?? "image/jpeg";
    const body = await resp.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=2",
      },
    });
  } catch {
    return NextResponse.json({ error: "Proxy request failed" }, { status: 502 });
  }
}
