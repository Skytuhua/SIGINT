"use client";

import { useState } from "react";

type Direction = "N" | "S" | "E" | "W";

export interface CameraSnapshot {
  lat: number;
  lon: number;
  altM: number;
  headingDeg: number;
  pitchDeg: number;
}

interface NavigationPanelProps {
  camera: CameraSnapshot | null;
  onHome: () => void;
  onSetHome: () => void;
  onNorthUp: () => void;
  onTopDown: () => void;
  onOblique: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onPan: (dir: Direction) => void;
}

const panel: React.CSSProperties = {
  position: "absolute",
  width: "calc(230px * var(--ui-scale))",
  background: "rgba(0, 8, 18, 0.86)",
  border: "1px solid rgba(180, 210, 240, 0.14)",
  borderRadius: 10,
  padding: "calc(10px * var(--ui-scale)) calc(12px * var(--ui-scale))",
  fontFamily: 'ui-monospace, Menlo, Monaco, Consolas, "Courier New", monospace',
  fontSize: "calc(10px * var(--ui-scale))",
  color: "#8ab0cc",
  backdropFilter: "blur(10px)",
  zIndex: 12,
  pointerEvents: "auto",
};

function NavBtn({
  label,
  onClick,
  emphasis = false,
}: {
  label: string;
  onClick: () => void;
  emphasis?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 28,
        padding: "4px 8px",
        background: emphasis ? "rgba(79, 195, 247, 0.2)" : "transparent",
        border: emphasis
          ? "1px solid rgba(79, 195, 247, 0.55)"
          : "1px solid rgba(180,210,240,0.2)",
        borderRadius: 4,
        color: emphasis ? "#4fc3f7" : "#7ea6c2",
        fontSize: 10,
        letterSpacing: 0.4,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}

export default function NavigationPanel({
  camera,
  onHome,
  onSetHome,
  onNorthUp,
  onTopDown,
  onOblique,
  onZoomIn,
  onZoomOut,
  onPan,
}: NavigationPanelProps) {
  const [status, setStatus] = useState("");

  return (
    <div className="navigation-panel" style={panel}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <div style={{ color: "#cde6f8", fontSize: 11, letterSpacing: 1 }}>NAV</div>
        <div style={{ color: "#5f8aa8", fontSize: 9 }}>H/N/T/O + Arrows</div>
      </div>

      {camera && (
        <div
          style={{
            padding: "6px 8px",
            border: "1px solid rgba(180,210,240,0.12)",
            borderRadius: 6,
            background: "rgba(255,255,255,0.02)",
            lineHeight: 1.4,
            marginBottom: 8,
          }}
        >
          <div style={{ color: "#9bc0d8" }}>
            LAT {camera.lat.toFixed(3)} | LON {camera.lon.toFixed(3)}
          </div>
          <div style={{ color: "#7ea6c2" }}>
            ALT {camera.altM.toFixed(0)}m | HDG {camera.headingDeg.toFixed(0)}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
        <NavBtn
          label="HOME"
          emphasis
          onClick={() => {
            onHome();
            setStatus("Home view");
          }}
        />
        <NavBtn
          label="SET HOME"
          onClick={() => {
            onSetHome();
            setStatus("Home updated");
          }}
        />
        <NavBtn label="NORTH" onClick={onNorthUp} />
        <NavBtn label="TOP" onClick={onTopDown} />
        <NavBtn label="OBLIQUE" onClick={onOblique} />
        <NavBtn label="+" emphasis onClick={onZoomIn} />
      </div>

      <div
        style={{
          marginTop: 8,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 5,
        }}
      >
        <div />
        <NavBtn label="N" onClick={() => onPan("N")} />
        <NavBtn label="-" onClick={onZoomOut} />
        <NavBtn label="W" onClick={() => onPan("W")} />
        <NavBtn label="S" onClick={() => onPan("S")} />
        <NavBtn label="E" onClick={() => onPan("E")} />
      </div>

      {!!status && (
        <div style={{ marginTop: 8, color: "#4fc3f7", fontSize: 9 }}>
          {status}
        </div>
      )}
    </div>
  );
}

