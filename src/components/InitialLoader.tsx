"use client";

import { useEffect, useRef, useState } from "react";
import {
  subscribeToPreload,
  type SubsystemId,
  type SubsystemMap,
  type SubsystemStatus,
} from "../lib/preload/index";

interface Props {
  onDone: () => void;
}

const STATUS_COLOR: Record<SubsystemStatus, string> = {
  loading: "#f4a261",
  ready: "#4caf50",
  partial: "#ffb74d",
  offline: "#78909c",
  failed: "#e57373",
};

const STATUS_GLYPH: Record<SubsystemStatus, string> = {
  loading: "◌",
  ready: "●",
  partial: "◑",
  offline: "○",
  failed: "✕",
};

const STATUS_LABEL: Record<SubsystemStatus, string> = {
  loading: "LOADING",
  ready: "READY",
  partial: "PARTIAL",
  offline: "OFFLINE",
  failed: "FAILED",
};

const SUBSYSTEM_ORDER: SubsystemId[] = [
  "news",
  "map",
  "globe",
  "layers",
  "country-detail",
  "search",
];

function makeInitialStates(): SubsystemMap {
  const labels: Record<SubsystemId, string> = {
    news: "News Feed",
    map: "Map Assets",
    globe: "Globe",
    layers: "Intelligence Layers",
    "country-detail": "Country Detail",
    search: "Search Index",
  };
  return Object.fromEntries(
    SUBSYSTEM_ORDER.map((id) => [id, { id, label: labels[id], status: "loading" as SubsystemStatus }])
  ) as SubsystemMap;
}

export default function InitialLoader({ onDone }: Props) {
  const [subsystems, setSubsystems] = useState<SubsystemMap>(makeInitialStates);
  const [phase, setPhase] = useState<"loading" | "complete">("loading");
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    // Subscribe to live updates from the module-level singleton.
    // subscribeToPreload fires the listener immediately with the current snapshot.
    const unsub = subscribeToPreload((snapshot) => setSubsystems(snapshot));
    return unsub;
  }, []);

  useEffect(() => {
    // Wait for the module-level preload singleton to finish, then transition.
    let timer: ReturnType<typeof setTimeout>;
    import("../lib/preload/index").then(({ preloadComplete }) => {
      preloadComplete().then(() => {
        setPhase("complete");
        timer = setTimeout(() => onDoneRef.current(), 400);
      });
    });
    return () => clearTimeout(timer);
  }, []);

  const resolvedCount = SUBSYSTEM_ORDER.filter(
    (id) => subsystems[id].status !== "loading"
  ).length;
  const progressPct = Math.round((resolvedCount / SUBSYSTEM_ORDER.length) * 100);

  const isComplete = phase === "complete";

  return (
    <div
      style={{
        width: "100%",
        height: "100dvh",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0b131b",
        color: "#d7e2ee",
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace',
        flexDirection: "column",
        gap: 0,
        userSelect: "none",
      }}
    >
      {/* Title */}
      <div
        style={{
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: 4,
          marginBottom: 20,
          color: "#8fb8d8",
        }}
      >
        SIGINT CONSOLE
      </div>

      {/* Status panel */}
      <div
        style={{
          border: "1px solid #1e3a5f",
          minWidth: "min(360px, 90vw)",
          background: "#0d1b2a",
        }}
      >
        {/* Panel header */}
        <div
          style={{
            padding: "5px 16px",
            borderBottom: "1px solid #1e3a5f",
            fontSize: 10,
            letterSpacing: 2,
            color: "#4a7aaa",
          }}
        >
          SYSTEM INITIALIZATION
        </div>

        {/* Subsystem rows */}
        {SUBSYSTEM_ORDER.map((id) => {
          const sub = subsystems[id];
          const color = STATUS_COLOR[sub.status];
          const glyph = STATUS_GLYPH[sub.status];
          const label = STATUS_LABEL[sub.status];
          const isLoading = sub.status === "loading";

          return (
            <div
              key={id}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "5px 16px",
                borderBottom: "1px solid #0f1e2e",
                fontSize: 11,
                gap: 8,
              }}
            >
              <span
                style={{
                  flex: 1,
                  color: "#7a9fbe",
                  letterSpacing: 1,
                }}
              >
                {sub.label.toUpperCase()}
              </span>
              <span
                style={{
                  color,
                  letterSpacing: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  minWidth: 90,
                  justifyContent: "flex-end",
                  animation: isLoading
                    ? "si-init-pulse 1.2s ease-in-out infinite"
                    : undefined,
                }}
              >
                {glyph}&nbsp;{label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div
        style={{
          marginTop: 14,
          minWidth: "min(360px, 90vw)",
          height: 2,
          background: "#111e2e",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${isComplete ? 100 : progressPct}%`,
            background: isComplete ? "#4caf50" : "#3a6ea8",
            transition: "width 0.35s ease, background 0.3s ease",
          }}
        />
      </div>

      {/* Footer text */}
      <div
        style={{
          marginTop: 12,
          opacity: 0.45,
          fontSize: 10,
          letterSpacing: 2,
        }}
      >
        {isComplete ? "ALL SYSTEMS READY — LAUNCHING" : "INITIALIZING DASHBOARD..."}
      </div>

      {/* Keyframe for loading pulse */}
      <style>{`
        @keyframes si-init-pulse {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
