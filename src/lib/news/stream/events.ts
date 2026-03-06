import type { StreamItem, SourceHealthEntry } from "./types";

// ---------------------------------------------------------------------------
// SSE event types shared between server (emitter) and client (consumer).
// Every SSE `data:` payload is JSON-encoded as one of these.
// ---------------------------------------------------------------------------

export interface SnapshotEvent {
  type: "snapshot";
  items: StreamItem[];
  sourceHealth: Record<string, SourceHealthEntry>;
  expectedFlowPerMin: number;
  serverTime: number;
}

export interface InsertEvent {
  type: "insert";
  items: StreamItem[];
}

export interface UpdateEvent {
  type: "update";
  items: Array<Pick<StreamItem, "id"> & Partial<StreamItem>>;
}

export interface StatusEvent {
  type: "status";
  sourceHealth: Record<string, SourceHealthEntry>;
  expectedFlowPerMin: number;
  serverTime: number;
}

export interface HeartbeatEvent {
  type: "heartbeat";
  serverTime: number;
}

export type StreamEvent =
  | SnapshotEvent
  | InsertEvent
  | UpdateEvent
  | StatusEvent
  | HeartbeatEvent;
