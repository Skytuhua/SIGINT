"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useWorldViewStore } from "../store";
import { flyToScene, DEFAULT_HOME_VIEW } from "../lib/cesium/viewer";
import {
  renderSatellites,
  renderFlights,
  renderEarthquakes,
  renderDisasterAlerts,
  renderTraffic,
  renderCctv,
  renderNewsMarkers,
  renderOrbitPath,
  renderFlightHighlight,
  renderFlightPath,
  renderSatelliteHighlight,
  clearLayer,
  clearAllOrbitLayers,
  updateFlightPositions,
} from "../lib/cesium/layers";
import { applyStylePreset } from "../lib/cesium/postprocess";
import type {
  PropagatedSat,
  Flight,
  Earthquake,
  DisasterAlert,
  Vehicle,
  EntityData,
  Satellite,
  Scene,
  CctvCamera,
} from "../lib/providers/types";
import { fetchAllCctvCameras } from "../lib/cctv/sources";
import { fetchJsonWithPolicy, isAbortError } from "../lib/runtime/fetchJson";
import { buildRecordKey, dedupeByRecordKey } from "../lib/runtime/normalize";
import type { GeoMarker } from "../lib/news/types";
import type { Viewer } from "cesium";

// 闁冲厜鍋撻柍鍏夊亾闁冲厜鍋?Types for worker messages 闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾
interface SatWorkerOutMessage {
  type: "POSITIONS" | "ORBIT_PATH" | "TLE_LOADED";
  positions?: PropagatedSat[];
  path?: [number, number, number][];
  noradId?: string;
  count?: number;
}

interface TrafficWorkerOutMessage {
  type: "VEHICLES" | "READY";
  vehicles?: Vehicle[];
  agentCount?: number;
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
  brokenIds: Record<string, boolean>
): CctvCamera[] {
  const healthy = cameras.filter((cam) => cam.snapshotUrl && !brokenIds[cam.id]);
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
function interpolateFlightPosition(
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
  const trafficWorkerRef = useRef<Worker | null>(null);
  const trackFetchAbortRef = useRef<AbortController | null>(null);
  const flightRenderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFlightsRef = useRef<Flight[] | null>(null);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const fpsFrameRef = useRef({ lastTime: 0, frames: 0 });
  const currentSatsRef = useRef<PropagatedSat[]>([]);
  const currentFlightsRef = useRef<Flight[]>([]);
  const currentEarthquakesRef = useRef<Earthquake[]>([]);
  const currentDisastersRef = useRef<DisasterAlert[]>([]);
  const currentNewsMarkersRef = useRef<GeoMarker[]>([]);
  const trackedFlightIdRef = useRef<string | null>(null);
  const followTrackedFlightRef = useRef(false);
  const focusTargetRef = useRef<OrbitFocusTarget | null>(null);
  const flightPathAccumRef = useRef<[number, number, number][]>([]);
  const lookAtInitializedRef = useRef(false);
  const lastTrackFetchRef = useRef<number>(0);
  const flightSnapshotsRef = useRef<
    Map<string, { flight: Flight; receivedAt: number }>
  >(new Map());
  const lastTleSignatureRef = useRef("");
  const cesiumRef = useRef<typeof import("cesium") | null>(null);
  const googleMapsNavRef = useRef<import("../lib/cesium/googleMapsNav").GoogleMapsNav | null>(null);
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
  const store = useWorldViewStore;

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
      return interpolateFlightPosition(entry.flight, entry.receivedAt);
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

  const renderEarthquakesIfEnabled = useCallback(
    async (quakes: Earthquake[]) => {
      const { layers, filters } = store.getState();
      if (!viewerRef.current) return;
      if (!layers.earthquakes) {
        clearLayer(viewerRef.current, "earthquakes");
        return;
      }
      const filtered = quakes.filter(
        (q) =>
          q.mag >= filters.minMagnitude && q.mag <= filters.maxMagnitude
      );
      await renderEarthquakes(viewerRef.current, filtered);
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

  const renderNewsIfEnabled = useCallback(
    async (markers: GeoMarker[]) => {
      const { layers, news } = store.getState();
      if (!viewerRef.current) return;
      if (!layers.news) {
        clearLayer(viewerRef.current, "news");
        return;
      }
      await renderNewsMarkers(viewerRef.current, markers, {
        highlightedMarkerId: news.highlightedMarkerId,
        enableClustering: true,
      });
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
            return;
          }
          // Single click on an icon does nothing; selection is on double click
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
      currentEarthquakesRef.current.length +
      currentDisastersRef.current.length;
    store.getState().setDebug({ entityCount: total });
  }, [getInterpolatedPosition, refreshTrackedPath, renderFlightsIfEnabled, store]);

  const scheduleFlightRender = useCallback(
    (flights: Flight[]) => {
      pendingFlightsRef.current = flights;
      if (flightRenderTimeoutRef.current) return;
      flightRenderTimeoutRef.current = setTimeout(() => {
        void flushFlightRender();
      }, 90);
    },
    [flushFlightRender]
  );

  const applyLiveFlights = useCallback(
    (commercial: Flight[], military: Flight[]) => {
      const merged = dedupeByRecordKey(
        [
          ...(commercial ?? []).map((flight) => ({ ...flight, isMilitary: false })),
          ...(military ?? []).map((flight) => ({ ...flight, isMilitary: true })),
        ].filter((flight) => Number.isFinite(flight.lat) && Number.isFinite(flight.lon)),
        (flight) => buildRecordKey("flight", flight.icao, flight.callsign, flight.lat, flight.lon)
      ).map((flight) => ({ ...flight, icao: (flight.icao ?? "").trim().toLowerCase() }));

      currentFlightsRef.current = merged;
      const receivedAt = Date.now();
      const snapshotMap = flightSnapshotsRef.current;
      const seen = new Set<string>();
      for (const flight of merged) {
        if (!flight.icao) continue;
        seen.add(flight.icao);
        snapshotMap.set(flight.icao, { flight, receivedAt });
      }
      for (const icao of Array.from(snapshotMap.keys())) {
        if (!seen.has(icao)) snapshotMap.delete(icao);
      }
      scheduleFlightRender(merged);
    },
    [scheduleFlightRender]
  );

  const fetchAndSendRoads = useCallback(async () => {
    if (!trafficWorkerRef.current) return;
    try {
      const roads = await fetchJsonWithPolicy<any[]>("/api/overpass", {
        key: "globe:roads",
        timeoutMs: 15_000,
        retries: 1,
        negativeTtlMs: 5_000,
      });
      if (roads.length > 0) {
        trafficWorkerRef.current.postMessage({ type: "SET_ROADS", roads });
      }
    } catch (err) {
      if (!isAbortError(err)) {
        console.warn("[globe] overpass fetch error:", err);
      }
    }
  }, []);

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
          () => renderFlightsIfEnabled(currentFlightsRef.current),
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

      // Earthquakes toggle
      subs.push(
        store.subscribe(
          (s) => s.layers.earthquakes,
          (enabled) => {
            if (!enabled) clearLayer(viewer, "earthquakes");
            else renderEarthquakesIfEnabled(currentEarthquakesRef.current);
          }
        )
      );

      // Live earthquakes from store (dashboard feed) — keep globe in sync when feed updates
      subs.push(
        store.subscribe(
          (s) => s.liveData.earthquakes,
          (earthquakes) => {
            currentEarthquakesRef.current = earthquakes ?? [];
            renderEarthquakesIfEnabled(currentEarthquakesRef.current);
            const total =
              currentSatsRef.current.length +
              currentFlightsRef.current.length +
              currentEarthquakesRef.current.length +
              currentDisastersRef.current.length;
            store.getState().setDebug({ entityCount: total });
          }
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

      // Traffic toggle
      subs.push(
        store.subscribe(
          (s) => s.layers.traffic,
          (enabled) => {
            if (!enabled) {
              clearLayer(viewer, "traffic");
              trafficWorkerRef.current?.postMessage({ type: "STOP" });
            } else {
              fetchAndSendRoads();
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

      // News layer toggle
      subs.push(
        store.subscribe(
          (s) => s.layers.news,
          (enabled) => {
            if (!enabled) {
              clearLayer(viewer, "news");
            } else {
              renderNewsIfEnabled(currentNewsMarkersRef.current);
            }
          }
        )
      );

      // News markers updates
      subs.push(
        store.subscribe(
          (s) => s.news.markers,
          (markers) => {
            currentNewsMarkersRef.current = markers;
            renderNewsIfEnabled(markers);
          }
        )
      );

      // News highlight updates
      subs.push(
        store.subscribe(
          (s) => s.news.highlightedMarkerId,
          () => renderNewsIfEnabled(currentNewsMarkersRef.current)
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
          () => {
            renderFlightsIfEnabled(currentFlightsRef.current);
            renderEarthquakesIfEnabled(currentEarthquakesRef.current);
          },
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
      renderEarthquakesIfEnabled,
      renderDisastersIfEnabled,
      renderNewsIfEnabled,
      fetchAndSendRoads,
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
            currentEarthquakesRef.current.length +
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
      const trafficWorker = new Worker(
        new URL("../workers/traffic.worker.ts", import.meta.url)
      );
      trafficWorkerRef.current = trafficWorker;

      trafficWorker.onmessage = async (
        e: MessageEvent<TrafficWorkerOutMessage>
      ) => {
        if (e.data.type === "VEHICLES" && e.data.vehicles) {
          if (store.getState().layers.traffic) {
            await renderTraffic(viewer, e.data.vehicles);
          }
        }
      };

      // Fetch roads if traffic layer is enabled
      if (store.getState().layers.traffic) {
        fetchAndSendRoads();
      }

      // 闁冲厜鍋撻柍鍏夊亾 Polling intervals 闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾
      const seededLiveData = store.getState().liveData;
      applyLiveFlights(
        (seededLiveData.flights as Flight[]) ?? [],
        (seededLiveData.military as Flight[]) ?? []
      );
      currentEarthquakesRef.current = (seededLiveData.earthquakes as Earthquake[]) ?? [];
      await renderEarthquakesIfEnabled(currentEarthquakesRef.current);
      currentDisastersRef.current = (seededLiveData.disasters as DisasterAlert[]) ?? [];
      await renderDisastersIfEnabled(currentDisastersRef.current);

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
      currentNewsMarkersRef.current = store.getState().news.markers;
      if (store.getState().layers.news) {
        await renderNewsIfEnabled(currentNewsMarkersRef.current);
      }
      unsubscribers.push(setupSceneSubscription(viewer));
      unsubscribers.push(setupPresetSubscription(viewer));
      await setupClickHandler(viewer);

      // 闁冲厜鍋撻柍鍏夊亾 Flight camera tracking (postRender for smooth 60fps follow) 闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾闁冲厜鍋撻柍鍏夊亾
      const CesiumMod = await import("cesium");
      cesiumRef.current = CesiumMod;

      // ── Google Maps–style navigation ─────────────────────────────────────
      if (!destroyed) {
        const { GoogleMapsNav } = await import("../lib/cesium/googleMapsNav");
        const nav = new GoogleMapsNav(viewer, CesiumMod, {
          disableZoom,
          getOrbitTarget: () => {
            const t = focusTargetRef.current;
            if (!t) return null;
            if (t.type === "flight") {
              const interp = getInterpolatedPosition(t.id);
              if (interp)
                return CesiumMod.Cartesian3.fromDegrees(
                  interp.lon,
                  interp.lat,
                  interp.altM + 500
                );
              const f = currentFlightsRef.current.find((x) => x.icao === t.id);
              if (f)
                return CesiumMod.Cartesian3.fromDegrees(
                  f.lon,
                  f.lat,
                  (f.altM ?? 0) + 500
                );
              return null;
            }
            const sat = currentSatsRef.current.find((s) => s.noradId === t.id);
            if (sat)
              return CesiumMod.Cartesian3.fromDegrees(
                sat.lon,
                sat.lat,
                Math.max(0, sat.altKm) * 1000
              );
            return null;
          },
        });
        nav.enable();
        googleMapsNavRef.current = nav;
      }

      // Update flight and highlight positions before each frame (sync in preRender so they are visible)
      const onPreRender = () => {
        const CesiumMod = cesiumRef.current;
        if (!CesiumMod) return;
        const { layers } = store.getState();
        if ((layers.flights || layers.military) && flightSnapshotsRef.current.size > 0) {
          updateFlightPositions(viewer, getInterpolatedPosition, CesiumMod);
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
      trafficWorkerRef.current?.postMessage({ type: "STOP" });
      trafficWorkerRef.current?.terminate();
      googleMapsNavRef.current?.destroy();
      googleMapsNavRef.current = null;
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







