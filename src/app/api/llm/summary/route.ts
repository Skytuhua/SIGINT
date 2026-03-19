export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { generateHostedSummary, isHostedLlmAvailable } from "../../../../lib/llm/hostedClient";
import { createRateLimiter, getClientIp, rateLimitGuard } from "../../../../lib/server/rateLimit";

const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 10 });

const MAX_SYSTEM_LEN = 2000;
const MAX_USER_LEN = 4000;

export async function POST(req: NextRequest) {
  const blocked = rateLimitGuard(limiter(getClientIp(req)));
  if (blocked) return blocked;

  if (!isHostedLlmAvailable()) {
    return NextResponse.json(
      { error: "Hosted LLM not configured" },
      { status: 503 },
    );
  }

  let body: { system?: string; user?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const system = typeof body.system === "string" ? body.system.slice(0, MAX_SYSTEM_LEN) : "";
  const user = typeof body.user === "string" ? body.user.slice(0, MAX_USER_LEN) : "";

  if (!system || !user) {
    return NextResponse.json(
      { error: "Both 'system' and 'user' fields are required" },
      { status: 400 },
    );
  }

  try {
    const text = await generateHostedSummary({ system, user });
    return NextResponse.json({ text });
  } catch (err) {
    console.error("[api/llm/summary] generation error:", err);
    return NextResponse.json(
      { error: "LLM generation failed" },
      { status: 502 },
    );
  }
}
