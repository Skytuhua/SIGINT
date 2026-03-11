"use client";

import { useSIGINTStore } from "../../store";
import { ALL_CATEGORIES, CATEGORY_LABELS, CATEGORY_COLORS } from "../../lib/cesium/tradeRoutes/types";
import type { TradeRouteCategory } from "../../lib/cesium/tradeRoutes/types";

const shell: React.CSSProperties = {
  position: "absolute",
  top: 18,
  left: 16,
  width: "min(356px, calc(100vw - 24px))",
  maxHeight: "calc(100vh - 26px)",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  zIndex: 12,
  color: "#b9cde0",
  fontFamily:
    'var(--font-tech-mono), ui-monospace, Menlo, Monaco, Consolas, "Courier New", monospace',
  pointerEvents: "auto",
};

const card: React.CSSProperties = {
  background: "rgba(8, 12, 20, 0.72)",
  border: "1px solid rgba(110, 130, 155, 0.28)",
  borderRadius: 14,
  backdropFilter: "blur(8px)",
};

type LayerName =
  | "satellites"
  | "flights"
  | "military"
  | "disasters"
  | "cctv"
  | "tradeRoutes"
  | "gpsJam"
  | "airspaceAnomaly";

const layerRows: {
  id: LayerName | "weather" | "bikeshare";
  label: string;
  source: string;
  accent: string;
  disabled?: boolean;
}[] = [
  { id: "flights", label: "Live Flights", source: "adsb.lol / AviationStack", accent: "#a7dfff" },
  { id: "military", label: "Military Flights", source: "adsb.lol", accent: "#d58a46" },
  { id: "gpsJam", label: "GPS/GNSS Interference", source: "ADS-B multi-indicator inference", accent: "#ffab40" },
  { id: "airspaceAnomaly", label: "Airspace Anomaly", source: "ADS-B multi-indicator inference", accent: "#e57373" },
  { id: "disasters", label: "Disaster Alerts", source: "GDACS", accent: "#ff8f6b" },
  { id: "satellites", label: "Satellites", source: "CelesTrak", accent: "#6ad6ff" },
  { id: "weather", label: "Weather Radar", source: "NOAA NEXRAD", accent: "#8da3b8", disabled: true },
  { id: "tradeRoutes", label: "Trade Routes", source: "Wikidata / IMO", accent: "#4fc3f7" },
  { id: "cctv", label: "CCTV Mesh", source: "Street View fallback", accent: "#bfd7ef" },
  { id: "bikeshare", label: "Bikeshare", source: "GBFS", accent: "#7d95ad", disabled: true },
];

function SectionButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
        style={{
          width: "100%",
          display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderRadius: 14,
        border: active
          ? "1px solid rgba(24, 213, 255, 0.45)"
          : "1px solid rgba(110,130,155,0.26)",
        background: active ? "rgba(12, 22, 38, 0.85)" : "rgba(7, 12, 20, 0.72)",
        padding: "13px 14px",
        color: active ? "#9ce9ff" : "#6c859e",
        letterSpacing: 2,
        textTransform: "uppercase",
        fontSize: 11,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      <span>{label}</span>
      <span
        style={{
          width: 24,
          height: 24,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
          border: "1px solid rgba(120,140,165,0.32)",
          fontSize: 16,
          color: active ? "#96e9ff" : "#7a8ea4",
        }}
      >
        {active ? "-" : "+"}
      </span>
    </button>
  );
}

function TradeRouteFilterChips() {
  const categoryFilters = useSIGINTStore((s) => s.tradeRouteSelection.categoryFilters);
  const setFilter = useSIGINTStore((s) => s.setTradeRouteCategoryFilter);

  return (
    <div style={{ gridColumn: "1 / -1", display: "flex", flexWrap: "wrap", gap: 5, marginTop: 4 }}>
      {ALL_CATEGORIES.map((cat) => {
        const enabled = categoryFilters[cat];
        const color = CATEGORY_COLORS[cat];
        return (
          <button
            key={cat}
            onClick={() => setFilter(cat as TradeRouteCategory, !enabled)}
            className="si-trade-chip"
            style={{
              padding: "3px 10px",
              borderRadius: 6,
              border: enabled
                ? `1px solid ${color}88`
                : "1px solid rgba(95,110,129,0.28)",
              background: enabled ? `${color}18` : "rgba(10, 14, 22, 0.6)",
              color: enabled ? color : "#4f6175",
              fontSize: 10,
              letterSpacing: 1,
              fontFamily: "inherit",
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        );
      })}
    </div>
  );
}

function LayerRows() {
  const layers = useSIGINTStore((s) => s.layers);
  const toggleLayer = useSIGINTStore((s) => s.toggleLayer);

  return (
    <div style={{ ...card, padding: "12px 12px 10px", maxHeight: 520, overflowY: "auto" }}>
      <div style={{ color: "#6e849d", fontSize: 11, letterSpacing: 3, marginBottom: 8 }}>
        DATA LAYERS
      </div>

      {layerRows.map((row) => {
        const enabled =
          row.id in layers ? layers[row.id as LayerName] : false;
        const canToggle = !row.disabled && row.id in layers;

        return (
          <div
            key={row.id}
            style={{
              borderTop: "1px solid rgba(80,100,125,0.22)",
              paddingTop: 8,
              marginTop: 8,
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 8,
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ color: row.accent, fontSize: 17, lineHeight: 1 }}>+</span>
                <span style={{ color: "#d2dfeb", fontSize: 13, letterSpacing: 0.2 }}>
                  {row.label}
                </span>
              </div>
              <div style={{ color: "#556c83", fontSize: 12, marginLeft: 26, marginTop: 4 }}>
                {row.source}
              </div>
            </div>

            <button
              onClick={() => {
                if (canToggle) toggleLayer(row.id as LayerName);
              }}
              disabled={!canToggle}
              style={{
                alignSelf: "start",
                minWidth: 52,
                height: 30,
                borderRadius: 8,
                border: enabled
                  ? "1px solid rgba(24,213,255,0.62)"
                  : "1px solid rgba(95,110,129,0.34)",
                background: enabled ? "rgba(8, 52, 72, 0.7)" : "rgba(10, 14, 22, 0.74)",
                color: enabled ? "#89e5ff" : "#4f6175",
                fontSize: 11,
                letterSpacing: 1,
                fontFamily: "inherit",
                cursor: canToggle ? "pointer" : "default",
              }}
            >
              {enabled ? "ON" : "OFF"}
            </button>

            {row.id === "tradeRoutes" && enabled && <TradeRouteFilterChips />}
          </div>
        );
      })}
    </div>
  );
}

function SceneRows() {
  const scenes = useSIGINTStore((s) => s.scenes);
  const savedScenes = useSIGINTStore((s) => s.savedScenes);
  const gotoScene = useSIGINTStore((s) => s.gotoScene);
  const currentIdx = useSIGINTStore((s) => s.currentSceneIdx);

  const allScenes = [...scenes, ...savedScenes];

  return (
    <div style={{ ...card, padding: "12px", maxHeight: 360, overflowY: "auto" }}>
      <div style={{ color: "#6e849d", fontSize: 11, letterSpacing: 3, marginBottom: 8 }}>
        LOCATIONS
      </div>
      {allScenes.length === 0 && (
        <div style={{ color: "#5f7389", fontSize: 12 }}>No scenes loaded</div>
      )}
      {allScenes.map((scene, idx) => (
        <button
          key={`${scene.name}_${idx}`}
          onClick={() => gotoScene(idx)}
          style={{
            width: "100%",
            textAlign: "left",
            padding: "10px 12px",
            marginBottom: 7,
            borderRadius: 10,
            border:
              currentIdx === idx
                ? "1px solid rgba(24,213,255,0.48)"
                : "1px solid rgba(102,121,143,0.25)",
            background:
              currentIdx === idx
                ? "rgba(10, 28, 42, 0.82)"
                : "rgba(10, 13, 20, 0.72)",
            color: currentIdx === idx ? "#97e8ff" : "#aec2d8",
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          <div style={{ fontSize: 14, marginBottom: 3 }}>{scene.name}</div>
          <div style={{ color: "#5f7488", fontSize: 12 }}>{scene.city ?? "No city"}</div>
        </button>
      ))}
    </div>
  );
}

function CctvRows() {
  const cameras = useSIGINTStore((s) => s.cctv.cameras);
  const selectedCameraId = useSIGINTStore((s) => s.cctv.selectedCameraId);
  const selectCamera = useSIGINTStore((s) => s.selectCamera);

  return (
    <div style={{ ...card, padding: "12px", maxHeight: 430, overflowY: "auto" }}>
      <div style={{ color: "#6e849d", fontSize: 11, letterSpacing: 3, marginBottom: 8 }}>
        CCTV MESH
      </div>
      {cameras.length === 0 && (
        <div style={{ color: "#5f7389", fontSize: 12 }}>No cameras loaded</div>
      )}
      {cameras.map((cam) => (
        <button
          key={cam.id}
          onClick={() => selectCamera(cam.id === selectedCameraId ? null : cam.id)}
          style={{
            width: "100%",
            textAlign: "left",
            padding: "9px 10px",
            marginBottom: 6,
            borderRadius: 10,
            border:
              selectedCameraId === cam.id
                ? "1px solid rgba(24,213,255,0.48)"
                : "1px solid rgba(102,121,143,0.25)",
            background:
              selectedCameraId === cam.id
                ? "rgba(10, 28, 42, 0.82)"
                : "rgba(10, 13, 20, 0.72)",
            color: selectedCameraId === cam.id ? "#97e8ff" : "#aec2d8",
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          <div style={{ fontSize: 13 }}>{cam.name}</div>
          <div style={{ color: "#5f7488", fontSize: 11 }}>{cam.city}</div>
        </button>
      ))}
    </div>
  );
}

export default function LeftPanel() {
  const leftTab = useSIGINTStore((s) => s.ui.leftTab);
  const setUi = useSIGINTStore((s) => s.setUi);
  const stylePreset = useSIGINTStore((s) => s.ui.stylePreset);

  return (
    <div style={shell}>
      <div style={{ ...card, padding: "8px 14px 12px" }}>
        <div style={{ color: "#c98a45", letterSpacing: 2, fontSize: 11 }}>
          OPTIC  VIS:39  SRC:180  DENS:1.42  0.6ms
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
          <div style={{ color: "#98daf7", fontSize: 24, lineHeight: 1 }}>O</div>
          <div style={{ color: "#e8f1fa", fontSize: 41, letterSpacing: 8 }}>
            WORLD<span style={{ color: "#20d2ff" }}>VIEW</span>
          </div>
        </div>
        <div style={{ color: "#5a7288", letterSpacing: 7, fontSize: 11, marginTop: 8 }}>
          NO PLACE LEFT BEHIND
        </div>

        <div
          style={{
            marginTop: 16,
            color: "#ce8a3d",
            letterSpacing: 3,
            fontSize: 13,
            fontFamily: "var(--font-hud)",
          }}
        >
          TOP SECRET // SI-TK // NOFORN
        </div>
        <div
          style={{
            marginTop: 6,
            color: "#c08a49",
            letterSpacing: 2,
            fontSize: 24,
            fontFamily: "var(--font-hud)",
          }}
        >
          KH11-4094 OPS-4168
        </div>
        <div
          style={{
            marginTop: 6,
            color: "#c08a49",
            letterSpacing: 3,
            fontSize: 22,
            fontFamily: "var(--font-hud)",
          }}
        >
          {stylePreset.toUpperCase()}
        </div>
      </div>

      <SectionButton
        label="CCTV Mesh"
        active={leftTab === "cctv"}
        onClick={() => setUi({ leftTab: leftTab === "cctv" ? "layers" : "cctv" })}
      />
      <SectionButton
        label="Data Layers"
        active={leftTab === "layers"}
        onClick={() => setUi({ leftTab: "layers" })}
      />
      <SectionButton
        label="Scenes"
        active={leftTab === "scenes"}
        onClick={() => setUi({ leftTab: leftTab === "scenes" ? "layers" : "scenes" })}
      />

      {leftTab === "layers" && <LayerRows />}
      {leftTab === "scenes" && <SceneRows />}
      {leftTab === "cctv" && <CctvRows />}

      <div style={{ ...card, padding: "10px 14px", color: "#7aa6bf", letterSpacing: 2, fontSize: 13 }}>
        MGRS: 14R PU 2093 4905
        <div style={{ marginTop: 6, color: "#5f7d93", fontSize: 11 }}>
          30 16'01.71"N 097 44'34.00"W
        </div>
      </div>
    </div>
  );
}
