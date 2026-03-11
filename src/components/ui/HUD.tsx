"use client";

import { useEffect, useState } from "react";
import { useSIGINTStore } from "../../store";

export default function HUD() {
  const fps = useSIGINTStore((s) => s.debug.fps);
  const entityCount = useSIGINTStore((s) => s.debug.entityCount);
  const stylePreset = useSIGINTStore((s) => s.ui.stylePreset);
  const [utc, setUtc] = useState("");
  const [recVisible, setRecVisible] = useState(true);

  useEffect(() => {
    const update = () =>
      setUtc(new Date().toISOString().replace("T", " ").slice(0, 19) + "Z");
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setRecVisible((v) => !v), 700);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <div
        style={{
          position: "absolute",
          top: 14,
          left: 18,
          color: "#cf8a3d",
          letterSpacing: 2,
          fontSize: 11,
          zIndex: 13,
          pointerEvents: "none",
          fontFamily:
            'var(--font-tech-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace',
        }}
      >
        OPTIC  VIS:{Math.max(1, fps)}  SRC:{entityCount.toLocaleString()}  DENS:1.42  0.2ms
      </div>

      <div
        style={{
          position: "absolute",
          top: 48,
          right: 30,
          color: "#637a90",
          fontSize: 11,
          letterSpacing: 4,
          textTransform: "uppercase",
          zIndex: 13,
          pointerEvents: "none",
          fontFamily:
            'var(--font-tech-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace',
        }}
      >
        Active Style
        <div
          style={{
            color: "#1ad7ff",
            fontSize: 34,
            marginTop: 6,
            letterSpacing: 5,
            textAlign: "right",
          }}
        >
          {stylePreset.toUpperCase()}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 185,
          right: 30,
          zIndex: 13,
          pointerEvents: "none",
          fontFamily:
            'var(--font-tech-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace',
          color: "#c68a42",
          letterSpacing: 2,
          textTransform: "uppercase",
          fontSize: 14,
          textAlign: "right",
          lineHeight: 1.8,
        }}
      >
        <div style={{ color: recVisible ? "#f13942" : "rgba(241,57,66,0.35)" }}>* REC {utc}</div>
        <div style={{ color: "#a9773f" }}>ORB: {47000 + (entityCount % 999)} PASS: DESC-{180 + (fps % 130)}</div>
      </div>
    </>
  );
}
