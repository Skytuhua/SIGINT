export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { withPublicHttpResponse } from "../../../../../lib/server/ssrf";
import { readResponseBytes, requestDeadline } from "../../../../../lib/server/fetchWithTimeout";
import { STRICT_LIMITER } from "../../../../../lib/server/rateLimitPresets";
import { withRateLimit } from "../../../../../lib/server/withRateLimit";

const TIMEOUT_MS = 8_000;
const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Proxy JPEG snapshots from IP cameras to bypass CORS and mixed-content
 * restrictions in the browser.
 *
 * Usage: GET /api/cctv/insecam/proxy?url=<encoded camera URL>
 */
async function handler(req: Request) {
  const url = new URL(req.url).searchParams.get("url");
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

  try {
    const signal = requestDeadline(TIMEOUT_MS, req.signal);
    return await withPublicHttpResponse(parsed.toString(), {
      signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    }, async (resp) => {

      // Reject redirects — camera snapshots should serve images directly.
      // Following redirects opens SSRF bypass vectors (DNS rebinding).
      if (resp.status >= 300 && resp.status < 400) {
        return NextResponse.json(
          { error: "Redirects not allowed" },
          { status: 403 },
        );
      }

      if (!resp.ok) {
        return NextResponse.json(
          { error: "Upstream request failed" },
          { status: 502 },
        );
      }

      const contentType = (resp.headers.get("content-type") ?? "")
        .split(";", 1)[0].trim().toLowerCase();

      // Snapshots must declare a supported raster type; do not relay active SVG
      // documents or guess a type for unlabelled responses.
      if (!["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif", "image/apng"].includes(contentType)) {
        return NextResponse.json(
          { error: "Non-image response from upstream" },
          { status: 502 },
        );
      }

      // Reject oversized responses before reading the full body
      const contentLength = resp.headers.get("content-length");
      if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
        return NextResponse.json(
          { error: "Response too large" },
          { status: 502 },
        );
      }

      const body = await readResponseBytes(resp, MAX_BODY_BYTES, signal);

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
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Blocked destination") {
      return NextResponse.json({ error: "Blocked destination" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "Response too large") {
      return NextResponse.json({ error: "Response too large" }, { status: 502 });
    }
    return NextResponse.json({ error: "Proxy request failed" }, { status: 502 });
  }
}

export const GET = withRateLimit(STRICT_LIMITER, handler);
