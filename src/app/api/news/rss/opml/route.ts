import { NextRequest, NextResponse } from "next/server";
import { STANDARD_LIMITER } from "../../../../../lib/server/rateLimitPresets";
import { withRateLimit } from "../../../../../lib/server/withRateLimit";

export const dynamic = "force-dynamic";

interface OPMLFeed {
  title: string;
  url: string;
  category?: string;
  htmlUrl?: string;
}

async function handler(request: NextRequest) {
  try {
    const body = await request.text();
    if (!body || !body.includes("<opml") && !body.includes("<outline")) {
      return NextResponse.json(
        { error: "Invalid OPML: body does not appear to be OPML XML." },
        { status: 400 }
      );
    }

    const feeds = parseOPML(body);

    if (feeds.length === 0) {
      return NextResponse.json(
        { error: "No valid feeds found in OPML.", feeds: [] },
        { status: 200 }
      );
    }

    return NextResponse.json({ feeds, total: feeds.length });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to parse OPML: ${String(err)}` },
      { status: 400 }
    );
  }
}

function parseOPML(xml: string): OPMLFeed[] {
  const feeds: OPMLFeed[] = [];
  const outlineRegex = /<outline\b([^>]*)\/?>(?:<\/outline>)?/gi;
  let match: RegExpExecArray | null;

  while ((match = outlineRegex.exec(xml)) !== null) {
    const attrs = match[1];
    const xmlUrl = extractAttr(attrs, "xmlUrl") || extractAttr(attrs, "xmlurl");
    if (!xmlUrl) continue;

    try {
      const parsed = new URL(xmlUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    } catch {
      continue;
    }

    const title =
      extractAttr(attrs, "title") ||
      extractAttr(attrs, "text") ||
      xmlUrl;
    const category = extractAttr(attrs, "category") || inferCategory(xml, match.index) || undefined;
    const htmlUrl = extractAttr(attrs, "htmlUrl") || extractAttr(attrs, "htmlurl") || undefined;

    feeds.push({ title, url: xmlUrl, category, htmlUrl });
  }

  return feeds;
}

function extractAttr(attrs: string, name: string): string | null {
  const regex = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i");
  const match = regex.exec(attrs);
  return match ? decodeEntities(match[1]) : null;
}

function inferCategory(xml: string, position: number): string | null {
  const before = xml.slice(Math.max(0, position - 500), position);
  const parentOutline = /<outline\b[^>]*text\s*=\s*"([^"]*)"[^>]*>/gi;
  let lastParentTitle: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = parentOutline.exec(before)) !== null) {
    if (!m[0].includes("xmlUrl") && !m[0].includes("xmlurl")) {
      lastParentTitle = m[1];
    }
  }
  return lastParentTitle;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

export const POST = withRateLimit(STANDARD_LIMITER, handler);
