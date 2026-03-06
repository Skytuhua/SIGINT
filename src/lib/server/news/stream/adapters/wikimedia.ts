import type { StreamItem } from "../../../../news/stream/types";

const WM_STREAM_URL = "https://stream.wikimedia.org/v2/stream/recentchange";
const ENABLED = process.env.NEWS_WIKIMEDIA_STREAM_ENABLED === "true";

let sseConnection: { close: () => void } | null = null;
let buffer: StreamItem[] = [];
const MAX_BUFFER = 200;
let itemSeq = 0;

interface WikiRecentChange {
  id: number;
  type: string;
  title: string;
  namespace: number;
  comment: string;
  timestamp: number;
  user: string;
  bot: boolean;
  server_name: string;
  wiki: string;
  meta: { uri: string; domain: string };
  length?: { new: number; old: number };
}

function isSignificantEdit(change: WikiRecentChange): boolean {
  if (change.bot) return false;
  if (change.namespace !== 0) return false;
  if (change.type !== "edit") return false;
  const sizeDelta = (change.length?.new ?? 0) - (change.length?.old ?? 0);
  return Math.abs(sizeDelta) > 500;
}

function changeToStreamItem(change: WikiRecentChange): StreamItem {
  itemSeq++;
  return {
    id: `wm-${change.id}-${itemSeq}`,
    timestamp: change.timestamp * 1000,
    sourceName: `Wikipedia (${change.wiki})`,
    sourceUrl: change.meta?.uri || `https://${change.server_name}/wiki/${encodeURIComponent(change.title)}`,
    sourceDomain: change.server_name || "wikipedia.org",
    category: "events",
    tags: ["signal", "wiki-edit", change.wiki],
    headline: `Wiki edit: ${change.title}`,
    summary: change.comment ? change.comment.slice(0, 200) : undefined,
    entities: [{ name: change.title, type: "topic" }],
    tickers: [],
    confidence: 30,
    importance: 0,
    duplicateCount: 1,
    sources: ["Wikimedia"],
    backendSource: "wikimedia",
    language: change.wiki?.replace("wiki", "") || "en",
  };
}

export function startWikimediaStream(onItems: (items: StreamItem[]) => void): { close: () => void } | null {
  if (!ENABLED) return null;
  if (sseConnection) return sseConnection;

  let eventSource: EventSource | null = null;

  try {
    if (typeof globalThis.EventSource !== "undefined") {
      eventSource = new EventSource(WM_STREAM_URL);
    } else {
      return null;
    }
  } catch {
    return null;
  }

  const batchInterval = setInterval(() => {
    if (buffer.length > 0) {
      onItems([...buffer]);
      buffer = [];
    }
  }, 5_000);

  eventSource.onmessage = (event) => {
    try {
      const data: WikiRecentChange = JSON.parse(event.data);
      if (isSignificantEdit(data)) {
        buffer.push(changeToStreamItem(data));
        if (buffer.length > MAX_BUFFER) buffer.shift();
      }
    } catch { /* ignore parse errors */ }
  };

  eventSource.onerror = () => {
    // SSE will auto-reconnect
  };

  sseConnection = {
    close() {
      clearInterval(batchInterval);
      eventSource?.close();
      sseConnection = null;
      buffer = [];
    },
  };

  return sseConnection;
}

/**
 * For environments without native EventSource (Node.js), use polling fallback.
 */
export async function pollWikimediaFallback(): Promise<{ items: StreamItem[]; healthUpdate: { ok: boolean; count: number; error?: string } }> {
  if (!ENABLED) return { items: [], healthUpdate: { ok: true, count: 0 } };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    const res = await fetch(WM_STREAM_URL, {
      signal: controller.signal,
      headers: { Accept: "text/event-stream" },
    });
    clearTimeout(timeout);

    if (!res.ok || !res.body) {
      return { items: [], healthUpdate: { ok: false, count: 0, error: `WM ${res.status}` } };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const items: StreamItem[] = [];
    const deadline = Date.now() + 5_000;

    let partial = "";
    while (Date.now() < deadline && items.length < 50) {
      const { value, done } = await reader.read();
      if (done) break;
      partial += decoder.decode(value, { stream: true });
      const lines = partial.split("\n");
      partial = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data: WikiRecentChange = JSON.parse(line.slice(6));
          if (isSignificantEdit(data)) {
            items.push(changeToStreamItem(data));
          }
        } catch { /* skip */ }
      }
    }
    reader.cancel().catch(() => {});

    return {
      items,
      healthUpdate: { ok: true, count: items.length },
    };
  } catch (err) {
    return {
      items: [],
      healthUpdate: { ok: false, count: 0, error: String(err) },
    };
  }
}
