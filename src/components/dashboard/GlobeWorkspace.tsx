"use client";

import { useMemo, useState } from "react";
import CesiumGlobe, { type GlobeControlApi, type CameraSnapshot } from "../CesiumGlobe";
import { useSIGINTStore } from "../../store";
import Panel from "./panel/Panel";
import PanelBody from "./panel/PanelBody";
import PanelControls from "./panel/PanelControls";
import PanelFooter from "./panel/PanelFooter";
import PanelHeader from "./panel/PanelHeader";
import SegmentedControl from "./controls/SegmentedControl";
import Toggle from "./controls/Toggle";
import { formatNumber } from "../../lib/dashboard/format";

const styleOptions = [
  { value: "normal", label: "NORMAL" },
  { value: "crt", label: "CRT" },
  { value: "nvg", label: "NVG" },
  { value: "flir", label: "FLIR" },
] as const;

const detectOptions = [
  { value: "off", label: "OFF" },
  { value: "sparse", label: "SPARSE" },
  { value: "full", label: "FULL" },
] as const;

const layers = [
  { key: "flights", label: "Flights" },
  { key: "military", label: "Military" },
  { key: "gpsJam", label: "GPS/GNSS Interference" },
  { key: "airspaceAnomaly", label: "Airspace Anomaly" },
  { key: "disasters", label: "Disasters" },
  { key: "satellites", label: "Satellites" },
  { key: "cctv", label: "CCTV" },
  { key: "volcanoes", label: "Volcanoes" },
  { key: "nuclearSites", label: "Nuclear Sites" },
  { key: "militaryBases", label: "Military Bases" },
  { key: "countryBorders", label: "Country Borders" },
] as const;

interface GlobeWorkspaceProps {
  embedded?: boolean;
  compact?: boolean;
}

export default function GlobeWorkspace({ embedded = false, compact = false }: GlobeWorkspaceProps) {
  const [camera, setCamera] = useState<CameraSnapshot | null>(null);
  const [api, setApi] = useState<GlobeControlApi | null>(null);
  const [globeReady, setGlobeReady] = useState(false);

  const layerState = useSIGINTStore((s) => s.layers);
  const toggleLayer = useSIGINTStore((s) => s.toggleLayer);
  const filters = useSIGINTStore((s) => s.filters);
  const setFilters = useSIGINTStore((s) => s.setFilters);
  const ui = useSIGINTStore((s) => s.ui);
  const setUi = useSIGINTStore((s) => s.setUi);
  const setStylePreset = useSIGINTStore((s) => s.setStylePreset);
  const setDetectMode = useSIGINTStore((s) => s.setDetectMode);
  const scenes = useSIGINTStore((s) => s.scenes);
  const gotoScene = useSIGINTStore((s) => s.gotoScene);

  const sceneButtons = useMemo(() => scenes.slice(0, 8), [scenes]);

  return (
    <div
      className={`si-globe-workspace ${embedded ? "is-embedded" : ""} ${compact ? "is-compact" : ""}`.trim()}
    >
      <Panel panelId="globe-main" className="si-globe-main">
        <PanelHeader
          title="GLOBE VIEW"
          subtitle="Interactive 3D world map for global activity."
          controls={<PanelControls onRefresh={api?.gotoHome} refreshText="HOME" />}
        />
        <PanelBody noPadding className="si-globe-canvas-wrap">
          <div style={{ position: "relative", width: "100%", height: "100%" }}>
            <CesiumGlobe
              onControlApi={setApi}
              onCameraSnapshot={setCamera}
              onReady={() => setGlobeReady(true)}
            />
            {!globeReady && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(3, 8, 14, 0.72)",
                  color: "#d7e2ee",
                  fontSize: 11,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  pointerEvents: "none",
                  zIndex: 2,
                }}
              >
                INITIALIZING GLOBE...
              </div>
            )}
          </div>
        </PanelBody>
        <PanelFooter
          source="CESIUM"
          updatedAt={Date.now()}
          health="ok"
          message={
            camera
              ? `LAT ${camera.lat.toFixed(3)} | LON ${camera.lon.toFixed(3)} | ALT ${formatNumber(camera.altM, 0)}m`
              : "Waiting for camera telemetry"
          }
        />
      </Panel>

      <div
        className="si-globe-side-stack"
      >
        <Panel panelId="globe-layers" className="si-globe-side-panel">
          <PanelHeader
            title="LAYER SWITCHBOARD"
            subtitle="Turn each data layer on or off for the globe."
            controls={<PanelControls />}
          />
          <PanelBody>
            <div className="si-layer-grid">
              {layers.map((layer) => (
                <Toggle
                  key={layer.key}
                  label={layer.label}
                  checked={layerState[layer.key]}
                  onChange={() => toggleLayer(layer.key)}
                />
              ))}
            </div>
          </PanelBody>
          <PanelFooter source="LOCAL" updatedAt={Date.now()} health="ok" />
        </Panel>

        <Panel panelId="globe-style" className="si-globe-side-panel">
          <PanelHeader
            title="STYLE / DETECT"
            subtitle="Visual style and display density settings."
            controls={<PanelControls />}
          />
          <PanelBody>
            <SegmentedControl
              value={ui.stylePreset}
              options={styleOptions as unknown as Array<{ value: typeof ui.stylePreset; label: string }>}
              onChange={(value) => setStylePreset(value)}
              ariaLabel="Style preset"
            />
            <SegmentedControl
              value={ui.detectMode}
              options={detectOptions as unknown as Array<{ value: typeof ui.detectMode; label: string }>}
              onChange={(value) => setDetectMode(value)}
              ariaLabel="Detect mode"
            />
            <div className="si-inline-controls">
              <Toggle checked={ui.showBloom} onChange={(checked) => setUi({ showBloom: checked })} label="Bloom" />
              <Toggle checked={ui.sharpen} onChange={(checked) => setUi({ sharpen: checked })} label="Sharpen" />
              <Toggle checked={ui.showDebug} onChange={(checked) => setUi({ showDebug: checked })} label="Debug" />
            </div>
          </PanelBody>
          <PanelFooter source="VIS" updatedAt={Date.now()} health="ok" />
        </Panel>

        <Panel panelId="globe-nav" className="si-globe-side-panel">
          <PanelHeader
            title="NAV CLUSTER"
            subtitle="Camera movement, zoom, and orientation controls."
            controls={<PanelControls />}
          />
          <PanelBody>
            <div className="si-nav-grid">
              <button type="button" title="Go to saved home view" onClick={() => api?.gotoHome()}>
                HOME
              </button>
              <button type="button" title="Save current camera as home" onClick={() => api?.setHomeFromCurrent()}>
                SET HOME
              </button>
              <button type="button" title="Rotate camera north-up" onClick={() => api?.setNorthUp()}>
                NORTH
              </button>
              <button type="button" title="Switch to top-down angle" onClick={() => api?.setTopDown()}>
                TOP
              </button>
              <button type="button" title="Switch to oblique camera angle" onClick={() => api?.setOblique()}>
                OBLIQUE
              </button>
              <button type="button" title="Zoom in" onClick={() => api?.zoomIn()}>
                ZOOM+
              </button>
              <span />
              <button type="button" title="Pan north" onClick={() => api?.nudge("N")}>
                N
              </button>
              <span />
              <button type="button" title="Zoom out" onClick={() => api?.zoomOut()}>
                ZOOM-
              </button>
              <span />
              <button type="button" title="Pan west" onClick={() => api?.nudge("W")}>
                W
              </button>
              <button type="button" title="Pan south" onClick={() => api?.nudge("S")}>
                S
              </button>
              <button type="button" title="Pan east" onClick={() => api?.nudge("E")}>
                E
              </button>
              <span />
            </div>
            <div className="si-camera-readout">
              {camera ? (
                <>
                  <div>LAT {camera.lat.toFixed(3)} / LON {camera.lon.toFixed(3)}</div>
                  <div>ALTITUDE {formatNumber(camera.altM, 0)}M / HEADING {camera.headingDeg.toFixed(0)}</div>
                </>
              ) : (
                <div>Camera telemetry unavailable</div>
              )}
            </div>
          </PanelBody>
          <PanelFooter source="CAMERA" updatedAt={Date.now()} health="ok" />
        </Panel>

        <Panel panelId="globe-filters" className="si-globe-side-panel">
          <PanelHeader
            title="FILTERS"
            subtitle="Filter earthquakes and altitude ranges."
            controls={<PanelControls />}
          />
          <PanelBody>
            <label className="si-range-label">
              <span>Min Magnitude</span>
              <input
                type="range"
                min={0}
                max={9}
                step={0.1}
                value={filters.minMagnitude}
                onChange={(event) => setFilters({ minMagnitude: Number(event.target.value) })}
              />
            </label>
            <label className="si-range-label">
              <span>Max Altitude</span>
              <input
                type="range"
                min={10000}
                max={1200000}
                step={10000}
                value={filters.maxAltM}
                onChange={(event) => setFilters({ maxAltM: Number(event.target.value) })}
              />
            </label>
            <Toggle
              checked={filters.onGroundVisible}
              onChange={(checked) => setFilters({ onGroundVisible: checked })}
              label="Include On-Ground"
            />
          </PanelBody>
          <PanelFooter source="FILTERS" updatedAt={Date.now()} health="ok" />
        </Panel>

        <Panel panelId="globe-scenes" className="si-globe-side-panel">
          <PanelHeader
            title="SCENE QUICKLOAD"
            subtitle="Jump the camera to preset city views."
            controls={<PanelControls />}
          />
          <PanelBody
            className="si-globe-scenes-body"
          >
            <div className="si-scene-grid">
              {sceneButtons.map((scene, index) => (
                <button key={`${scene.name}-${index}`} type="button" onClick={() => gotoScene(index)}>
                  {scene.city || scene.name}
                </button>
              ))}
            </div>
          </PanelBody>
          <PanelFooter source="SCENES" updatedAt={Date.now()} health="ok" />
        </Panel>
      </div>
    </div>
  );
}
