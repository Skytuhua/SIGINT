import { NextRequest } from "next/server";
import { getStreamStore, applyFilters } from "../../../../lib/server/news/stream/store";
import { startScheduler } from "../../../../lib/server/news/stream/scheduler";
import type { StreamFilterParams } from "../../../../lib/news/stream/types";
import type { StreamEvent, SnapshotEvent, StatusEvent, HeartbeatEvent } from "../../../../lib/news/stream/events";
import { STANDARD_LIMITER } from "../../../../lib/server/rateLimitPresets";
import { withRateLimit } from "../../../../lib/server/withRateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_INTERVAL_MS = 15_000;
const STATUS_INTERVAL_MS = 30_000;

function parseFilters(params: URLSearchParams): StreamFilterParams {
  const filters: StreamFilterParams = {};
  const tab = params.get("tab");
  if (tab) filters.tab = tab as StreamFilterParams["tab"];
  const window = params.get("window");
  if (window) filters.timeWindow = window as StreamFilterParams["timeWindow"];
  const minImportance = params.get("minImportance");
  if (minImportance) filters.minImportance = Number(minImportance) || 0;
  const cats = params.get("categories");
  if (cats) filters.categories = cats.split(",").filter(Boolean) as any;
  const allow = params.get("sourceAllowlist");
  if (allow) filters.sourceAllowlist = allow.split(",").filter(Boolean);
  const block = params.get("sourceBlocklist");
  if (block) filters.sourceBlocklist = block.split(",").filter(Boolean);
  const entities = params.get("entityWatchlist");
  if (entities) filters.entityWatchlist = entities.split(",").filter(Boolean);
  const viewportOnly = params.get("viewportOnly");
  if (viewportOnly === "true") filters.viewportOnly = true;
  const bbox = params.get("bbox");
  if (bbox) {
    const parts = bbox.split(",").map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      filters.bbox = { west: parts[0], south: parts[1], east: parts[2], north: parts[3] };
    }
  }
  const q = params.get("q");
  if (q) filters.searchQuery = q;
  return filters;
}

async function handler(request: NextRequest) {
  startScheduler();

  const store = getStreamStore();
  const filters = parseFilters(request.nextUrl.searchParams);

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      function send(event: StreamEvent) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      }

      const snapshot = store.getSnapshot(filters);
      const snapshotEvent: SnapshotEvent = {
        type: "snapshot",
        items: snapshot,
        sourceHealth: store.getSourceHealth(),
        expectedFlowPerMin: store.getExpectedFlowPerMin(),
        serverTime: Date.now(),
      };
      send(snapshotEvent);

      const unsub = store.subscribe((event) => {
        if (closed) return;
        if (event.type === "insert") {
          const filtered = applyFilters(event.items, filters);
          if (filtered.length > 0) send({ ...event, items: filtered });
        } else if (event.type === "update") {
          send(event);
        } else {
          send(event);
        }
      });

      const heartbeatTimer = setInterval(() => {
        if (closed) return;
        const hb: HeartbeatEvent = { type: "heartbeat", serverTime: Date.now() };
        send(hb);
      }, HEARTBEAT_INTERVAL_MS);

      const statusTimer = setInterval(() => {
        if (closed) return;
        const status: StatusEvent = {
          type: "status",
          sourceHealth: store.getSourceHealth(),
          expectedFlowPerMin: store.getExpectedFlowPerMin(),
          serverTime: Date.now(),
        };
        send(status);
      }, STATUS_INTERVAL_MS);

      request.signal.addEventListener("abort", () => {
        closed = true;
        unsub();
        clearInterval(heartbeatTimer);
        clearInterval(statusTimer);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export const GET = withRateLimit(STANDARD_LIMITER, handler);
