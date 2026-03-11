"use client";

import { useSIGINTStore } from "../../store";

export default function DebugOverlay() {
  const debug = useSIGINTStore((s) => s.debug);
  const layers = useSIGINTStore((s) => s.layers);
  const ui = useSIGINTStore((s) => s.ui);

  const enabledLayers = Object.entries(layers)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(", ");

  return (
    <div
      style={{
        position: "absolute",
        top: 100,
        right: 14,
        padding: "8px 12px",
        background: "rgba(0, 4, 8, 0.85)",
        border: "1px solid rgba(0, 255, 100, 0.3)",
        borderRadius: 6,
        fontSize: 10,
        lineHeight: 1.6,
        color: "#69f0ae",
        fontFamily: 'ui-monospace, Menlo, Monaco, Consolas, "Courier New", monospace',
        pointerEvents: "none",
        zIndex: 20,
        minWidth: 180,
      }}
    >
      <div style={{ fontWeight: "bold", marginBottom: 4, color: "#00e676" }}>
        DEBUG
      </div>
      <div>FPS: {debug.fps}</div>
      <div>ENTITIES: {debug.entityCount.toLocaleString()}</div>
      <div>MEM: {debug.memoryMB > 0 ? `${debug.memoryMB}MB` : "N/A"}</div>
      <div style={{ marginTop: 4, borderTop: "1px solid rgba(0,255,100,0.2)", paddingTop: 4 }}>
        PRESET: {ui.stylePreset.toUpperCase()}
      </div>
      <div>DETECT: {ui.detectMode}</div>
      <div style={{ marginTop: 4, borderTop: "1px solid rgba(0,255,100,0.2)", paddingTop: 4, color: "#80d8ff" }}>
        LAYERS: {enabledLayers || "none"}
      </div>
      <div style={{ marginTop: 4, color: "rgba(0,230,118,0.5)", fontSize: 9 }}>
        Press D to hide
      </div>
    </div>
  );
}
