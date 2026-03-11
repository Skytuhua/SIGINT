"use client";

import { useSIGINTStore } from "../../store";

const panel: React.CSSProperties = {
  position: "absolute",
  top: 300,
  right: 18,
  width: "min(286px, calc(100vw - 24px))",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  zIndex: 12,
  color: "#aac1d4",
  fontFamily:
    'var(--font-tech-mono), ui-monospace, Menlo, Monaco, Consolas, "Courier New", monospace',
  pointerEvents: "auto",
};

const card: React.CSSProperties = {
  background: "rgba(7, 11, 18, 0.8)",
  border: "1px solid rgba(107, 130, 154, 0.28)",
  borderRadius: 12,
  padding: "10px 12px",
  backdropFilter: "blur(10px)",
};

function RailButton({
  label,
  active,
  onClick,
  accent = "#23d6ff",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  accent?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        height: 40,
        borderRadius: 10,
        border: active
          ? `1px solid ${accent}`
          : "1px solid rgba(98,118,139,0.34)",
        background: active ? "rgba(14, 37, 54, 0.82)" : "rgba(9, 13, 20, 0.86)",
        color: active ? "#9ceeff" : "#7a8ea5",
        letterSpacing: 2,
        textTransform: "uppercase",
        fontSize: 12,
        fontFamily: "inherit",
        cursor: "pointer",
        textAlign: "left",
        padding: "0 12px",
      }}
    >
      {label}
    </button>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 4,
          fontSize: 12,
          color: "#7e95ab",
        }}
      >
        <span>{label}</span>
        <span style={{ color: "#74e4ff" }}>{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%" }}
      />
    </div>
  );
}

export default function RightPanel() {
  const ui = useSIGINTStore((s) => s.ui);
  const setUi = useSIGINTStore((s) => s.setUi);
  const setDetectMode = useSIGINTStore((s) => s.setDetectMode);

  return (
    <div style={panel}>
      <div style={{ ...card, padding: "8px 10px" }}>
        <button
          style={{
            width: "100%",
            height: 30,
            borderRadius: 8,
            border: "1px solid rgba(98,118,139,0.34)",
            background: "rgba(9, 13, 20, 0.9)",
            color: "#607b92",
            letterSpacing: 2,
            textTransform: "uppercase",
            textAlign: "left",
            padding: "0 12px",
            fontFamily: "inherit",
            fontSize: 11,
            cursor: "default",
          }}
        >
          Move
        </button>
      </div>

      <RailButton
        label="* Bloom"
        active={ui.showBloom}
        onClick={() => setUi({ showBloom: !ui.showBloom })}
        accent="#dbac5c"
      />
      <RailButton
        label="* Sharpen"
        active={ui.sharpen}
        onClick={() => setUi({ sharpen: !ui.sharpen })}
      />
      <RailButton
        label="* HUD"
        active={ui.showDebug}
        onClick={() => setUi({ showDebug: !ui.showDebug })}
      />

      <div style={card}>
        <div style={{ color: "#6b7e91", fontSize: 11, letterSpacing: 2, marginBottom: 6 }}>
          LAYOUT
        </div>
        <select
          value="Tactical"
          onChange={() => {}}
          style={{
            width: "100%",
            height: 36,
            borderRadius: 8,
            border: "1px solid rgba(98,118,139,0.34)",
            background: "rgba(9, 13, 20, 0.86)",
            color: "#c7d5e4",
            padding: "0 10px",
            fontFamily: "inherit",
            fontSize: 12,
            letterSpacing: 1,
          }}
        >
          <option>Tactical</option>
        </select>
      </div>

      <div style={card}>
        <div style={{ color: "#6b7e91", fontSize: 11, letterSpacing: 2, marginBottom: 8 }}>
          DETECT
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          {(["off", "sparse", "full"] as const).map((mode) => {
            const active = ui.detectMode === mode;
            return (
              <button
                key={mode}
                onClick={() => setDetectMode(mode)}
                style={{
                  height: 34,
                  borderRadius: 8,
                  border: active
                    ? "1px solid rgba(67, 255, 146, 0.65)"
                    : "1px solid rgba(98,118,139,0.34)",
                  background: active
                    ? "linear-gradient(90deg, rgba(24, 96, 38, 0.85), rgba(18, 47, 28, 0.8))"
                    : "rgba(9, 13, 20, 0.86)",
                  color: active ? "#8dfdbd" : "#6f879f",
                  textTransform: "uppercase",
                  fontFamily: "inherit",
                  letterSpacing: 1,
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                {mode}
              </button>
            );
          })}
        </div>
      </div>

      <RailButton
        label="Clean UI"
        active={ui.cleanMode}
        onClick={() => setUi({ cleanMode: !ui.cleanMode })}
      />

      <div style={card}>
        <div style={{ color: "#6b7e91", fontSize: 11, letterSpacing: 2, marginBottom: 8 }}>
          PARAMETERS
        </div>

        {ui.stylePreset === "crt" && (
          <>
            <Slider
              label="Pixelation"
              value={ui.crtDistortion}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => setUi({ crtDistortion: v })}
            />
            <Slider
              label="Distortion"
              value={ui.crtDistortion}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => setUi({ crtDistortion: v })}
            />
            <Slider
              label="Instability"
              value={ui.crtInstability}
              min={0}
              max={0.3}
              step={0.01}
              onChange={(v) => setUi({ crtInstability: v })}
            />
          </>
        )}

        {ui.stylePreset === "nvg" && (
          <Slider
            label="Brightness"
            value={Math.min(3, Math.max(0.5, ui.nvgBrightness)) / 3}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setUi({ nvgBrightness: 0.5 + v * 2.5 })}
          />
        )}

        {ui.stylePreset === "flir" && (
          <Slider
            label="Contrast"
            value={Math.min(3, Math.max(0.5, ui.flirContrast)) / 3}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setUi({ flirContrast: 0.5 + v * 2.5 })}
          />
        )}

        {ui.stylePreset === "normal" && (
          <Slider
            label="Density"
            value={ui.showBloom ? 0.9 : 0.58}
            min={0}
            max={1}
            step={0.01}
            onChange={() => {}}
          />
        )}
      </div>
    </div>
  );
}
