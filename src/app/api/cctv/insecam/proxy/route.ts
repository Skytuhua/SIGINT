export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { isBlockedHost } from "../../../../../lib/server/ssrf";

const TIMEOUT_MS = 8_000;

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
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
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

    // Reject non-image responses (HTML error pages, redirects, etc.)
    if (contentType.startsWith("text/") || contentType.includes("html")) {
      return NextResponse.json(
        { error: "Non-image response from upstream" },
        { status: 502 },
      );
    }

    const body = await resp.arrayBuffer();

    // Reject empty responses
    if (body.byteLength === 0) {
      return NextResponse.json(
        { error: "Empty response from upstream" },
        { status: 502 },
      );
    }

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=5",
      },
    });
  } catch {
    return NextResponse.json({ error: "Proxy request failed" }, { status: 502 });
  }
}
