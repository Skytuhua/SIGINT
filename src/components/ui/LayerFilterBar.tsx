"use client";

import { useWorldViewStore } from "../../store";
import type { TimeWindow } from "../../lib/events/schema";

const TIME_OPTIONS: { label: string; value: TimeWindow }[] = [
  { label: "6H", value: "6h" },
  { label: "24H", value: "24h" },
  { label: "7D", value: "7d" },
];

const bar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  background: "rgba(8, 12, 20, 0.72)",
  border: "1px solid rgba(110, 130, 155, 0.28)",
  borderRadius: 10,
  backdropFilter: "blur(6px)",
  fontFamily:
    'var(--font-tech-mono), ui-monospace, Menlo, Monaco, Consolas, "Courier New", monospace',
  color: "#b9cde0",
  fontSize: 11,
  letterSpacing: 1.5,
};

const segBtn = (active: boolean): React.CSSProperties => ({
  padding: "4px 10px",
  borderRadius: 6,
  border: active
    ? "1px solid rgba(24, 213, 255, 0.55)"
    : "1px solid rgba(95, 110, 129, 0.3)",
  background: active ? "rgba(8, 52, 72, 0.7)" : "transparent",
  color: active ? "#89e5ff" : "#5f7488",
  fontSize: 10,
  letterSpacing: 2,
  fontFamily: "inherit",
  cursor: "pointer",
});

export default function LayerFilterBar() {
  const layerFilters = useWorldViewStore((s) => s.layerFilters);
  const setLayerFilters = useWorldViewStore((s) => s.setLayerFilters);

  return (
    <div style={bar}>
      <span style={{ color: "#6e849d", textTransform: "uppercase", marginRight: 4 }}>
        Time
      </span>
      {TIME_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          style={segBtn(layerFilters.timeWindow === opt.value)}
          onClick={() => setLayerFilters({ timeWindow: opt.value })}
        >
          {opt.label}
        </button>
      ))}

      <span style={{ color: "rgba(80,100,125,0.4)", margin: "0 4px" }}>|</span>

      <span style={{ color: "#6e849d", textTransform: "uppercase", marginRight: 4 }}>
        Min Sev
      </span>
      <input
        type="range"
        min={0}
        max={5}
        step={0.5}
        value={layerFilters.minSeverity}
        onChange={(e) =>
          setLayerFilters({ minSeverity: parseFloat(e.target.value) })
        }
        style={{ width: 60, accentColor: "#20d2ff" }}
      />
      <span style={{ color: "#89e5ff", minWidth: 20, textAlign: "center" }}>
        {layerFilters.minSeverity}
      </span>

      <span style={{ color: "rgba(80,100,125,0.4)", margin: "0 4px" }}>|</span>

      <button
        style={{
          ...segBtn(layerFilters.viewportBound),
          fontSize: 10,
        }}
        onClick={() =>
          setLayerFilters({ viewportBound: !layerFilters.viewportBound })
        }
      >
        {layerFilters.viewportBound ? "VIEWPORT ✓" : "VIEWPORT"}
      </button>
    </div>
  );
}
