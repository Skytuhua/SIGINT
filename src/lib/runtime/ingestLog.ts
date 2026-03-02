export interface IngestLogEvent {
  source: string;
  taskKey: string;
  phase: "start" | "success" | "error";
  durationMs?: number;
  itemCount?: number;
  cacheHit?: boolean;
  status?: "live" | "cached" | "degraded" | "unavailable";
  errorCode?: string | null;
  retryCount?: number;
}

export function logIngestEvent(event: IngestLogEvent): void {
  const payload = {
    at: Date.now(),
    ...event,
  };
  // Structured line for lightweight observability.
  if (event.phase === "error") {
    console.warn("[ingest]", payload);
    return;
  }
  console.info("[ingest]", payload);
}
