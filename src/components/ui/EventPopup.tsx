"use client";

import { useWorldViewStore } from "../../store";
import type { WorldEvent } from "../../lib/events/schema";

function whyThisIsHere(e: WorldEvent): string {
  switch (e.type) {
    case "earthquake":
      return `Mag ${e.severity?.toFixed(1) ?? "?"} earthquake. ${e.summary ?? ""}`;
    case "weather-alert":
      return e.headline;
    case "natural-event":
      return `${e.subtype ?? "Event"}: ${e.headline}`;
    case "conflict-zones":
    case "armed-conflict":
    case "protests":
      return `GDELT topic signal — ${e.summary ?? e.headline}`;
    case "faa-status":
      return e.summary ?? "Airport status update";
    default:
      return e.summary ?? e.headline;
  }
}

function severityBadge(sev?: number): string {
  if (sev == null) return "";
  if (sev >= 4) return "CRITICAL";
  if (sev >= 3) return "HIGH";
  if (sev >= 2) return "MODERATE";
  if (sev >= 1) return "LOW";
  return "INFO";
}

function severityColor(sev?: number): string {
  if (sev == null) return "#6e849d";
  if (sev >= 4) return "#ff5a5f";
  if (sev >= 3) return "#ff9800";
  if (sev >= 2) return "#f4d03f";
  if (sev >= 1) return "#7ddf64";
  return "#6e849d";
}

function formatRange(start: number, end?: number): string {
  const fmt = (ts: number) => {
    const d = new Date(ts);
    return d.toISOString().replace("T", " ").replace(/\.\d+Z/, "Z");
  };
  if (end) return `${fmt(start)} → ${fmt(end)}`;
  return fmt(start);
}

const popupShell: React.CSSProperties = {
  position: "fixed",
  bottom: 20,
  right: 20,
  width: 380,
  maxWidth: "calc(100vw - 40px)",
  background: "rgba(8, 12, 20, 0.92)",
  border: "1px solid rgba(110, 130, 155, 0.35)",
  borderRadius: 12,
  backdropFilter: "blur(12px)",
  zIndex: 60,
  fontFamily:
    'var(--font-tech-mono), ui-monospace, Menlo, Monaco, Consolas, "Courier New", monospace',
  color: "#b9cde0",
  padding: 0,
  overflow: "hidden",
  boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
};

export default function EventPopup() {
  const event = useWorldViewStore((s) => s.activePopup);
  const dismiss = useWorldViewStore((s) => s.setActivePopup);

  if (!event) return null;

  const sev = event.severity;
  const badge = severityBadge(sev);
  const color = severityColor(sev);

  return (
    <div style={popupShell}>
      {/* Header */}
      <div
        style={{
          padding: "10px 14px 8px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          borderBottom: "1px solid rgba(80,100,125,0.25)",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              color: "#e8f1fa",
              fontWeight: 600,
              lineHeight: 1.3,
              wordBreak: "break-word",
            }}
          >
            {event.headline}
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 10,
              color: "#5f7488",
              letterSpacing: 1,
            }}
          >
            {formatRange(event.startTime, event.endTime)}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0, marginLeft: 8 }}>
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 6,
              border: `1px solid ${event.sourceName === "USGS" ? "#f4b05a" : event.sourceName === "NWS" ? "#8da3b8" : event.sourceName === "FAA" ? "#ff9800" : "#5c8cb5"}55`,
              fontSize: 9,
              color: "#9bb8d0",
              letterSpacing: 1.5,
              textTransform: "uppercase",
            }}
          >
            {event.sourceName}
          </span>
          <button
            onClick={() => dismiss(null)}
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              border: "1px solid rgba(95,110,129,0.3)",
              background: "transparent",
              color: "#6e849d",
              fontSize: 14,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "inherit",
            }}
          >
            ×
          </button>
        </div>
      </div>

      {/* Severity */}
      {badge && (
        <div
          style={{
            padding: "4px 14px",
            fontSize: 10,
            color,
            letterSpacing: 2,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>{badge}</span>
          {sev != null && <span>SEV {sev.toFixed(1)}</span>}
        </div>
      )}

      {/* Why this is here */}
      <div
        style={{
          padding: "8px 14px",
          fontSize: 11,
          color: "#8da3b8",
          lineHeight: 1.5,
          borderTop: "1px solid rgba(80,100,125,0.15)",
        }}
      >
        <span style={{ color: "#6e849d", letterSpacing: 1.5, fontSize: 9, textTransform: "uppercase" }}>
          Why this is here
        </span>
        <div style={{ marginTop: 3 }}>{whyThisIsHere(event)}</div>
      </div>

      {/* Coordinates */}
      <div
        style={{
          padding: "4px 14px 6px",
          fontSize: 10,
          color: "#5f7488",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>
          {event.lat.toFixed(4)}°{event.lat >= 0 ? "N" : "S"},{" "}
          {Math.abs(event.lon).toFixed(4)}°{event.lon >= 0 ? "E" : "W"}
        </span>
        <span>{event.type.replace(/-/g, " ").toUpperCase()}</span>
      </div>

      {/* Source link */}
      {event.sourceUrl && (
        <div
          style={{
            padding: "6px 14px 10px",
            borderTop: "1px solid rgba(80,100,125,0.15)",
          }}
        >
          <a
            href={event.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "#20d2ff",
              fontSize: 10,
              letterSpacing: 1,
              textDecoration: "none",
            }}
          >
            OPEN SOURCE ↗
          </a>
        </div>
      )}
    </div>
  );
}
