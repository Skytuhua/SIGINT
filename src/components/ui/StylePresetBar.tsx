"use client";

import { useMemo } from "react";
import { useWorldViewStore } from "../../store";

type Preset = "normal" | "crt" | "nvg" | "flir";

const presets: { value: Preset; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "crt", label: "CRT" },
  { value: "nvg", label: "NVG" },
  { value: "flir", label: "FLIR" },
];

const card: React.CSSProperties = {
  minWidth: 250,
  maxWidth: 350,
  borderRadius: 16,
  border: "1px solid rgba(109, 128, 149, 0.28)",
  background: "rgba(11, 16, 26, 0.82)",
  backdropFilter: "blur(10px)",
  padding: "10px 12px",
  color: "#99b2c8",
};

export default function StylePresetBar() {
  const stylePreset = useWorldViewStore((s) => s.ui.stylePreset);
  const setStylePreset = useWorldViewStore((s) => s.setStylePreset);
  const scenes = useWorldViewStore((s) => s.scenes);
  const currentSceneIdx = useWorldViewStore((s) => s.currentSceneIdx);

  const sceneLabel = useMemo(() => {
    const scene = scenes[currentSceneIdx];
    if (!scene) return "Location: --";
    return scene.city ? `${scene.city}` : scene.name;
  }, [currentSceneIdx, scenes]);

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: 16,
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        alignItems: "center",
        zIndex: 12,
        fontFamily:
          'var(--font-tech-mono), ui-monospace, Menlo, Monaco, Consolas, "Courier New", monospace',
        pointerEvents: "auto",
      }}
    >
      <div style={card}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            color: "#617b92",
            letterSpacing: 3,
            fontSize: 10,
            textTransform: "uppercase",
          }}
        >
          <span>Locations</span>
          <span
            style={{
              width: 24,
              height: 24,
              borderRadius: 8,
              border: "1px solid rgba(104,125,149,0.32)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#7f97ad",
            }}
          >
            +
          </span>
        </div>
        <div style={{ marginTop: 8, color: "#b7c8d8", fontSize: 16 }}>{sceneLabel}</div>
      </div>

      <div style={card}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            color: "#617b92",
            letterSpacing: 3,
            fontSize: 10,
            textTransform: "uppercase",
          }}
        >
          <span>Style Presets</span>
          <span
            style={{
              width: 24,
              height: 24,
              borderRadius: 8,
              border: "1px solid rgba(104,125,149,0.32)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#7f97ad",
            }}
          >
            +
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 10 }}>
          {presets.map((preset) => {
            const active = stylePreset === preset.value;
            return (
              <button
                key={preset.value}
                onClick={() => setStylePreset(preset.value)}
                style={{
                  height: 32,
                  borderRadius: 8,
                  border: active
                    ? "1px solid rgba(34,212,255,0.62)"
                    : "1px solid rgba(104,125,149,0.32)",
                  background: active ? "rgba(11, 44, 65, 0.72)" : "rgba(9, 14, 22, 0.82)",
                  color: active ? "#9de8ff" : "#70899f",
                  fontSize: 11,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  fontFamily: "inherit",
                  cursor: "pointer",
                }}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
