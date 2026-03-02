"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useWorldViewStore } from "../../store";
import CctvFeedView from "./inspector/CctvFeedView";

const MIN_W = 320;
const MIN_H = 200;
const DEFAULT_W = 420;
const DEFAULT_H = 300;

export default function CctvFloatingPanel() {
  const floating = useWorldViewStore((s) => s.cctv.floating);
  const close = useWorldViewStore((s) => s.closeCctvFloating);
  const markCctvBroken = useWorldViewStore((s) => s.markCctvBroken);

  const [pos, setPos] = useState({ x: 60, y: 60 });
  const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });
  const [minimized, setMinimized] = useState(false);

  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      setPos({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
    };
    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [pos]);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, origW: size.w, origH: size.h };

    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const dw = ev.clientX - resizeRef.current.startX;
      const dh = ev.clientY - resizeRef.current.startY;
      setSize({
        w: Math.max(MIN_W, resizeRef.current.origW + dw),
        h: Math.max(MIN_H, resizeRef.current.origH + dh),
      });
    };
    const onUp = () => {
      resizeRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [size]);

  useEffect(() => {
    if (floating.open) setMinimized(false);
  }, [floating.open, floating.camera?.id]);

  if (!floating.open || !floating.camera) return null;

  const cam = floating.camera;

  return (
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: minimized ? 36 : size.h,
        zIndex: 9999,
        background: "rgba(10, 14, 20, 0.95)",
        border: "1px solid rgba(0, 229, 255, 0.3)",
        borderRadius: 6,
        boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      }}
    >
      {/* Header */}
      <div
        onMouseDown={onDragStart}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 10px",
          background: "rgba(0, 229, 255, 0.08)",
          borderBottom: minimized ? "none" : "1px solid rgba(0, 229, 255, 0.15)",
          cursor: "grab",
          userSelect: "none",
          flexShrink: 0,
        }}
      >
        <span style={{ color: "#00e5ff", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em" }}>
          CCTV / {cam.name}
        </span>
        <span style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={() => setMinimized((v) => !v)}
            style={{
              background: "none",
              border: "none",
              color: "#8aa",
              cursor: "pointer",
              fontSize: 13,
              lineHeight: 1,
              padding: "0 2px",
            }}
            title={minimized ? "Restore" : "Minimize"}
          >
            {minimized ? "\u25A1" : "\u2014"}
          </button>
          <button
            type="button"
            onClick={close}
            style={{
              background: "none",
              border: "none",
              color: "#f55",
              cursor: "pointer",
              fontSize: 13,
              lineHeight: 1,
              padding: "0 2px",
            }}
            title="Close"
          >
            {"\u2715"}
          </button>
        </span>
      </div>

      {/* Body */}
      {!minimized && (
        <div style={{ flex: 1, overflow: "hidden", padding: 8 }}>
          <CctvFeedView
            camera={cam}
            onSnapshotError={markCctvBroken}
            onStreamError={markCctvBroken}
          />
          <div style={{ marginTop: 6, fontSize: 10, color: "#7aa", display: "flex", gap: 12 }}>
            <span>{cam.city}{cam.state ? `, ${cam.state}` : ""}</span>
            <span>{cam.streamFormat ?? "JPEG"}</span>
            <span>{cam.lat.toFixed(3)}, {cam.lon.toFixed(3)}</span>
          </div>
        </div>
      )}

      {/* Resize handle */}
      {!minimized && (
        <div
          onMouseDown={onResizeStart}
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
            width: 16,
            height: 16,
            cursor: "nwse-resize",
            background: "linear-gradient(135deg, transparent 50%, rgba(0,229,255,0.3) 50%)",
            borderRadius: "0 0 6px 0",
          }}
        />
      )}
    </div>
  );
}
