"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useSIGINTStore } from "../store";
import { flyToScene, DEFAULT_HOME_VIEW } from "../lib/cesium/viewer";
import {
  renderSatellites,
  renderFlights,
  renderDisasterAlerts,
  renderCctv,
  renderOrbitPath,
  renderFlightHighlight,
  renderFlightPath,
  renderSatelliteHighlight,
  clearLayer,
  clearAllOrbitLayers,
  updateFlightPositions,
  renderTradeRoutesLayer,
  clearTradeRoutesLayer,
  tickTradeRouteAnimation,
  getActiveTradeRouteHandle,
  identifyTradeRoutePick,
  renderGpsJamZones,
  renderAirspaceAnomalies,
  renderDisappearedFlights,
  setFlightVectorsVisible,
  renderVolcanoes,
  renderNuclearSites,
  renderMilitaryBases,
  renderCountryBorders,
} from "../lib/cesium/layers";
import {
  AirspaceBaselineTracker,
  computeAirspaceAnomalies,
  detectDisappearedFlights,
  pruneGhosts,
  GHOST_MAX_AGE_MS,
} from "../lib/cesium/airspaceAnomaly";
import { GpsInterferenceTracker } from "../lib/cesium/gpsInterference";
import type { TradeRouteLayerHandle } from "../lib/cesium/layers";
import { applyStylePreset } from "../lib/cesium/postprocess";
import type {
  PropagatedSat,
  Flight,
  DisasterAlert,
  DisappearedFlight,
  EntityData,
  Satellite,
  Scene,
  CctvCamera,
} from "../lib/providers/types";
import { fetchAllCctvCameras } from "../lib/cctv/sources";
import { fetchJsonWithPolicy, isAbortError } from "../lib/runtime/fetchJson";
import { buildRecordKey, dedupeByRecordKey } from "../lib/runtime/normalize";
import type { Viewer } from "cesium";

// 闁冲厜鍋撻柍鍏夊亾闁冲厜鍋?Types for worker messages 闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾
interface SatWorkerOutMessage {
  type: "POSITIONS" | "ORBIT_PATH" | "TLE_LOADED";
  positions?: PropagatedSat[];
  path?: [number, number, number][];
  noradId?: string;
  count?: number;
}


interface OrbitFocusTarget {
  type: "flight" | "satellite";
  id: string;
}

const toDegrees = (radians: number) => (radians * 180) / Math.PI;

const normalizeLon = (lonDeg: number) =>
  ((((lonDeg + 180) % 360) + 360) % 360) - 180;

/** Max seconds to extrapolate from last snapshot (avoid runaway when fetch is late). */
const FLIGHT_INTERPOLATION_CAP_S = 12;
const MAX_OTC_CAMERAS_FOR_GLOBE = 1200;

function sampleCctvForGlobe(
  cameras: CctvCamera[],
  brokenIds: Record<string, number>
): CctvCamera[] {
  const healthy = cameras.filter(
    (cam) => (brokenIds[cam.id] ?? 0) < 3 && !(cam.lat === 0 && cam.lon === 0),
  );
  const otc: CctvCamera[] = [];
  const nonOtc: CctvCamera[] = [];

  for (const cam of healthy) {
    if (cam.id.startsWith("otc_")) otc.push(cam);
    else nonOtc.push(cam);
  }

  if (otc.length <= MAX_OTC_CAMERAS_FOR_GLOBE) {
    return [...nonOtc, ...otc];
  }

  const step = Math.ceil(otc.length / MAX_OTC_CAMERAS_FOR_GLOBE);
  const sampledOtc = otc.filter((_cam, idx) => idx % step === 0);
  return [...nonOtc, ...sampledOtc];
}

/** Dead-reckoning: interpolate flight position from last snapshot using speed, heading, vRate. */
function deadReckonPosition(
  flight: Flight,
  receivedAtMs: number
): { lon: number; lat: number; altM: number } {
  const now = Date.now();
  let dtSec = (now - receivedAtMs) / 1000;
  if (dtSec < 0) dtSec = 0;
  if (dtSec > FLIGHT_INTERPOLATION_CAP_S) dtSec = FLIGHT_INTERPOLATION_CAP_S;

  const speedMs = flight.speedMs ?? 0;
  const headingDeg = flight.heading ?? 0;
  const vRate = flight.vRate ?? 0;
  const altM = (flight.altM ?? 0) + vRate * dtSec;

  if (speedMs <= 0) {
    return { lon: flight.lon, lat: flight.lat, altM };
  }

  const headingRad = (headingDeg * Math.PI) / 180;
  const latRad = (flight.lat * Math.PI) / 180;
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * Math.max(0.01, Math.cos(latRad));
  const dNorthM = speedMs * dtSec * Math.cos(headingRad);
  const dEastM = speedMs * dtSec * Math.sin(headingRad);
  const dLat = dNorthM / mPerDegLat;
  const dLon = dEastM / mPerDegLon;
  return {
    lon: flight.lon + dLon,
    lat: flight.lat + dLat,
    altM,
  };
}

interface BlendEntry {
  fromLon: number; fromLat: number; fromAltM: number;
  toLon: number; toLat: number; toAltM: number;
  blendStartMs: number;
}

const BLEND_DURATION_MS = 2000;

function getBlendedPosition(
  flight: Flight,
  receivedAtMs: number,
  blendEntry: BlendEntry | undefined
): { lon: number; lat: number; altM: number } {
  const dr = deadReckonPosition(flight, receivedAtMs);
  if (!blendEntry) return dr;

  const elapsed = Date.now() - blendEntry.blendStartMs;
  if (elapsed >= BLEND_DURATION_MS) return dr;

  // ease-out cubic: 1 - (1 - t)^3
  const t = elapsed / BLEND_DURATION_MS;
  const eased = 1 - (1 - t) ** 3;

  return {
    lon: blendEntry.fromLon + (dr.lon - blendEntry.fromLon) * eased,
    lat: blendEntry.fromLat + (dr.lat - blendEntry.fromLat) * eased,
    altM: blendEntry.fromAltM + (dr.altM - blendEntry.fromAltM) * eased,
  };
}

export interface CameraSnapshot {
  lat: number;
  lon: number;
  altM: number;
  headingDeg: number;
  pitchDeg: number;
}

export interface GlobeControlApi {
  gotoHome: () => Promise<void>;
  setHomeFromCurrent: () => void;
  setNorthUp: () => void;
  setTopDown: () => void;
  setOblique: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  nudge: (dir: "N" | "S" | "E" | "W") => Promise<void>;
}

interface CesiumGlobeProps {
  onControlApi?: (api: GlobeControlApi) => void;
  onCameraSnapshot?: (snapshot: CameraSnapshot | null) => void;
  /** When true, disables scroll/pinch zoom (e.g. for fixed-size news globe). */
  disableZoom?: boolean;
   onReady?: () => void;
}

// 闁冲厜鍋撻柍鍏夊亾闁冲厜鍋?CesiumGlobe 闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋?

export default function CesiumGlobe({
  onControlApi,
  onCameraSnapshot,
  disableZoom = false,
  onReady,
}: CesiumGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const homeViewRef = useRef({
    lat: DEFAULT_HOME_VIEW.lat,
    lon: DEFAULT_HOME_VIEW.lon,
    altM: DEFAULT_HOME_VIEW.altM,
    heading: DEFAULT_HOME_VIEW.heading,
    pitch: DEFAULT_HOME_VIEW.pitch,
  });
  const satWorkerRef = useRef<Worker | null>(null);
  const trackFetchAbortRef = useRef<AbortController | null>(null);
  const flightRenderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFlightsRef = useRef<Flight[] | null>(null);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const fpsFrameRef = useRef({ lastTime: 0, frames: 0 });
  const currentSatsRef = useRef<PropagatedSat[]>([]);
  const currentFlightsRef = useRef<Flight[]>([]);
  const currentDisastersRef = useRef<DisasterAlert[]>([]);
  const volcanoDataRef = useRef<Array<{ id?: string; geometry: { type: string; coordinates: [number, number] }; properties: Record<string, unknown> }>>([]);
  const nuclearSitesDataRef = useRef<Array<{ id?: string; geometry: { type: string; coordinates: [number, number] }; properties: Record<string, unknown> }>>([]);
  const militaryBasesDataRef = useRef<Array<{ id?: string; geometry: { type: string; coordinates: [number, number] }; properties: Record<string, unknown> }>>([]);
  const countryBordersDataRef = useRef<Array<{ id?: string; geometry: { type: string; coordinates: number[][][] | number[][][][] }; properties: Record<string, unknown> }>>([]);
  const airspaceTrackerRef = useRef(new AirspaceBaselineTracker());
  const gpsInterferenceTrackerRef = useRef(new GpsInterferenceTracker());
  const previousMilitaryMapRef = useRef<Map<string, Flight>>(new Map());
  const militaryMissCountRef = useRef<Map<string, number>>(new Map());
  const disappearedFlightsRef = useRef<DisappearedFlight[]>([]);
  const anomalyRenderInFlightRef = useRef(false);
  const trackedFlightIdRef = useRef<string | null>(null);
  const followTrackedFlightRef = useRef(false);
  const focusTargetRef = useRef<OrbitFocusTarget | null>(null);
  const flightPathAccumRef = useRef<[number, number, number][]>([]);
  const lookAtInitializedRef = useRef(false);
  const lastTrackFetchRef = useRef<number>(0);
  const flightSnapshotsRef = useRef<
    Map<string, { flight: Flight; receivedAt: number; lastSeenMs: number }>
  >(new Map());
  const flightBlendRef = useRef<Map<string, BlendEntry>>(new Map());
  const lastTleSignatureRef = useRef("");
  const cesiumRef = useRef<typeof import("cesium") | null>(null);
  const [cameraSnapshot, setCameraSnapshot] = useState<CameraSnapshot | null>(
    null
  );
  const lastNewsBoundsUpdateRef = useRef(0);
  const lastNewsBoundsRef = useRef<{
    west: number;
    south: number;
    east: number;
    north: number;
  } | null>(null);
  const [hoverNewsTip, setHoverNewsTip] = useState<{
    x: number;
    y: number;
    headline: string;
    source: string;
    publishedAt: number;
  } | null>(null);
  const store = useSIGINTStore;

  const releaseOrbitFocus = useCallback(() => {
    followTrackedFlightRef.current = false;
    focusTargetRef.current = null;
    lookAtInitializedRef.current = false;

    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium) return;

    clearLayer(viewer, "satellite_highlight");
    clearAllOrbitLayers(viewer);

    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

    const pos = Cesium.Cartesian3.clone(viewer.camera.positionWC);
    const carto = viewer.camera.positionCartographic;

    // Re-center view on the globe: point camera at the nadir (globe surface below camera)
    // so that after zoom out the globe stays centered instead of appearing at the bottom.
    const ellipsoid = viewer.scene.globe.ellipsoid;
    const targetOnGlobe = Cesium.Cartesian3.fromRadians(
      carto.longitude,
      carto.latitude,
      0
    );
    const direction = Cesium.Cartesian3.subtract(
      targetOnGlobe,
      pos,
      new Cesium.Cartesian3()
    );
    Cesium.Cartesian3.normalize(direction, direction);
    const up = ellipsoid.geodeticSurfaceNormal(pos, new Cesium.Cartesian3());
    viewer.camera.setView({ destination: pos, orientation: { direction, up } });
  }, []);

  const focusFlightSelection = useCallback(async (viewer: Viewer, flight: Flight) => {
    if (!viewer || viewer.isDestroyed()) return;

    const Cesium = cesiumRef.current ?? (await import("cesium"));
    cesiumRef.current = Cesium;

    const altM = Math.max(0, flight.altM ?? 0);
    const target = Cesium.Cartesian3.fromDegrees(flight.lon, flight.lat, altM + 400);
    const currentDistance = Cesium.Cartesian3.distance(viewer.camera.positionWC, target);

    // Viewing distance: comfortable frame above the flight (scale slightly with altitude)
    const preferredRange = Math.max(6_000, Math.min(12_000, 4_000 + altM * 0.3));
    const targetRange =
      currentDistance > preferredRange
        ? preferredRange
        : Math.max(4_000, Math.min(80_000, currentDistance * 0.85));

    // Longer duration for long jumps, with smooth deceleration at the end
    const duration = Math.min(1.8, Math.max(1.0, 0.9 + currentDistance / 80_000_000));
    const pitchRad = Cesium.Math.toRadians(-36);
    const heading = viewer.camera.heading;

    viewer.camera.cancelFlight();

    // Save start position and orientation
    const startPos = Cesium.Cartesian3.clone(viewer.camera.positionWC);
    const startDir = Cesium.Cartesian3.clone(viewer.camera.directionWC);
    const startUp = Cesium.Cartesian3.clone(viewer.camera.upWC);

    // Compute end position: camera at targetRange from flight with desired heading/pitch
    viewer.camera.lookAt(
      target,
      new Cesium.HeadingPitchRange(heading, pitchRad, targetRange)
    );
    const endPos = Cesium.Cartesian3.clone(viewer.camera.positionWC);
    viewer.camera.setView({
      destination: startPos,
      orientation: { direction: startDir, up: startUp },
    });

    const startTime = Cesium.JulianDate.toDate(Cesium.JulianDate.now()).getTime();

    await new Promise<void>((resolve) => {
      const onFrame = () => {
        if (viewer.isDestroyed()) {
          viewer.scene.postRender.removeEventListener(onFrame);
          resolve();
          return;
        }
        const elapsed =
          (Cesium.JulianDate.toDate(Cesium.JulianDate.now()).getTime() - startTime) / 1000;
        const t = Math.min(1, elapsed / duration);
        const eased = Cesium.EasingFunction.CUBIC_OUT(t);

        const pos = Cesium.Cartesian3.lerp(startPos, endPos, eased, new Cesium.Cartesian3());
        const range = Cesium.Cartesian3.distance(pos, target);
        viewer.camera.position = pos;
        viewer.camera.lookAt(
          target,
          new Cesium.HeadingPitchRange(heading, pitchRad, range)
        );

        if (t >= 1) {
          viewer.scene.postRender.removeEventListener(onFrame);
          // Release lookAt constraint so the camera stops moving; otherwise Cesium
          // keeps the constraint and the view can drift or jump.
          viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
          const endDir = Cesium.Cartesian3.subtract(target, endPos, new Cesium.Cartesian3());
          Cesium.Cartesian3.normalize(endDir, endDir);
          viewer.camera.setView({
            destination: endPos,
            orientation: {
              direction: endDir,
              up: viewer.camera.upWC.clone(),
            },
          });
          viewer.camera.cancelFlight();
          resolve();
        }
      };
      viewer.scene.postRender.addEventListener(onFrame);
    });
  }, []);

  const focusSatelliteSelection = useCallback(async (viewer: Viewer, sat: PropagatedSat) => {
    if (!viewer || viewer.isDestroyed()) return;

    const Cesium = cesiumRef.current ?? (await import("cesium"));
    cesiumRef.current = Cesium;

    const altM = Math.max(0, sat.altKm * 1000);
    const target = Cesium.Cartesian3.fromDegrees(sat.lon, sat.lat, altM + 400);
    const currentDistance = Cesium.Cartesian3.distance(viewer.camera.positionWC, target);

    const preferredRange = Math.max(50_000, Math.min(500_000, 30_000 + altM * 0.5));
    const targetRange =
      currentDistance > preferredRange
        ? preferredRange
        : Math.max(40_000, Math.min(400_000, currentDistance * 0.85));

    const duration = Math.min(1.8, Math.max(1.0, 0.9 + currentDistance / 80_000_000));
    const pitchRad = Cesium.Math.toRadians(-36);
    const heading = viewer.camera.heading;

    viewer.camera.cancelFlight();

    const startPos = Cesium.Cartesian3.clone(viewer.camera.positionWC);
    const startDir = Cesium.Cartesian3.clone(viewer.camera.directionWC);
    const startUp = Cesium.Cartesian3.clone(viewer.camera.upWC);

    viewer.camera.lookAt(
      target,
      new Cesium.HeadingPitchRange(heading, pitchRad, targetRange)
    );
    const endPos = Cesium.Cartesian3.clone(viewer.camera.positionWC);
    viewer.camera.setView({
      destination: startPos,
      orientation: { direction: startDir, up: startUp },
    });

    const startTime = Cesium.JulianDate.toDate(Cesium.JulianDate.now()).getTime();

    await new Promise<void>((resolve) => {
      const onFrame = () => {
        if (viewer.isDestroyed()) {
          viewer.scene.postRender.removeEventListener(onFrame);
          resolve();
          return;
        }
        const elapsed =
          (Cesium.JulianDate.toDate(Cesium.JulianDate.now()).getTime() - startTime) / 1000;
        const t = Math.min(1, elapsed / duration);
        const eased = Cesium.EasingFunction.CUBIC_OUT(t);

        const pos = Cesium.Cartesian3.lerp(startPos, endPos, eased, new Cesium.Cartesian3());
        const range = Cesium.Cartesian3.distance(pos, target);
        viewer.camera.position = pos;
        viewer.camera.lookAt(
          target,
          new Cesium.HeadingPitchRange(heading, pitchRad, range)
        );

        if (t >= 1) {
          viewer.scene.postRender.removeEventListener(onFrame);
          // Release lookAt constraint so the camera stops moving; otherwise Cesium
          // keeps the constraint and the view can drift or jump.
          viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
          const endDir = Cesium.Cartesian3.subtract(target, endPos, new Cesium.Cartesian3());
          Cesium.Cartesian3.normalize(endDir, endDir);
          viewer.camera.setView({
            destination: endPos,
            orientation: {
              direction: endDir,
              up: viewer.camera.upWC.clone(),
            },
          });
          viewer.camera.cancelFlight();
          resolve();
        }
      };
      viewer.scene.postRender.addEventListener(onFrame);
    });
  }, []);

  // 闁冲厜鍋撻柍鍏夊亾 Layer render helpers 闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋?

  const renderSatsIfEnabled = useCallback(
    async (sats: PropagatedSat[]) => {
      const { layers, ui } = store.getState();
      if (!viewerRef.current || !layers.satellites) return;
      await renderSatellites(viewerRef.current, sats, ui.detectMode);
    },
    [store]
  );

  const getInterpolatedPosition = useCallback(
    (icao: string): { lon: number; lat: number; altM: number } | null => {
      const entry = flightSnapshotsRef.current.get(icao);
      if (!entry) return null;
      const blendEntry = flightBlendRef.current.get(icao);
      return getBlendedPosition(entry.flight, entry.receivedAt, blendEntry);
    },
    []
  );

  const renderFlightsIfEnabled = useCallback(
    async (flights: Flight[]) => {
      const { layers, filters } = store.getState();
      if (!viewerRef.current) return;

      // Combine commercial + military based on toggles
      const visible = flights.filter(
        (f) => (f.isMilitary ? layers.military : layers.flights)
      );

      if (visible.length === 0) {
        clearLayer(viewerRef.current, "flights");
        return;
      }
      await renderFlights(viewerRef.current, visible, {
        minAltM: filters.minAltM,
        maxAltM: filters.maxAltM,
        onGroundVisible: filters.onGroundVisible,
      });
    },
    [store]
  );

  const renderDisastersIfEnabled = useCallback(
    async (alerts: DisasterAlert[]) => {
      const { layers } = store.getState();
      if (!viewerRef.current) return;
      if (!layers.disasters) {
        clearLayer(viewerRef.current, "disasters");
        return;
      }
      await renderDisasterAlerts(viewerRef.current, alerts);
    },
    [store]
  );

  const renderGpsJamIfEnabled = useCallback(
    async (flights: Flight[], military?: Flight[]) => {
      const { layers } = store.getState();
      if (!viewerRef.current) return;
      if (!layers.gpsJam) {
        clearLayer(viewerRef.current, 'gps_jam');
        for (let i = viewerRef.current.dataSources.length - 1; i >= 0; i--) {
          const ds = viewerRef.current.dataSources.get(i);
          if (ds.name === 'gps_jam') {
            viewerRef.current.dataSources.remove(ds, true);
          }
        }
        return;
      }
      const tracker = gpsInterferenceTrackerRef.current;
      tracker.pushSnapshot(flights);
      if (!tracker.hasEnoughData()) return;
      const zones = tracker.computeZones(military);
      // Re-check after synchronous computation — user may have toggled off
      if (!store.getState().layers.gpsJam) return;
      await renderGpsJamZones(viewerRef.current, zones);
    },
    [store]
  );

  const renderAnomaliesIfEnabled = useCallback(
    async (civilianFlights: Flight[], militaryFlights: Flight[]) => {
      // Guard: skip if another render is already in-flight
      if (anomalyRenderInFlightRef.current) return;
      anomalyRenderInFlightRef.current = true;

      try {
        // ALWAYS push snapshot so baseline builds even when layer is off
        const tracker = airspaceTrackerRef.current;
        tracker.pushSnapshot(civilianFlights, militaryFlights);

        const { layers } = store.getState();
        if (!viewerRef.current) return;
        if (!layers.airspaceAnomaly) {
          clearLayer(viewerRef.current, 'airspace_anomaly');
          clearLayer(viewerRef.current, 'disappeared_flights');
          return;
        }
        const ready = tracker.hasEnoughData();
        console.log(`[airspace-anomaly] civ=${civilianFlights.length} mil=${militaryFlights.length} ready=${ready}`);
        if (ready) {
          const baseline = tracker.getBaseline();
          const zones = computeAirspaceAnomalies(baseline, civilianFlights, militaryFlights);
          console.log(`[airspace-anomaly] baseline cells=${baseline.size} zones=${zones.length}`);
        store.getState().setAirspaceAnomalies(zones);
        await renderAirspaceAnomalies(viewerRef.current, zones);
        // Re-check — user may have toggled off during async render
        if (!store.getState().layers.airspaceAnomaly && viewerRef.current) {
          clearLayer(viewerRef.current, 'airspace_anomaly');
          clearLayer(viewerRef.current, 'disappeared_flights');
          return;
        }
      }
      // Detect disappeared military flights (require 3 consecutive misses)
      const currentMilMap = new Map(militaryFlights.map((f) => [f.icao, f]));
      const prevMap = previousMilitaryMapRef.current;
      const missMap = militaryMissCountRef.current;
      if (prevMap.size > 0) {
        // Update miss counts
        prevMap.forEach((_, icao) => {
          if (!currentMilMap.has(icao)) {
            missMap.set(icao, (missMap.get(icao) ?? 0) + 1);
          } else {
            missMap.delete(icao);
          }
        });
        // Only create ghosts after 3 consecutive misses (~36s absent)
        const newGhosts = detectDisappearedFlights(prevMap, militaryFlights, Date.now())
          .filter((g) => (missMap.get(g.icao) ?? 0) >= 3);
        if (newGhosts.length > 0) {
          disappearedFlightsRef.current = [
            ...disappearedFlightsRef.current,
            ...newGhosts,
          ];
          for (const g of newGhosts) missMap.delete(g.icao);
        }
      }
      previousMilitaryMapRef.current = currentMilMap;
      // Prune and render ghosts
      const now = Date.now();
      disappearedFlightsRef.current = pruneGhosts(disappearedFlightsRef.current, now);
      store.getState().setDisappearedFlights(disappearedFlightsRef.current);
      if (viewerRef.current) {
        await renderDisappearedFlights(viewerRef.current, disappearedFlightsRef.current);
        // Re-check after async render
        if (!store.getState().layers.airspaceAnomaly && viewerRef.current) {
          clearLayer(viewerRef.current, 'disappeared_flights');
        }
      }
      } finally {
        anomalyRenderInFlightRef.current = false;
      }
    },
    [store]
  );

  const postCatalogToSatelliteWorker = useCallback((catalog: Satellite[]) => {
    const worker = satWorkerRef.current;
    if (!worker || !Array.isArray(catalog) || catalog.length === 0) return;

    const tles = catalog
      .filter(
        (sat) =>
          typeof sat?.noradId === "string" &&
          sat.noradId.trim() &&
          typeof sat?.name === "string" &&
          sat.name.trim() &&
          typeof sat?.tle1 === "string" &&
          sat.tle1.startsWith("1 ") &&
          typeof sat?.tle2 === "string" &&
          sat.tle2.startsWith("2 ")
      )
      .map((sat) => ({
        noradId: sat.noradId,
        name: sat.name,
        tle1: sat.tle1,
        tle2: sat.tle2,
      }));

    if (!tles.length) return;

    const signature =
      `${tles.length}|` +
      tles
        .slice(0, 60)
        .map((sat) => `${sat.noradId}:${sat.tle1.slice(18, 32)}`)
        .join("|");
    if (signature === lastTleSignatureRef.current) return;

    lastTleSignatureRef.current = signature;
    worker.postMessage({ type: "UPDATE_TLES", tles });
  }, []);

  const updateCameraSnapshot = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const cartographic = viewer.camera.positionCartographic;
    const next: CameraSnapshot = {
      lat: toDegrees(cartographic.latitude),
      lon: toDegrees(cartographic.longitude),
      altM: cartographic.height,
      headingDeg: toDegrees(viewer.camera.heading),
      pitchDeg: toDegrees(viewer.camera.pitch),
    };
    setCameraSnapshot(next);
    onCameraSnapshot?.(next);

    const state = store.getState();
    if (state.dashboard.activeView === "news" && state.news.searchInView) {
      try {
        const nowMs = Date.now();
        if (nowMs - lastNewsBoundsUpdateRef.current < 1200) {
          return;
        }
        const rectangle = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
        if (rectangle) {
          const nextBounds = {
            west: toDegrees(rectangle.west),
            south: toDegrees(rectangle.south),
            east: toDegrees(rectangle.east),
            north: toDegrees(rectangle.north),
          };
          const prevBounds = lastNewsBoundsRef.current;
          const materiallyChanged =
            !prevBounds ||
            Math.abs(prevBounds.west - nextBounds.west) > 0.2 ||
            Math.abs(prevBounds.south - nextBounds.south) > 0.2 ||
            Math.abs(prevBounds.east - nextBounds.east) > 0.2 ||
            Math.abs(prevBounds.north - nextBounds.north) > 0.2;
          if (materiallyChanged) {
            state.setNewsCameraBounds(nextBounds);
            lastNewsBoundsRef.current = nextBounds;
            lastNewsBoundsUpdateRef.current = nowMs;
          }
        }
      } catch {
        // Some camera states cannot compute a stable rectangle.
      }
    }
  }, [onCameraSnapshot, store]);

  const nudgeCardinal = useCallback(
    async (dir: "N" | "S" | "E" | "W") => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      const cartographic = viewer.camera.positionCartographic;
      const lat = toDegrees(cartographic.latitude);
      const lon = toDegrees(cartographic.longitude);
      const stepKm = Math.min(120, Math.max(1.5, cartographic.height / 9_000));
      const latDelta = stepKm / 111;
      const cosLat = Math.max(0.15, Math.cos((lat * Math.PI) / 180));
      const lonDelta = stepKm / (111 * cosLat);

      let nextLat = lat;
      let nextLon = lon;

      if (dir === "N") nextLat += latDelta;
      if (dir === "S") nextLat -= latDelta;
      if (dir === "E") nextLon += lonDelta;
      if (dir === "W") nextLon -= lonDelta;

      nextLat = Math.max(-85, Math.min(85, nextLat));
      nextLon = normalizeLon(nextLon);

      viewer.camera.cancelFlight();
      await flyToScene(
        viewer,
        nextLat,
        nextLon,
        cartographic.height,
        toDegrees(viewer.camera.heading),
        toDegrees(viewer.camera.pitch),
        0.35
      );
    },
    []
  );

  const setNorthUp = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.camera.flyTo({
      destination: viewer.camera.positionWC,
      orientation: {
        heading: 0,
        pitch: viewer.camera.pitch,
        roll: 0,
      },
      duration: 0.8,
    });
  }, []);

  const setTopDown = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.camera.flyTo({
      destination: viewer.camera.positionWC,
      orientation: {
        heading: viewer.camera.heading,
        pitch: -Math.PI / 2 + 0.02,
        roll: 0,
      },
      duration: 0.8,
    });
  }, []);

  const setOblique = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.camera.flyTo({
      destination: viewer.camera.positionWC,
      orientation: {
        heading: viewer.camera.heading,
        pitch: -Math.PI / 4,
        roll: 0,
      },
      duration: 0.8,
    });
  }, []);

  const zoomIn = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const amount = Math.max(80, viewer.camera.positionCartographic.height * 0.16);
    viewer.camera.zoomIn(amount);
  }, []);

  const zoomOut = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const amount = Math.max(80, viewer.camera.positionCartographic.height * 0.16);
    viewer.camera.zoomOut(amount);
  }, []);

  const gotoHome = useCallback(async () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const home = homeViewRef.current;
    await flyToScene(
      viewer,
      home.lat,
      home.lon,
      home.altM,
      home.heading,
      home.pitch
    );
  }, []);

  const setHomeFromCurrent = useCallback(() => {
    const snapshot = cameraSnapshot;
    if (!snapshot) return;
    homeViewRef.current = {
      lat: snapshot.lat,
      lon: snapshot.lon,
      altM: snapshot.altM,
      heading: snapshot.headingDeg,
      pitch: snapshot.pitchDeg,
    };
  }, [cameraSnapshot]);

  useEffect(() => {
    if (!onControlApi) return;
    onControlApi({
      gotoHome,
      setHomeFromCurrent,
      setNorthUp,
      setTopDown,
      setOblique,
      zoomIn,
      zoomOut,
      nudge: nudgeCardinal,
    });
  }, [
    onControlApi,
    gotoHome,
    setHomeFromCurrent,
    setNorthUp,
    setTopDown,
    setOblique,
    zoomIn,
    zoomOut,
    nudgeCardinal,
  ]);
  // 闁冲厜鍋撻柍鍏夊亾 FPS tracking 闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋?
  const setupFpsTracking = useCallback(
    (viewer: Viewer) => {
      viewer.scene.postRender.addEventListener(() => {
        const now = performance.now();
        fpsFrameRef.current.frames++;
        if (now - fpsFrameRef.current.lastTime >= 1000) {
          store.getState().setDebug({ fps: fpsFrameRef.current.frames });
          fpsFrameRef.current.frames = 0;
          fpsFrameRef.current.lastTime = now;
        }
      });
    },
    [store]
  );

  // 闁冲厜鍋撻柍鍏夊亾 Entity click handler 闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋?
  const setupClickHandler = useCallback(
    async (viewer: Viewer) => {
      const Cesium = await import("cesium");
      cesiumRef.current = Cesium;
      viewer.screenSpaceEventHandler.setInputAction(
        (click: { position: import("cesium").Cartesian2 }) => {
          const picked = viewer.scene.pick(click.position);
          if (!picked) {
            setHoverNewsTip(null);
            releaseOrbitFocus();
            store.getState().clearSelectionContext();
            store.getState().setTradeRouteSelection({ selectedRouteId: null, selectedNodeId: null });
            return;
          }
          // Trade route click: single click selects route/node
          if (store.getState().layers.tradeRoutes) {
            const trPick = identifyTradeRoutePick(picked);
            if (trPick) {
              if (trPick.type === "route") {
                store.getState().setTradeRouteSelection({
                  selectedRouteId: trPick.routeId,
                  selectedNodeId: null,
                });
              } else {
                store.getState().setTradeRouteSelection({
                  selectedNodeId: trPick.nodeId,
                });
              }
              return;
            }
          }
        },
        Cesium.ScreenSpaceEventType.LEFT_CLICK
      );

      viewer.screenSpaceEventHandler.setInputAction(
        (movement: { endPosition: import("cesium").Cartesian2 }) => {
          const picked = viewer.scene.pick(movement.endPosition);
          const id = picked?.id ?? picked?.primitive?.id;
          if (typeof id === "object" && id?.properties) {
            const props = id.properties;
            const now = Cesium.JulianDate.now();
            const type = props.type?.getValue(now);
            if (type === "news") {
              const headline = String(props.headline?.getValue(now) ?? "News");
              const source = String(props.source?.getValue(now) ?? "");
              const publishedAt = Number(props.publishedAt?.getValue(now) ?? Date.now());
              setHoverNewsTip({
                x: movement.endPosition.x + 14,
                y: movement.endPosition.y + 14,
                headline,
                source,
                publishedAt: Number.isFinite(publishedAt) ? publishedAt : Date.now(),
              });
              return;
            }
          }
          // Trade route hover
          if (store.getState().layers.tradeRoutes) {
            const trPick = identifyTradeRoutePick(picked);
            if (trPick) {
              if (trPick.type === "route") {
                store.getState().setTradeRouteSelection({
                  hoveredRouteId: trPick.routeId,
                  hoveredNodeId: null,
                });
              } else {
                store.getState().setTradeRouteSelection({
                  hoveredNodeId: trPick.nodeId,
                  hoveredRouteId: null,
                });
              }
              setHoverNewsTip(null);
              return;
            } else {
              const sel = store.getState().tradeRouteSelection;
              if (sel.hoveredRouteId || sel.hoveredNodeId) {
                store.getState().setTradeRouteSelection({
                  hoveredRouteId: null,
                  hoveredNodeId: null,
                });
              }
            }
          }
          setHoverNewsTip(null);
        },
        Cesium.ScreenSpaceEventType.MOUSE_MOVE
      );

      // Double-click: select icon (entity) and activate tracking / flight path / etc.
      viewer.screenSpaceEventHandler.setInputAction(
        (dblclick: { position: import("cesium").Cartesian2 }) => {
          const picked = viewer.scene.pick(dblclick.position);
          if (!picked) return;

          const id = picked?.id ?? picked?.primitive?.id;
          if (!id) return;

          let entityData: EntityData | null = null;

          if (id?.type === "flight_highlight" && id?.id) {
            const icao = String(id.id);
            const flight = currentFlightsRef.current.find((f) => f.icao === icao);
            if (flight) {
              entityData = { type: "flight", id: icao, data: flight };
            }
          } else if (id?.type && id?.id) {
            entityData = { type: id.type, id: String(id.id), data: id.data };
          } else if (typeof id === "object" && id?.properties) {
            const props = id.properties;
            const now = Cesium.JulianDate.now();
            const type = props.type?.getValue(now);
            if (type === "news") {
              const markerId = String(props.markerId?.getValue(now) ?? id.id ?? "");
              const articleId = String(props.articleId?.getValue(now) ?? "");
              const article =
                store.getState().news.feedItems.find((item) => item.id === articleId) ?? null;
              if (article) {
                entityData = { type: "news", id: articleId, data: article };
                store.getState().setSelectedStory(articleId);
                store.getState().setStoryPopupArticle(article);
                store.getState().setHighlightMarker(markerId || null);
                if (Number.isFinite(article.lat) && Number.isFinite(article.lon)) {
                  viewer.camera.flyTo({
                    destination: Cesium.Cartesian3.fromDegrees(
                      article.lon as number,
                      article.lat as number,
                      180_000
                    ),
                    duration: 0.85,
                  });
                }
              }
            } else if (type === "disaster") {
              const disasterId = String(props.id?.getValue(now) ?? id.id ?? "");
              const alert =
                currentDisastersRef.current.find((item) => item.id === disasterId) ?? null;
              if (alert) {
                entityData = { type: "disaster", id: disasterId, data: alert };
              }
            } else if (type === "cctv") {
              const camId = String(props.id?.getValue(now) ?? "");
              const camData = props.data?.getValue(now);
              if (camId && camData) {
                entityData = { type: "cctv", id: camId, data: camData };
              }
            }
          }

          if (!entityData) return;

          if (entityData.type === "news") {
            return;
          }
          store.getState().selectEntity(entityData);
          if (entityData.type === "satellite") {
            const sat = entityData.data as PropagatedSat;
            const noradId = entityData.id;
            if (
              focusTargetRef.current &&
              (focusTargetRef.current.type !== "satellite" ||
                focusTargetRef.current.id !== noradId)
            ) {
              releaseOrbitFocus();
            }
            trackedFlightIdRef.current = null;
            store.getState().setTrackedFlightId(null);
            clearLayer(viewer, "flight_highlight");
            clearLayer(viewer, "flight_path");
            flightPathAccumRef.current = [];
            focusTargetRef.current = { type: "satellite", id: noradId };
            followTrackedFlightRef.current = true;
            lookAtInitializedRef.current = false;
            store.getState().setTrackingId(noradId);
            void renderSatelliteHighlight(viewer, sat);
            if (satWorkerRef.current) {
              satWorkerRef.current.postMessage({
                type: "COMPUTE_ORBIT",
                noradId,
              });
            }
          } else if (entityData.type === "flight") {
            const icao = String(entityData.id ?? "").trim().toLowerCase();
            if (!icao) return;
            if (
              focusTargetRef.current &&
              (focusTargetRef.current.type !== "flight" || focusTargetRef.current.id !== icao)
            ) {
              releaseOrbitFocus();
            }
            focusTargetRef.current = { type: "flight", id: icao };
            trackedFlightIdRef.current = icao;
            followTrackedFlightRef.current = false; // no continuous follow so user can rotate freely
            lookAtInitializedRef.current = false;
            flightPathAccumRef.current = [];
            lastTrackFetchRef.current = 0;
            store.getState().setTrackedFlightId(icao);
            const selectedFlight =
              currentFlightsRef.current.find((f) => f.icao === icao) ??
              (entityData.data as Flight);
            void renderFlightHighlight(viewer, selectedFlight, getInterpolatedPosition);
            void refreshTrackedPath(icao, true);
          } else if (trackedFlightIdRef.current) {
            if (focusTargetRef.current?.type === "flight") {
              releaseOrbitFocus();
            }
            trackedFlightIdRef.current = null;
            trackFetchAbortRef.current?.abort();
            trackFetchAbortRef.current = null;
            store.getState().setTrackedFlightId(null);
          }
        },
        Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK
      );
    },
    [
      focusFlightSelection,
      focusSatelliteSelection,
      getInterpolatedPosition,
      releaseOrbitFocus,
      store,
    ]
  );

  // 闁冲厜鍋撻柍鍏夊亾 Scene flying via store subscription 闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋?
  const setupSceneSubscription = useCallback(
    (viewer: Viewer) => {
      return store.subscribe(
        (s) => s.currentSceneIdx,
        (idx) => {
          const scenes = store.getState().scenes;
          const scene = scenes[idx];
          if (!scene) return;
          flyToScene(viewer, scene.lat, scene.lon, scene.altM, scene.heading, scene.pitch);
        }
      );
    },
    [store]
  );

  // 闁冲厜鍋撻柍鍏夊亾 Style preset subscription 闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾
  const setupPresetSubscription = useCallback(
    (viewer: Viewer) => {
      return store.subscribe(
        (s) => ({ preset: s.ui.stylePreset, params: s.ui }),
        ({ preset, params }) => {
          applyStylePreset(viewer, preset, {
            crtDistortion: params.crtDistortion,
            crtInstability: params.crtInstability,
            nvgBrightness: params.nvgBrightness,
            flirContrast: params.flirContrast,
            sharpen: params.sharpen,
            showBloom: params.showBloom,
          });
        },
        { equalityFn: (a, b) => a.preset === b.preset }
      );
    },
    [store]
  );

  // 闁冲厜鍋撻柍鍏夊亾 Data fetching 闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾

  const refreshTrackedPath = useCallback(async (icao: string, force = false) => {
    if (!icao) return;
    const now = Date.now();
    if (!force && now - lastTrackFetchRef.current < 60_000) return;
    lastTrackFetchRef.current = now;

    trackFetchAbortRef.current?.abort();
    const controller = new AbortController();
    trackFetchAbortRef.current = controller;
    try {
      const track = await fetchJsonWithPolicy<[number, number, number][]>(
        `/api/track?icao=${encodeURIComponent(icao)}`,
        {
          key: `track:${icao}`,
          signal: controller.signal,
          timeoutMs: 12_000,
          retries: 1,
          negativeTtlMs: 1_200,
        }
      );
      const viewer = viewerRef.current;
      if (!viewer || trackedFlightIdRef.current !== icao || track.length < 2) return;
      flightPathAccumRef.current = track;
      await renderFlightPath(viewer, track);
    } catch (error) {
      if (!isAbortError(error)) {
        console.warn("[track] refresh failed:", error);
      }
    }
  }, []);

  const flushFlightRender = useCallback(async () => {
    flightRenderTimeoutRef.current = null;
    const flights = pendingFlightsRef.current ?? currentFlightsRef.current;
    pendingFlightsRef.current = null;
    await renderFlightsIfEnabled(flights);

    const trackedId = trackedFlightIdRef.current;
    if (trackedId && viewerRef.current) {
      const tracked = flights.find((flight) => flight.icao === trackedId);
      if (tracked) {
        void renderFlightHighlight(viewerRef.current, tracked, getInterpolatedPosition);
        void refreshTrackedPath(trackedId);
      }
    }

    const total =
      currentSatsRef.current.length +
      currentFlightsRef.current.length +
      currentDisastersRef.current.length;
    store.getState().setDebug({ entityCount: total });
  }, [getInterpolatedPosition, refreshTrackedPath, renderFlightsIfEnabled, store]);

  const scheduleFlightRender = useCallback(
    (flights: Flight[]) => {
      const { layers } = store.getState();
      if (!layers.flights && !layers.military) return;
      pendingFlightsRef.current = flights;
      if (flightRenderTimeoutRef.current) return;
      flightRenderTimeoutRef.current = setTimeout(() => {
        void flushFlightRender();
      }, 90);
    },
    [flushFlightRender, store]
  );

  const applyLiveFlights = useCallback(
    (commercial: Flight[], military: Flight[]) => {
      const { layers } = store.getState();
      if (!layers.flights && !layers.military) return;

      const merged = dedupeByRecordKey(
        [
          ...(commercial ?? []).map((flight) => ({ ...flight, isMilitary: false })),
          ...(military ?? []).map((flight) => ({ ...flight, isMilitary: true })),
        ].filter((flight) => Number.isFinite(flight.lat) && Number.isFinite(flight.lon)),
        (flight) => buildRecordKey("flight", flight.icao, flight.callsign, flight.lat, flight.lon)
      ).map((flight) => ({ ...flight, icao: (flight.icao ?? "").trim().toLowerCase() }));

      // Data protection: reject suspiciously small updates
      const currentCount = currentFlightsRef.current.length;
      if (currentCount > 50 && merged.length < currentCount * 0.1) {
        console.warn(`[globe] Rejecting flight update: ${merged.length} vs ${currentCount} current`);
        return;
      }

      currentFlightsRef.current = merged;
      const receivedAt = Date.now();
      const snapshotMap = flightSnapshotsRef.current;
      const blendMap = flightBlendRef.current;
      const seen = new Set<string>();

      // Compute blend origins: for flights that already have a snapshot,
      // capture their current dead-reckoned position as the blend "from"
      for (const flight of merged) {
        if (!flight.icao) continue;
        seen.add(flight.icao);
        const existing = snapshotMap.get(flight.icao);
        if (existing) {
          const currentPos = deadReckonPosition(existing.flight, existing.receivedAt);
          blendMap.set(flight.icao, {
            fromLon: currentPos.lon,
            fromLat: currentPos.lat,
            fromAltM: currentPos.altM,
            toLon: flight.lon,
            toLat: flight.lat,
            toAltM: flight.altM ?? 0,
            blendStartMs: receivedAt,
          });
        }
        snapshotMap.set(flight.icao, { flight, receivedAt, lastSeenMs: receivedAt });
      }

      // Stale-flight aging: keep absent flights for 36s (~3 poll cycles) before removal
      for (const [icao, entry] of Array.from(snapshotMap.entries())) {
        if (!seen.has(icao)) {
          if (receivedAt - entry.lastSeenMs > 36_000) {
            snapshotMap.delete(icao);
            blendMap.delete(icao);
          }
          // else: keep — will dead-reckon from last known state
        }
      }
      scheduleFlightRender(merged);

      // Split for military correlation
      const civilianForAnomaly = merged.filter((f) => !f.isMilitary);
      const militaryForAnomaly = merged.filter((f) => f.isMilitary);
      void renderGpsJamIfEnabled(merged, militaryForAnomaly);

      // Airspace anomaly detection + disappeared flight tracking
      void renderAnomaliesIfEnabled(civilianForAnomaly, militaryForAnomaly);
    },
    [scheduleFlightRender, renderGpsJamIfEnabled, renderAnomaliesIfEnabled, store]
  );

  // 闁冲厜鍋撻柍鍏夊亾 Layer toggle subscriptions 闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋?

  const setupLayerSubscriptions = useCallback(
    (viewer: Viewer) => {
      const subs: Array<() => void> = [];

      // Satellites toggle
      subs.push(
        store.subscribe(
          (s) => s.layers.satellites,
          (enabled) => {
            if (!enabled) clearLayer(viewer, "satellites");
            else renderSatsIfEnabled(currentSatsRef.current);
          }
        )
      );

      // Flights/military toggle
      subs.push(
        store.subscribe(
          (s) => ({ flights: s.layers.flights, military: s.layers.military }),
          ({ flights, military }) => {
            if (!flights && !military) {
              // Full shutdown: clear all flight state
              clearLayer(viewer, "flights");
              flightSnapshotsRef.current.clear();
              flightBlendRef.current.clear();
              currentFlightsRef.current = [];
              pendingFlightsRef.current = null;
              if (flightRenderTimeoutRef.current) {
                clearTimeout(flightRenderTimeoutRef.current);
                flightRenderTimeoutRef.current = null;
              }
            } else {
              renderFlightsIfEnabled(currentFlightsRef.current);
            }
          },
          { equalityFn: (a, b) => a.flights === b.flights && a.military === b.military }
        )
      );

      // Live flights/military from store (dashboard feed) - avoids duplicate globe polling
      subs.push(
        store.subscribe(
          (s) => ({ flights: s.liveData.flights, military: s.liveData.military }),
          ({ flights, military }) => {
            applyLiveFlights((flights as Flight[]) ?? [], (military as Flight[]) ?? []);
          },
          { equalityFn: (a, b) => a.flights === b.flights && a.military === b.military }
        )
      );

      // Disasters toggle
      subs.push(
        store.subscribe(
          (s) => s.layers.disasters,
          (enabled) => {
            if (!enabled) clearLayer(viewer, "disasters");
            else renderDisastersIfEnabled(currentDisastersRef.current);
          }
        )
      );

      // Live disasters from store
      subs.push(
        store.subscribe(
          (s) => s.liveData.disasters,
          (disasters) => {
            currentDisastersRef.current = disasters ?? [];
            renderDisastersIfEnabled(currentDisastersRef.current);
          }
        )
      );

      // GPS/GNSS Interference layer toggle
      subs.push(
        store.subscribe(
          (s) => s.layers.gpsJam,
          (enabled) => {
            if (!enabled) {
              clearLayer(viewer, 'gps_jam');
              // Remove any orphaned data sources from overlapping async renders
              for (let i = viewer.dataSources.length - 1; i >= 0; i--) {
                const ds = viewer.dataSources.get(i);
                if (ds.name === 'gps_jam') {
                  viewer.dataSources.remove(ds, true);
                }
              }
            } else {
              const mil = currentFlightsRef.current.filter((f) => f.isMilitary);
              void renderGpsJamIfEnabled(currentFlightsRef.current, mil);
            }
          }
        )
      );

      // Airspace Anomaly layer toggle
      subs.push(
        store.subscribe(
          (s) => s.layers.airspaceAnomaly,
          (enabled) => {
            if (!enabled) {
              clearLayer(viewer, 'airspace_anomaly');
              clearLayer(viewer, 'disappeared_flights');
              // Sweep orphaned dataSources from concurrent renders
              for (let i = viewer.dataSources.length - 1; i >= 0; i--) {
                const ds = viewer.dataSources.get(i);
                if (ds.name === 'airspace_anomaly') viewer.dataSources.remove(ds, true);
              }
            } else {
              const civilian = currentFlightsRef.current.filter((f) => !f.isMilitary);
              const military = currentFlightsRef.current.filter((f) => f.isMilitary);
              void renderAnomaliesIfEnabled(civilian, military);
            }
          }
        )
      );

      // CCTV toggle
      subs.push(
        store.subscribe(
          (s) => s.layers.cctv,
          (enabled) => {
            if (!enabled) clearLayer(viewer, "cctv");
            else {
              const { cctv } = store.getState();
              const camerasForGlobe = sampleCctvForGlobe(cctv.cameras, cctv.brokenIds);
              renderCctv(viewer, camerasForGlobe, cctv.calibrations);
            }
          }
        )
      );

      // Live CCTV data updates (cameras list or broken status changed)
      subs.push(
        store.subscribe(
          (s) => ({ cameras: s.cctv.cameras, brokenIds: s.cctv.brokenIds }),
          ({ cameras, brokenIds }) => {
            if (!store.getState().layers.cctv) return;
            const camerasForGlobe = sampleCctvForGlobe(cameras, brokenIds);
            const { calibrations } = store.getState().cctv;
            renderCctv(viewer, camerasForGlobe, calibrations);
          },
          { equalityFn: (a, b) => a.cameras === b.cameras && a.brokenIds === b.brokenIds }
        )
      );

      // Trade Routes layer toggle
      subs.push(
        store.subscribe(
          (s) => s.layers.tradeRoutes,
          (enabled) => {
            if (!enabled) {
              clearTradeRoutesLayer(viewer);
            } else {
              const sel = store.getState().tradeRouteSelection;
              renderTradeRoutesLayer(viewer, {
                categoryFilters: sel.categoryFilters,
                selectedRouteId: sel.selectedRouteId,
                hoveredRouteId: sel.hoveredRouteId,
                selectedNodeId: sel.selectedNodeId,
                hoveredNodeId: sel.hoveredNodeId,
              });
            }
          }
        )
      );

      // Volcanoes layer toggle
      subs.push(
        store.subscribe(
          (s) => s.layers.volcanoes,
          (enabled) => {
            if (!enabled) clearLayer(viewer, 'volcanoes');
            else if (volcanoDataRef.current.length) renderVolcanoes(viewer, volcanoDataRef.current);
          }
        )
      );

      // Nuclear Sites layer toggle
      subs.push(
        store.subscribe(
          (s) => s.layers.nuclearSites,
          (enabled) => {
            if (!enabled) clearLayer(viewer, 'nuclear_sites');
            else if (nuclearSitesDataRef.current.length) renderNuclearSites(viewer, nuclearSitesDataRef.current);
          }
        )
      );

      // Military Bases layer toggle
      subs.push(
        store.subscribe(
          (s) => s.layers.militaryBases,
          (enabled) => {
            if (!enabled) clearLayer(viewer, 'military_bases');
            else if (militaryBasesDataRef.current.length) renderMilitaryBases(viewer, militaryBasesDataRef.current);
          }
        )
      );

      // Country Borders layer toggle
      subs.push(
        store.subscribe(
          (s) => s.layers.countryBorders,
          (enabled) => {
            if (!enabled) clearLayer(viewer, 'country_borders');
            else if (countryBordersDataRef.current.length) renderCountryBorders(viewer, countryBordersDataRef.current);
          }
        )
      );

      // Trade Routes category filter / selection changes
      subs.push(
        store.subscribe(
          (s) => s.tradeRouteSelection,
          (sel) => {
            if (!store.getState().layers.tradeRoutes) return;
            const handle = getActiveTradeRouteHandle();
            if (handle) {
              handle.updateState({
                categoryFilters: sel.categoryFilters,
                selectedRouteId: sel.selectedRouteId,
                hoveredRouteId: sel.hoveredRouteId,
                selectedNodeId: sel.selectedNodeId,
                hoveredNodeId: sel.hoveredNodeId,
              });
            }
          }
        )
      );

      // Detect mode subscription (affects label density)
      subs.push(
        store.subscribe(
          (s) => s.ui.detectMode,
          () => renderSatsIfEnabled(currentSatsRef.current)
        )
      );

      // Filter changes
      subs.push(
        store.subscribe(
          (s) => s.filters,
          () => renderFlightsIfEnabled(currentFlightsRef.current),
          { equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b) }
        )
      );

      // Orbit path from worker
      subs.push(
        store.subscribe(
          (s) => s.selection.historyTrail,
          (trail) => {
            const { trackingId } = store.getState().selection;
            if (trackingId && trail.length > 1) {
              renderOrbitPath(viewer, trackingId, trail);
            }
          }
        )
      );

      return () => subs.forEach((u) => u());
    },
    [
      store,
      renderSatsIfEnabled,
      renderFlightsIfEnabled,
      applyLiveFlights,
      renderDisastersIfEnabled,
      renderGpsJamIfEnabled,
      renderAnomaliesIfEnabled,
    ]
  );

  // 闁冲厜鍋撻柍鍏夊亾 Main initialization effect 闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋?
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (e.key === "Escape") {
        releaseOrbitFocus();
        store.getState().clearSelectionContext();
        return;
      }
      if (key === "h") {
        void gotoHome();
        return;
      }
      if (key === "n") {
        setNorthUp();
        return;
      }
      if (key === "t") {
        setTopDown();
        return;
      }
      if (key === "o") {
        setOblique();
        return;
      }
      if (key === "+" || key === "=") {
        e.preventDefault();
        zoomIn();
        return;
      }
      if (key === "-") {
        e.preventDefault();
        zoomOut();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        void nudgeCardinal("N");
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        void nudgeCardinal("S");
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        void nudgeCardinal("W");
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        void nudgeCardinal("E");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    gotoHome,
    nudgeCardinal,
    releaseOrbitFocus,
    setNorthUp,
    setOblique,
    setTopDown,
    zoomIn,
    zoomOut,
  ]);

  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;
    const unsubscribers: Array<() => void> = [];

    async function init() {
      // Dynamic import: never runs on server
      const { initViewer } = await import("../lib/cesium/viewer");
      if (destroyed || !containerRef.current) return;

      const viewer = await initViewer(containerRef.current);
      viewerRef.current = viewer;
      if (disableZoom) {
        viewer.scene.screenSpaceCameraController.enableZoom = false;
      }
      updateCameraSnapshot();
      intervalsRef.current.push(setInterval(updateCameraSnapshot, 250));

      // Apply initial style preset
      const { ui } = store.getState();
      await applyStylePreset(viewer, ui.stylePreset, ui);

      // 闁冲厜鍋撻柍鍏夊亾 Satellite worker 闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋?
      const satWorker = new Worker(
        new URL("../workers/satellite.worker.ts", import.meta.url)
      );
      satWorkerRef.current = satWorker;

      satWorker.onmessage = async (e: MessageEvent<SatWorkerOutMessage>) => {
        if (e.data.type === "POSITIONS" && e.data.positions) {
          currentSatsRef.current = e.data.positions;
          store.getState().setLiveSatellites(e.data.positions);
          store.getState().markFeedUpdated("satellites");
          if (store.getState().layers.satellites) {
            await renderSatsIfEnabled(e.data.positions);
          }
          const total =
            e.data.positions.length +
            currentFlightsRef.current.length +
            currentDisastersRef.current.length;
          store.getState().setDebug({ entityCount: total });
        }

        if (
          e.data.type === "ORBIT_PATH" &&
          e.data.path &&
          e.data.noradId
        ) {
          if (
            focusTargetRef.current?.type === "satellite" &&
            focusTargetRef.current.id === e.data.noradId
          ) {
            store.getState().setHistoryTrail(e.data.path);
            await renderOrbitPath(viewer, e.data.noradId, e.data.path);
          }
        }
      };

      // Initial TLE load for worker boot.
      const seededCatalog = store.getState().liveData.satelliteCatalog ?? [];
      if (seededCatalog.length > 0) {
        postCatalogToSatelliteWorker(seededCatalog as Satellite[]);
      } else {
        try {
          const tles = await fetchJsonWithPolicy<Satellite[]>("/api/satellites", {
            key: "globe:satellites:init",
            timeoutMs: 20_000,
            retries: 1,
            negativeTtlMs: 3_000,
          });
          postCatalogToSatelliteWorker(tles);
        } catch (err) {
          if (!isAbortError(err)) {
            console.warn("[globe] satellite TLE fetch error:", err);
          }
        }
      }

      // Keep worker TLEs synced with dashboard feed updates.
      unsubscribers.push(
        store.subscribe(
          (s) => s.liveData.satelliteCatalog,
          (catalog) => {
            postCatalogToSatelliteWorker(catalog as Satellite[]);
          }
        )
      );

      // 闁冲厜鍋撻柍鍏夊亾 Traffic worker 闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋?
      // 闁冲厜鍋撻柍鍏夊亾 Polling intervals 闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾
      const seededLiveData = store.getState().liveData;
      applyLiveFlights(
        (seededLiveData.flights as Flight[]) ?? [],
        (seededLiveData.military as Flight[]) ?? []
      );
      currentDisastersRef.current = (seededLiveData.disasters as DisasterAlert[]) ?? [];
      try { await renderDisastersIfEnabled(currentDisastersRef.current); } catch (err) { console.warn("[globe] disaster render error:", err); }
      try { const milSeed = currentFlightsRef.current.filter((f) => f.isMilitary); await renderGpsJamIfEnabled(currentFlightsRef.current, milSeed); } catch (err) { console.warn("[globe] gps jam render error:", err); }
      try {
        const civ = currentFlightsRef.current.filter((f) => !f.isMilitary);
        const mil = currentFlightsRef.current.filter((f) => f.isMilitary);
        await renderAnomaliesIfEnabled(civ, mil);
      } catch (err) { console.warn("[globe] airspace anomaly render error:", err); }

      // 闁冲厜鍋撻柍鍏夊亾 Load CCTV cameras 闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾
      try {
        const cameras = await fetchAllCctvCameras();
        store.getState().setCameras(cameras);
        store.getState().setLiveCctv(cameras);
        store.getState().markFeedUpdated("cctv");
        if (store.getState().layers.cctv) {
          const { cctv } = store.getState();
          const camerasForGlobe = sampleCctvForGlobe(cameras, cctv.brokenIds);
          const { calibrations } = cctv;
          renderCctv(viewer, camerasForGlobe, calibrations);
        }
      } catch {
        // CCTV data optional
      }

      // Load static GeoJSON layers (volcanoes, nuclear sites, military bases, country borders)
      try {
        const [volcGeo, nukeGeo, milBaseGeo, borderGeo] = await Promise.all([
          fetch('/data/news-layers/volcanoes.geojson').then(r => r.json()),
          fetch('/data/news-layers/nuclear-sites.geojson').then(r => r.json()),
          fetch('/data/news-layers/military-bases.geojson').then(r => r.json()),
          fetch('/data/news-layers/country-borders.geojson').then(r => r.json()),
        ]);
        volcanoDataRef.current = volcGeo.features ?? [];
        nuclearSitesDataRef.current = nukeGeo.features ?? [];
        militaryBasesDataRef.current = milBaseGeo.features ?? [];
        countryBordersDataRef.current = borderGeo.features ?? [];
        const currentLayers = store.getState().layers;
        if (currentLayers.volcanoes) await renderVolcanoes(viewer, volcanoDataRef.current);
        if (currentLayers.nuclearSites) await renderNuclearSites(viewer, nuclearSitesDataRef.current);
        if (currentLayers.militaryBases) await renderMilitaryBases(viewer, militaryBasesDataRef.current);
        if (currentLayers.countryBorders) await renderCountryBorders(viewer, countryBordersDataRef.current);
      } catch (err) {
        console.warn("[globe] static GeoJSON layer load error:", err);
      }

      // 闁冲厜鍋撻柍鍏夊亾 Load scenes 闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾
      try {
        const scenes = await fetchJsonWithPolicy<Scene[]>("/data/scenes.json", {
          key: "globe:scenes",
          timeoutMs: 8_000,
          retries: 1,
          negativeTtlMs: 4_000,
        });
        store.getState().setScenes(scenes);
        store.getState().setLiveScenes(scenes);
        store.getState().markFeedUpdated("scenes");
      } catch {
        // Scenes optional
      }

      // 闁冲厜鍋撻柍鍏夊亾 Subscriptions 闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾
      setupFpsTracking(viewer);
      unsubscribers.push(setupLayerSubscriptions(viewer));
      try {
        if (store.getState().layers.tradeRoutes) {
          const sel = store.getState().tradeRouteSelection;
          await renderTradeRoutesLayer(viewer, {
            categoryFilters: sel.categoryFilters,
            selectedRouteId: sel.selectedRouteId,
            hoveredRouteId: sel.hoveredRouteId,
            selectedNodeId: sel.selectedNodeId,
            hoveredNodeId: sel.hoveredNodeId,
          });
        }
      } catch (err) { console.warn("[globe] trade routes render error:", err); }
      unsubscribers.push(setupSceneSubscription(viewer));
      unsubscribers.push(setupPresetSubscription(viewer));
      try { await setupClickHandler(viewer); } catch (err) { console.warn("[globe] click handler setup error:", err); }

      // 闁冲厜鍋撻柍鍏夊亾 Flight camera tracking (postRender for smooth 60fps follow) 闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾
      const CesiumMod = await import("cesium");
      cesiumRef.current = CesiumMod;

      // Update flight and highlight positions before each frame (sync in preRender so they are visible)
      let tradeRouteFrame = 0;
      let lastFlightUpdateMs = 0;
      const FLIGHT_UPDATE_INTERVAL_MS = 200; // 5fps throttle for flight position updates

      const onPreRender = () => {
        const CesiumMod = cesiumRef.current;
        if (!CesiumMod) return;
        const { layers } = store.getState();
        if ((layers.flights || layers.military) && flightSnapshotsRef.current.size > 0) {
          const now = performance.now();
          if (now - lastFlightUpdateMs >= FLIGHT_UPDATE_INTERVAL_MS) {
            lastFlightUpdateMs = now;
            updateFlightPositions(viewer, getInterpolatedPosition, CesiumMod);
          }
          // Hide vector lines when zoomed out beyond 6M m (too cluttered at global scale)
          const cameraAltM = viewer.camera.positionCartographic.height;
          setFlightVectorsVisible(viewer, cameraAltM < 6_000_000);
        }
        if (layers.tradeRoutes) {
          tickTradeRouteAnimation(tradeRouteFrame++);
        }
      };
      viewer.scene.preRender.addEventListener(onPreRender);
      unsubscribers.push(() => {
        try {
          viewer.scene.preRender.removeEventListener(onPreRender);
        } catch {
          // ignore if viewer destroyed
        }
      });

      viewer.scene.postRender.addEventListener(() => {
        const target = focusTargetRef.current;
        if (!target) return;
        if (!followTrackedFlightRef.current) return;
        let pos: import("cesium").Cartesian3 | null = null;
        let minRange = 2_000;

        if (target.type === "flight") {
          const interp = getInterpolatedPosition(target.id);
          if (interp) {
            pos = CesiumMod.Cartesian3.fromDegrees(
              interp.lon,
              interp.lat,
              interp.altM + 500
            );
          } else {
            const flight = currentFlightsRef.current.find((f) => f.icao === target.id);
            if (!flight) return;
            pos = CesiumMod.Cartesian3.fromDegrees(
              flight.lon,
              flight.lat,
              (flight.altM ?? 0) + 500
            );
          }
          minRange = 2_000;
        } else {
          const sat = currentSatsRef.current.find((s) => s.noradId === target.id);
          if (!sat) return;
          pos = CesiumMod.Cartesian3.fromDegrees(
            sat.lon,
            sat.lat,
            Math.max(0, sat.altKm) * 1000
          );
          minRange = 10_000;
        }

        const range = Math.max(
          minRange,
          CesiumMod.Cartesian3.distance(viewer.camera.positionWC, pos)
        );
        viewer.camera.lookAt(
          pos,
          new CesiumMod.HeadingPitchRange(
            viewer.camera.heading,
            viewer.camera.pitch,
            range
          )
        );
        lookAtInitializedRef.current = true;
      });

      // Subscribe to trackedFlightId to clear layers when tracking stops
      unsubscribers.push(
        store.subscribe(
          (s) => s.selection.trackedFlightId,
          (id) => {
            const normalizedId = id ? String(id).trim().toLowerCase() : null;
            trackedFlightIdRef.current = normalizedId;
            if (!normalizedId) {
              lastTrackFetchRef.current = 0;
              trackFetchAbortRef.current?.abort();
              trackFetchAbortRef.current = null;
              clearLayer(viewer, "flight_highlight");
              clearLayer(viewer, "flight_path");
              flightPathAccumRef.current = [];
              if (focusTargetRef.current?.type === "flight") {
                releaseOrbitFocus();
              }
            }
          }
        )
      );

      // Clear orbit focus when selection is cleared from any UI path.
      unsubscribers.push(
        store.subscribe(
          (s) => s.selection.selectedEntity,
          (entity) => {
            if (entity) return;
            if (!focusTargetRef.current) return;
            releaseOrbitFocus();
          }
        )
      );

      // Center camera on flight/satellite whenever one is selected (globe click or panel/list).
      unsubscribers.push(
        store.subscribe(
          (s) => s.selection.selectedEntity,
          (entity) => {
            if (!entity || !viewer || viewer.isDestroyed()) return;
            if (entity.type === "flight") {
              const flight = entity.data as Flight;
              if (flight && typeof flight.lat === "number" && typeof flight.lon === "number") {
                void focusFlightSelection(viewer, flight);
              }
            } else if (entity.type === "satellite") {
              const sat = entity.data as PropagatedSat;
              if (sat && typeof sat.lat === "number" && typeof sat.lon === "number") {
                void focusSatelliteSelection(viewer, sat);
              }
            }
          }
        )
      );

      if (!destroyed) {
        onReady?.();
      }
    }

    init().catch(console.error);

    return () => {
      destroyed = true;
      unsubscribers.forEach((u) => u());
      intervalsRef.current.forEach(clearInterval);
      intervalsRef.current = [];
      if (flightRenderTimeoutRef.current) {
        clearTimeout(flightRenderTimeoutRef.current);
        flightRenderTimeoutRef.current = null;
      }
      pendingFlightsRef.current = null;
      trackFetchAbortRef.current?.abort();
      trackFetchAbortRef.current = null;
      satWorkerRef.current?.terminate();
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}>
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
      />
      {hoverNewsTip ? (
        <div
          style={{
            position: "absolute",
            left: hoverNewsTip.x,
            top: hoverNewsTip.y,
            pointerEvents: "none",
            border: "1px solid rgba(123, 152, 177, 0.75)",
            background: "rgba(9, 14, 20, 0.92)",
            color: "#d8e0ea",
            padding: "4px 6px",
            fontSize: "11px",
            maxWidth: "320px",
            zIndex: 18,
          }}
        >
          <div style={{ color: "#f4d03f", marginBottom: 2 }}>{hoverNewsTip.headline}</div>
          <div style={{ opacity: 0.8 }}>
            {hoverNewsTip.source} | {new Date(hoverNewsTip.publishedAt).toISOString().slice(11, 19)}Z
          </div>
        </div>
      ) : null}
    </div>
  );
}







