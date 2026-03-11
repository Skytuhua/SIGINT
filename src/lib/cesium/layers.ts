// layers.ts 閳?Pure Cesium render functions for each data layer.
// No React, no store access 閳?take data as parameters and return cleanup handles.
// Must only be called after the Cesium Viewer is initialized.

import type {
  PropagatedSat,
  Flight,
  GpsJamZone,
  AirspaceAnomalyZone,
  DisappearedFlight,
  Earthquake,
  DisasterAlert,
  Vehicle,
  CctvCamera,
  CameraCalibration,
} from '../providers/types';
import type { GeoMarker } from "../news/types";

// 閳光偓閳光偓閳光偓 Shared layer tracking 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓
// We store named primitive collections on the viewer object via a WeakMap
// so we can find and replace them on each render call.

type LayerHandle = {
  remove: () => void;
  billboards?: import('cesium').BillboardCollection;
  labels?: import('cesium').LabelCollection;
  polylines?: import('cesium').PolylineCollection;
  dataSource?: import("cesium").CustomDataSource;
  entityById?: Map<string, import("cesium").Entity>;
};

const layerCollections = new WeakMap<object, Map<string, LayerHandle>>();

function getLayerMap(viewer: object): Map<string, LayerHandle> {
  if (!layerCollections.has(viewer)) {
    layerCollections.set(viewer, new Map());
  }
  return layerCollections.get(viewer)!;
}

function isViewerAlive(viewer: import('cesium').Viewer | null | undefined): viewer is import('cesium').Viewer {
  return Boolean(viewer && !viewer.isDestroyed());
}

function getViewerEntities(viewer: import('cesium').Viewer): import('cesium').EntityCollection | null {
  try {
    return viewer.entities ?? null;
  } catch {
    return null;
  }
}

export function clearLayer(viewer: import('cesium').Viewer, name: string): void {
  if (!isViewerAlive(viewer)) return;
  const map = getLayerMap(viewer);
  const handle = map.get(name);
  if (handle) {
    handle.remove();
    map.delete(name);
  }
}

/** Remove all orbit path layers so only the selected satellite's path is shown. */
export function clearAllOrbitLayers(viewer: import('cesium').Viewer): void {
  if (!isViewerAlive(viewer)) return;
  const map = getLayerMap(viewer);
  for (const key of Array.from(map.keys())) {
    if (key.startsWith('orbit_')) {
      const handle = map.get(key);
      if (handle) {
        handle.remove();
        map.delete(key);
      }
    }
  }
}

// 閳光偓閳光偓閳光偓 Satellite layer 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓

const SAT_COLORS = {
  leo: '#00e5ff',  // LEO: cyan
  meo: '#76ff03',  // MEO: lime
  geo: '#ffab40',  // GEO: amber
  heo: '#ea80fc',  // HEO: purple
};

function satColor(altKm: number, isGeo?: boolean) {
  if (isGeo) return SAT_COLORS.geo;
  if (altKm < 2000) return SAT_COLORS.leo;
  if (altKm < 35_000) return SAT_COLORS.meo;
  return SAT_COLORS.heo;
}

export async function renderSatellites(
  viewer: import('cesium').Viewer,
  positions: PropagatedSat[],
  detectMode: 'off' | 'sparse' | 'full'
): Promise<void> {
  if (!isViewerAlive(viewer)) return;
  const Cesium = await import('cesium');
  clearLayer(viewer, 'satellites');
  if (!isViewerAlive(viewer)) return;

  const billboards = new Cesium.BillboardCollection({ scene: viewer.scene });
  const labels = new Cesium.LabelCollection();

  for (const sat of positions) {
    const color = satColor(sat.altKm, sat.isGeo);
    const [r, g, b] = hexToRgb(color);
    const altM = sat.altKm * 1000;

    billboards.add({
      position: Cesium.Cartesian3.fromDegrees(sat.lon, sat.lat, altM),
      image: createDotCanvas(4, color),
      color: new Cesium.Color(r, g, b, 1.0),
      id: { type: 'satellite', id: sat.noradId, data: sat },
      scaleByDistance: new Cesium.NearFarScalar(1e6, 0.7, 2e7, 0.35),
      translucencyByDistance: new Cesium.NearFarScalar(1e7, 1.0, 5e7, 0.75),
    });

    if (detectMode === 'full') {
      labels.add({
        position: Cesium.Cartesian3.fromDegrees(sat.lon, sat.lat, altM),
        text: sat.name,
        font: '10px monospace',
        fillColor: new Cesium.Color(r, g, b, 0.85),
        style: Cesium.LabelStyle.FILL,
        pixelOffset: new Cesium.Cartesian2(8, 0),
        scaleByDistance: new Cesium.NearFarScalar(1e6, 1.0, 2e7, 0.0),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 1e7),
      });
    }
  }

  viewer.scene.primitives.add(billboards);
  viewer.scene.primitives.add(labels);

  const map = getLayerMap(viewer);
  map.set('satellites', {
    remove: () => {
      if (!billboards.isDestroyed()) viewer.scene.primitives.remove(billboards);
      if (!labels.isDestroyed()) viewer.scene.primitives.remove(labels);
    },
  });
}

// 閳光偓閳光偓閳光偓 Flight layer 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓

export async function renderFlights(
  viewer: import('cesium').Viewer,
  flights: Flight[],
  filters: { minAltM: number; maxAltM: number; onGroundVisible: boolean }
): Promise<void> {
  if (!isViewerAlive(viewer)) return;
  const Cesium = await import('cesium');
  clearLayer(viewer, 'flights');
  if (!isViewerAlive(viewer)) return;

  const billboards = new Cesium.BillboardCollection({ scene: viewer.scene });
  const labels = new Cesium.LabelCollection();
  const vectors = new Cesium.PolylineCollection();

  const filtered = flights.filter((f) => {
    if (!filters.onGroundVisible && f.onGround) return false;
    const alt = f.altM ?? 0;
    return alt >= filters.minAltM && alt <= filters.maxAltM;
  });

  for (const flight of filtered) {
    const isMil = Boolean(flight.isMilitary);
    const altM = flight.altM ?? 0;
    const renderAltM = isMil ? Math.max(180, altM) : Math.max(80, altM);
    const heading = flight.heading ?? 0;
    const nearScale = isMil ? 1.2 : 1.2;
    const farScale = isMil ? 0.68 : 0.68;
    const farAlpha = isMil ? 0.5 : 0.72;

    // Emergency squawk color override
    const squawkStr = String(flight.squawk ?? '');
    let billboardColor = new Cesium.Color(1.0, 1.0, 1.0, 1.0);
    let isEmergency = false;
    if (squawkStr === '7700') {
      billboardColor = new Cesium.Color(1.0, 0.18, 0.18, 1.0); // red — general emergency
      isEmergency = true;
    } else if (squawkStr === '7500') {
      billboardColor = new Cesium.Color(1.0, 0.6, 0.1, 1.0);  // amber — hijack
      isEmergency = true;
    } else if (squawkStr === '7600') {
      billboardColor = new Cesium.Color(1.0, 1.0, 0.2, 1.0);  // yellow — radio failure
      isEmergency = true;
    }

    billboards.add({
      position: Cesium.Cartesian3.fromDegrees(flight.lon, flight.lat, renderAltM),
      image: createPlaneCanvas('#ffffff', 22, isMil),
      rotation: Cesium.Math.toRadians(-heading),
      alignedAxis: Cesium.Cartesian3.UNIT_Z,
      id: { type: 'flight', id: flight.icao, data: flight },
      disableDepthTestDistance: 3_000_000,
      scaleByDistance: new Cesium.NearFarScalar(3e5, nearScale, 1.5e7, farScale),
      translucencyByDistance: new Cesium.NearFarScalar(1.5e6, 1.0, 1.2e7, farAlpha),
      color: billboardColor,
    });

    if (isMil) {
      // Signal freshness color: white → yellow → orange → red
      const stale = flight.lastSeenSec ?? 0;
      let milLabelColor: import('cesium').Color;
      if (stale > 60) milLabelColor = new Cesium.Color(1.0, 0.25, 0.2, 0.96);
      else if (stale > 30) milLabelColor = new Cesium.Color(1.0, 0.6, 0.1, 0.96);
      else if (stale > 15) milLabelColor = new Cesium.Color(1.0, 0.92, 0.23, 0.96);
      else milLabelColor = new Cesium.Color(1.0, 1.0, 1.0, 0.96);

      labels.add({
        id: { type: 'flight', id: flight.icao },
        position: Cesium.Cartesian3.fromDegrees(flight.lon, flight.lat, renderAltM),
        text: flight.callsign ?? flight.icao,
        font: '11px monospace',
        fillColor: milLabelColor,
        outlineColor: new Cesium.Color(0.0, 0.0, 0.0, 0.9),
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(12, -8),
        scaleByDistance: new Cesium.NearFarScalar(3e5, 0.75, 3e6, 0.0),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3e6),
      });

      // Subtitle line: aircraft type + altitude (visible only when zoomed in)
      const typePart = flight.aircraftType ?? '';
      const altFt = flight.baroAltFt ?? (flight.altM != null ? Math.round(flight.altM * 3.281) : null);
      const altPart = altFt != null ? `${altFt}ft` : '';
      const subtitle = [typePart, altPart].filter(Boolean).join(' ');
      if (subtitle) {
        labels.add({
          id: { type: 'flight_sub', id: flight.icao },
          position: Cesium.Cartesian3.fromDegrees(flight.lon, flight.lat, renderAltM),
          text: subtitle,
          font: '9px monospace',
          fillColor: new Cesium.Color(0.85, 0.85, 0.85, 0.7),
          outlineColor: new Cesium.Color(0.0, 0.0, 0.0, 0.7),
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(12, 4),
          scaleByDistance: new Cesium.NearFarScalar(2e5, 0.7, 1.5e6, 0.0),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 1_500_000),
        });
      }
    } else if (flight.callsign) {
      labels.add({
        id: { type: 'flight', id: flight.icao },
        position: Cesium.Cartesian3.fromDegrees(flight.lon, flight.lat, renderAltM),
        text: flight.callsign,
        font: '10px monospace',
        fillColor: new Cesium.Color(0.75, 0.88, 1.0, 0.92),
        outlineColor: new Cesium.Color(0.0, 0.0, 0.0, 0.8),
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(12, -6),
        scaleByDistance: new Cesium.NearFarScalar(3e5, 0.7, 1.5e6, 0.0),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2_500_000),
      });
    }

    if (isEmergency) {
      labels.add({
        id: { type: 'flight_squawk', id: flight.icao },
        position: Cesium.Cartesian3.fromDegrees(flight.lon, flight.lat, renderAltM),
        text: `SQUAWK ${squawkStr}`,
        font: 'bold 11px monospace',
        fillColor: billboardColor,
        outlineColor: new Cesium.Color(0.0, 0.0, 0.0, 0.9),
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(12, 8),
        scaleByDistance: new Cesium.NearFarScalar(3e5, 1.0, 8e6, 0.4),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 1e7),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      });
    }

    // Speed/heading vector: project 90s ahead at current speed
    const speedMs = flight.speedMs ?? 0;
    if (speedMs > 20 && !flight.onGround) {
      const headingRad = (heading * Math.PI) / 180;
      const latRad = (flight.lat * Math.PI) / 180;
      const mPerDegLon = 111_320 * Math.max(0.01, Math.cos(latRad));
      const dt = 90;
      const dNorth = speedMs * dt * Math.cos(headingRad);
      const dEast = speedMs * dt * Math.sin(headingRad);
      const endLat = flight.lat + dNorth / 111_320;
      const endLon = flight.lon + dEast / mPerDegLon;
      const vecAltM = Math.max(80, renderAltM);

      vectors.add({
        positions: [
          Cesium.Cartesian3.fromDegrees(flight.lon, flight.lat, vecAltM),
          Cesium.Cartesian3.fromDegrees(endLon, endLat, vecAltM),
        ],
        width: 1.0,
        material: Cesium.Material.fromType('Color', {
          color: new Cesium.Color(1.0, 1.0, 1.0, 0.22),
        }),
        id: { type: 'flight_vector', id: flight.icao, headingDeg: heading, speedMs },
      });
    }
  }

  if (labels.length > 0) {
    viewer.scene.primitives.add(labels);
  } else {
    labels.destroy();
  }

  if (vectors.length > 0) {
    viewer.scene.primitives.add(vectors);
  } else {
    vectors.destroy();
  }

  viewer.scene.primitives.add(billboards);

  const remove = () => {
    if (!billboards.isDestroyed()) viewer.scene.primitives.remove(billboards);
    if (!labels.isDestroyed()) viewer.scene.primitives.remove(labels);
    if (!vectors.isDestroyed()) viewer.scene.primitives.remove(vectors);
  };

  const map = getLayerMap(viewer);
  map.set('flights', { remove, billboards, labels, polylines: vectors });
}

export type GetFlightPosition = (
  icao: string
) => { lon: number; lat: number; altM: number } | null;

/** Update flight billboard/label positions from interpolated positions. Cesium must be passed for sync use (e.g. preRender). */
export function updateFlightPositions(
  viewer: import('cesium').Viewer,
  getPosition: GetFlightPosition,
  Cesium: typeof import('cesium')
): void {
  if (!isViewerAlive(viewer)) return;
  const map = getLayerMap(viewer);
  const handle = map.get('flights');
  if (!handle?.billboards) return;
  if (handle.billboards.isDestroyed()) return;

  const Ces = Cesium;
  const billboards = handle.billboards;
  const labels = handle.labels;

  for (let i = 0; i < billboards.length; i++) {
    const b = billboards.get(i);
    const id = b.id as { type?: string; id?: string } | undefined;
    const icao = id?.id;
    if (!icao) continue;
    const p = getPosition(icao);
    if (!p) continue;
    const renderAltM = Math.max(80, p.altM);
    b.position = Ces.Cartesian3.fromDegrees(p.lon, p.lat, renderAltM);
  }

  if (labels && !labels.isDestroyed()) {
    for (let i = 0; i < labels.length; i++) {
      const label = labels.get(i);
      const id = label.id as { type?: string; id?: string } | undefined;
      const icao = id?.id;
      if (!icao) continue;
      const p = getPosition(icao);
      if (!p) continue;
      const renderAltM = Math.max(180, p.altM);
      label.position = Ces.Cartesian3.fromDegrees(p.lon, p.lat, renderAltM);
    }
  }

  const polylines = handle.polylines;
  if (polylines && !polylines.isDestroyed()) {
    for (let i = 0; i < polylines.length; i++) {
      const v = polylines.get(i);
      const vid = v.id as { type?: string; id?: string; headingDeg?: number; speedMs?: number } | undefined;
      if (vid?.type !== 'flight_vector') continue;
      const icao = vid.id;
      if (!icao) continue;
      const p = getPosition(icao);
      if (!p) continue;
      const speedMs = vid.speedMs ?? 0;
      const headingRad = ((vid.headingDeg ?? 0) * Math.PI) / 180;
      const latRad = (p.lat * Math.PI) / 180;
      const mPerDegLon = 111_320 * Math.max(0.01, Math.cos(latRad));
      const dt = 90;
      const dNorth = speedMs * dt * Math.cos(headingRad);
      const dEast = speedMs * dt * Math.sin(headingRad);
      const endLat = p.lat + dNorth / 111_320;
      const endLon = p.lon + dEast / mPerDegLon;
      const vecAltM = Math.max(80, p.altM);
      v.positions = [
        Ces.Cartesian3.fromDegrees(p.lon, p.lat, vecAltM),
        Ces.Cartesian3.fromDegrees(endLon, endLat, vecAltM),
      ];
    }
  }
}

// ── GPS / GNSS Interference layer ───────────────────────────────────────────

const GPS_JAM_CELL_DEG = 2.0; // ~220 km cells (used for render radius)

/** Show or hide flight heading vector lines based on camera altitude. */
export function setFlightVectorsVisible(
  viewer: import('cesium').Viewer,
  show: boolean
): void {
  if (!isViewerAlive(viewer)) return;
  const map = getLayerMap(viewer);
  const handle = map.get('flights');
  if (handle?.polylines && !handle.polylines.isDestroyed()) {
    handle.polylines.show = show;
  }
}

/**
 * Render GPS/GNSS interference zones from the multi-indicator inference engine.
 * Zones carry compositeScore, severity, trend, and symptom flags computed by
 * GpsInterferenceTracker in gpsInterference.ts.
 */
export async function renderGpsJamZones(
  viewer: import('cesium').Viewer,
  zones: GpsJamZone[]
): Promise<void> {
  if (!isViewerAlive(viewer)) return;
  const Cesium = await import('cesium');
  clearLayer(viewer, 'gps_jam');
  // Remove ALL gps_jam data sources (including orphans from overlapping async renders)
  for (let i = viewer.dataSources.length - 1; i >= 0; i--) {
    const ds = viewer.dataSources.get(i);
    if (ds.name === 'gps_jam') {
      viewer.dataSources.remove(ds, true);
    }
  }
  if (!isViewerAlive(viewer)) return;
  if (zones.length === 0) return;

  const dataSource = new Cesium.CustomDataSource('gps_jam');
  const cellRadiusM = (GPS_JAM_CELL_DEG / 2) * 111_320;

  for (const zone of zones) {
    // Use compositeScore when available; fall back to degradedRatio
    const intensity = zone.compositeScore ?? zone.degradedRatio;
    const severity = zone.severity ?? 'low';

    // Color gradient: amber → orange → red → deep red
    let r: number, g: number, b: number;
    if (intensity < 0.4) {
      // amber
      r = 1.0; g = 0.67; b = 0.25;
    } else if (intensity < 0.6) {
      // orange
      const t = (intensity - 0.4) / 0.2;
      r = 1.0; g = 0.67 - t * 0.24; b = 0.25 - t * 0.25;
    } else if (intensity < 0.8) {
      // red
      const t = (intensity - 0.6) / 0.2;
      r = 1.0; g = 0.43 - t * 0.33; b = t * 0.05;
    } else {
      // deep red
      r = 0.95; g = 0.08; b = 0.08;
    }
    const alpha = 0.22 + intensity * 0.24;
    const fillColor = new Cesium.Color(r, g, b, alpha);
    const hasMilProximity = (zone.nearbyMilitary ?? 0) > 0;
    const outlineColor = hasMilProximity
      ? new Cesium.Color(1.0, 0.44, 0.26, 0.8)   // military orange accent
      : new Cesium.Color(r, g, b, 0.7);
    const labelColor = new Cesium.Color(r, g, b, 1.0);

    // Severity-scaled outline width
    const outlineWidth = severity === 'critical' ? 4 : severity === 'high' ? 3 : severity === 'medium' ? 2 : 1.5;

    // Glow ring — larger for critical
    const glowMultiplier = severity === 'critical' ? 2.0 : 1.5;
    const glowAlpha = severity === 'critical' ? 0.15 : 0.1;
    dataSource.entities.add({
      id: `gps_jam_glow_${zone.lat}_${zone.lon}`,
      position: Cesium.Cartesian3.fromDegrees(zone.lon, zone.lat, 10_000),
      ellipse: {
        semiMajorAxis: cellRadiusM * glowMultiplier,
        semiMinorAxis: cellRadiusM * glowMultiplier,
        material: new Cesium.ColorMaterialProperty(new Cesium.Color(r, g, b, glowAlpha)),
        height: 10_000,
      },
    });

    // Build label text with detailed information
    const pct = Math.round(zone.degradedRatio * 100);
    const degradedCount = zone.degradedCount ?? 0;
    const score = zone.compositeScore ? Math.round(zone.compositeScore * 100) : 0;

    let labelText = `GPS INTERFERENCE\n`;
    labelText += `${pct}% Degraded (${degradedCount}/${zone.count} ac)\n`;
    labelText += `Score: ${score}% | Severity: ${(zone.severity || 'low').toUpperCase()}`;

    // Symptom line
    if (zone.symptomFlags != null && zone.symptomFlags > 0) {
      const symptoms: string[] = [];
      if (zone.symptomFlags & 1) symptoms.push('QUALITY');
      if (zone.symptomFlags & 2) symptoms.push('NOISE');
      if (zone.symptomFlags & 4) symptoms.push('THINNING');
      labelText += `\nSymptoms: ${symptoms.join(' | ')}`;
    }

    // Military proximity line
    if (hasMilProximity) {
      labelText += `\nMil Nearby: ${zone.nearbyMilitary} ac`;
    }

    // Trend + duration line
    const trendArrow = zone.trend === 'rising' ? '↑' : zone.trend === 'falling' ? '↓' : '→';
    const durationMin = zone.durationMs != null ? Math.round(zone.durationMs / 60_000) : 0;
    if (durationMin > 0) {
      labelText += `\n${trendArrow} ${durationMin}m active`;
    }

    // Main zone ellipse
    dataSource.entities.add({
      id: `gps_jam_${zone.lat}_${zone.lon}`,
      position: Cesium.Cartesian3.fromDegrees(zone.lon, zone.lat, 10_000),
      ellipse: {
        semiMajorAxis: cellRadiusM,
        semiMinorAxis: cellRadiusM,
        material: new Cesium.ColorMaterialProperty(fillColor),
        outline: true,
        outlineColor,
        outlineWidth,
        height: 10_000,
      },
      properties: {
        type: 'gps_jam',
        lat: zone.lat,
        lon: zone.lon,
        degradedRatio: zone.degradedRatio,
        compositeScore: zone.compositeScore,
        severity: zone.severity,
        trend: zone.trend,
        count: zone.count,
      },
    });

    // Separate label entity positioned above for better readability
    dataSource.entities.add({
      id: `gps_jam_label_${zone.lat}_${zone.lon}`,
      position: Cesium.Cartesian3.fromDegrees(zone.lon, zone.lat, 25_000),
      label: {
        text: labelText,
        font: 'bold 18px monospace',
        fillColor: labelColor,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3.5,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, 0),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2_500_000),
        scaleByDistance: new Cesium.NearFarScalar(500_000, 1.0, 2_500_000, 0.0),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      },
    });
  }

  await viewer.dataSources.add(dataSource);

  const map = getLayerMap(viewer);
  map.set('gps_jam', {
    remove: () => {
      if (!isViewerAlive(viewer)) return;
      viewer.dataSources.remove(dataSource, true);
    },
    dataSource,
  });
}

// ── Airspace Anomaly layer ──────────────────────────────────────────────────

const ANOMALY_CELL_RADIUS_M = 80_000;

function anomalyColor(severity: AirspaceAnomalyZone['severity']): { r: number; g: number; b: number; a: number } {
  switch (severity) {
    case 'low':      return { r: 1.0, g: 0.92, b: 0.23, a: 0.18 };
    case 'medium':   return { r: 1.0, g: 0.6,  b: 0.1,  a: 0.25 };
    case 'high':     return { r: 1.0, g: 0.34, b: 0.13, a: 0.32 };
    case 'critical': return { r: 0.9, g: 0.1,  b: 0.1,  a: 0.40 };
  }
}

export async function renderAirspaceAnomalies(
  viewer: import('cesium').Viewer,
  zones: AirspaceAnomalyZone[]
): Promise<void> {
  if (!isViewerAlive(viewer)) return;
  const Cesium = await import('cesium');
  // Sweep all dataSources named 'airspace_anomaly' — handles concurrent-render orphans
  clearLayer(viewer, 'airspace_anomaly');
  for (let i = viewer.dataSources.length - 1; i >= 0; i--) {
    const ds = viewer.dataSources.get(i);
    if (ds.name === 'airspace_anomaly') viewer.dataSources.remove(ds, true);
  }
  if (!isViewerAlive(viewer)) return;
  if (zones.length === 0) return;

  const dataSource = new Cesium.CustomDataSource('airspace_anomaly');

  for (const zone of zones) {
    const c = anomalyColor(zone.severity);
    const fillColor = new Cesium.Color(c.r, c.g, c.b, c.a);
    const outlineColor = zone.nearbyMilitary > 0
      ? new Cesium.Color(1.0, 0.44, 0.26, 0.8)   // military orange accent
      : new Cesium.Color(c.r, c.g, c.b, 0.6);
    const labelColor = new Cesium.Color(c.r, c.g, c.b, 1.0);

    const dropPct = Math.round(zone.deviationRatio * 100);
    const showLabel = true;
    let labelText = `TRAFFIC VOID\n${dropPct}% drop (${zone.currentCount}/${zone.baselineAvg} ac)`;
    if (zone.nearbyMilitary > 0) {
      labelText += `\nMIL PROXIMITY: ${zone.nearbyMilitary}`;
    }

    // Zone ellipse (no glow ring — single entity per zone)
    dataSource.entities.add({
      id: `anomaly_${zone.lat}_${zone.lon}`,
      position: Cesium.Cartesian3.fromDegrees(zone.lon, zone.lat, 8_000),
      ellipse: {
        semiMajorAxis: ANOMALY_CELL_RADIUS_M,
        semiMinorAxis: ANOMALY_CELL_RADIUS_M,
        material: new Cesium.ColorMaterialProperty(fillColor),
        outline: true,
        outlineColor,
        outlineWidth: 1.5,
        height: 8_000,
      },
      label: showLabel ? {
        text: labelText,
        font: 'bold 16px monospace',
        fillColor: labelColor,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -8),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 4_000_000),
        scaleByDistance: new Cesium.NearFarScalar(200_000, 1.4, 3_000_000, 0.7),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      } : undefined,
      properties: {
        type: 'airspace_anomaly',
        lat: zone.lat,
        lon: zone.lon,
        severity: zone.severity,
        deviationRatio: zone.deviationRatio,
        nearbyMilitary: zone.nearbyMilitary,
      },
    });
  }

  await viewer.dataSources.add(dataSource);

  const map = getLayerMap(viewer);
  map.set('airspace_anomaly', {
    remove: () => {
      if (!isViewerAlive(viewer)) return;
      viewer.dataSources.remove(dataSource, true);
    },
    dataSource,
  });
}

// ── Disappeared Flights (ghost markers) ─────────────────────────────────────

const ghostCanvasCache = new Map<string, HTMLCanvasElement>();

function createGhostPlaneCanvas(size: number): HTMLCanvasElement {
  const cacheKey = `ghost_${size}`;
  const cached = ghostCanvasCache.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;

  // Faded red chevron (military style, 40% alpha)
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = '#ff3333';
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r * 0.7, cy + r * 0.5);
  ctx.lineTo(cx, cy + r * 0.15);
  ctx.lineTo(cx - r * 0.7, cy + r * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1.0;

  ghostCanvasCache.set(cacheKey, canvas);
  return canvas;
}

export async function renderDisappearedFlights(
  viewer: import('cesium').Viewer,
  ghosts: DisappearedFlight[]
): Promise<void> {
  if (!isViewerAlive(viewer)) return;
  const Cesium = await import('cesium');
  clearLayer(viewer, 'disappeared_flights');
  if (!isViewerAlive(viewer)) return;
  if (ghosts.length === 0) return;

  const billboards = new Cesium.BillboardCollection({ scene: viewer.scene });
  const labels = new Cesium.LabelCollection();
  const vectors = new Cesium.PolylineCollection();
  const now = Date.now();

  for (const ghost of ghosts) {
    const elapsedSec = Math.round((now - ghost.disappearedAt) / 1000);
    const altM = Math.max(180, ghost.lastAltM);

    billboards.add({
      position: Cesium.Cartesian3.fromDegrees(ghost.lastLon, ghost.lastLat, altM),
      image: createGhostPlaneCanvas(24),
      rotation: Cesium.Math.toRadians(-(ghost.lastHeading)),
      alignedAxis: Cesium.Cartesian3.UNIT_Z,
      id: { type: 'disappeared_flight', id: ghost.icao, data: ghost },
      disableDepthTestDistance: 3_000_000,
      scaleByDistance: new Cesium.NearFarScalar(3e5, 1.2, 1.5e7, 0.5),
      translucencyByDistance: new Cesium.NearFarScalar(1.5e6, 0.8, 1.2e7, 0.3),
    });

    const labelId = ghost.callsign || ghost.icao;
    labels.add({
      position: Cesium.Cartesian3.fromDegrees(ghost.lastLon, ghost.lastLat, altM),
      text: `SIGNAL LOST\n${labelId}\n${elapsedSec}s ago`,
      font: 'bold 10px monospace',
      fillColor: new Cesium.Color(1.0, 0.2, 0.2, 0.9),
      outlineColor: new Cesium.Color(0.0, 0.0, 0.0, 0.9),
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(14, -4),
      scaleByDistance: new Cesium.NearFarScalar(3e5, 0.8, 3e6, 0.0),
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3e6),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });

    // Projected path polyline (120s ahead from last heading/speed)
    const speedMs = ghost.lastSpeedMs;
    if (speedMs > 20) {
      const headingRad = (ghost.lastHeading * Math.PI) / 180;
      const latRad = (ghost.lastLat * Math.PI) / 180;
      const mPerDegLon = 111_320 * Math.max(0.01, Math.cos(latRad));
      const dt = 120;
      const dNorth = speedMs * dt * Math.cos(headingRad);
      const dEast = speedMs * dt * Math.sin(headingRad);
      const endLat = ghost.lastLat + dNorth / 111_320;
      const endLon = ghost.lastLon + dEast / mPerDegLon;

      vectors.add({
        positions: [
          Cesium.Cartesian3.fromDegrees(ghost.lastLon, ghost.lastLat, altM),
          Cesium.Cartesian3.fromDegrees(endLon, endLat, altM),
        ],
        width: 1.5,
        material: Cesium.Material.fromType('PolylineDash', {
          color: new Cesium.Color(1.0, 0.2, 0.2, 0.35),
          dashLength: 12.0,
        }),
        id: { type: 'ghost_vector', id: ghost.icao },
      });
    }
  }

  viewer.scene.primitives.add(billboards);
  if (labels.length > 0) viewer.scene.primitives.add(labels);
  else labels.destroy();
  if (vectors.length > 0) viewer.scene.primitives.add(vectors);
  else vectors.destroy();

  const map = getLayerMap(viewer);
  map.set('disappeared_flights', {
    remove: () => {
      if (!billboards.isDestroyed()) viewer.scene.primitives.remove(billboards);
      if (!labels.isDestroyed()) viewer.scene.primitives.remove(labels);
      if (!vectors.isDestroyed()) viewer.scene.primitives.remove(vectors);
    },
    billboards,
    labels,
    polylines: vectors,
  });
}

// 閳光偓閳光偓閳光偓 Earthquake layer 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓

export async function renderEarthquakes(
  viewer: import('cesium').Viewer,
  quakes: Earthquake[]
): Promise<void> {
  if (!isViewerAlive(viewer)) return;
  const Cesium = await import('cesium');
  clearLayer(viewer, 'earthquakes');
  if (!isViewerAlive(viewer)) return;

  const billboards = new Cesium.BillboardCollection({ scene: viewer.scene });

  for (const q of quakes) {
    const color = quakeColor(q.mag);
    const iconSize = Math.max(24, Math.min(48, q.mag * 7));

    billboards.add({
      position: Cesium.Cartesian3.fromDegrees(q.lon, q.lat, 500),
      image: createQuakeCanvas(iconSize, color, q.mag),
      id: { type: 'earthquake', id: q.id, data: q },
      scaleByDistance: new Cesium.NearFarScalar(5e3, 1.4, 1.2e7, 0.45),
      translucencyByDistance: new Cesium.NearFarScalar(5e3, 1.0, 1.5e7, 0.6),
      disableDepthTestDistance: 3_000_000,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
    });
  }

  viewer.scene.primitives.add(billboards);

  const map = getLayerMap(viewer);
  map.set('earthquakes', {
    remove: () => {
      if (!billboards.isDestroyed()) viewer.scene.primitives.remove(billboards);
    },
  });
}

function quakeColor(mag: number): string {
  if (mag < 3) return '#ffeb3b'; // yellow
  if (mag < 5) return '#ff9800'; // orange
  return '#f44336';              // red
}

function disasterColor(level?: string): string {
  const normalized = String(level ?? "").toLowerCase();
  if (normalized.includes("green")) return "#7ddf64";
  if (normalized.includes("orange")) return "#ffab40";
  if (normalized.includes("red")) return "#ff5a5f";
  return "#ffd166";
}

export async function renderDisasterAlerts(
  viewer: import("cesium").Viewer,
  alerts: DisasterAlert[]
): Promise<void> {
  if (!isViewerAlive(viewer)) return;
  const Cesium = await import("cesium");
  if (!isViewerAlive(viewer)) return;

  const map = getLayerMap(viewer);
  let handle = map.get("disasters");
  if (!handle?.dataSource) {
    const dataSource = new Cesium.CustomDataSource("disasters");
    await viewer.dataSources.add(dataSource);
    handle = {
      remove: () => {
        if (!isViewerAlive(viewer)) return;
        viewer.dataSources.remove(dataSource, true);
      },
      dataSource,
      entityById: new Map<string, import("cesium").Entity>(),
    };
    map.set("disasters", handle);
  }

  const dataSource = handle.dataSource;
  const entityById = handle.entityById ?? new Map<string, import("cesium").Entity>();
  handle.entityById = entityById;
  const incoming = new Set<string>();

  alerts.slice(0, 500).forEach((alert) => {
    const id = alert.id;
    if (!id) return;
    incoming.add(id);
    const color = disasterColor(alert.alertLevel);
    const pointColor = Cesium.Color.fromCssColorString(color);
    const existing = entityById.get(id);
    const labelText = `${alert.eventType.toUpperCase()} ${alert.alertLevel ?? "UNSET"}`;
    const position = Cesium.Cartesian3.fromDegrees(alert.lon, alert.lat, 50);
    if (existing) {
      const mutable = existing as unknown as {
        position: unknown;
        billboard?: {
          image?: unknown;
          verticalOrigin?: import("cesium").VerticalOrigin;
          heightReference?: import("cesium").HeightReference;
          disableDepthTestDistance?: number;
        };
        label?: { text?: unknown };
      };
      mutable.position = position;
      if (mutable.billboard) {
        mutable.billboard.image = createDotCanvas(6, color);
        mutable.billboard.verticalOrigin = Cesium.VerticalOrigin.BOTTOM;
        mutable.billboard.heightReference = Cesium.HeightReference.RELATIVE_TO_GROUND;
        mutable.billboard.disableDepthTestDistance = 3_000_000;
      }
      if (mutable.label) {
        mutable.label.text = labelText;
      }
      return;
    }

    const entity = dataSource.entities.add({
      id,
      position,
      billboard: {
        image: createDotCanvas(6, color),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
          disableDepthTestDistance: 3_000_000,
        scaleByDistance: new Cesium.NearFarScalar(100_000, 1.4, 18_000_000, 0.36),
      },
      label: {
        text: labelText,
        font: "10px monospace",
        fillColor: pointColor,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        pixelOffset: new Cesium.Cartesian2(9, -8),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 1_800_000),
        scaleByDistance: new Cesium.NearFarScalar(80_000, 1.0, 4_000_000, 0.0),
      },
      properties: {
        type: "disaster",
        id,
        title: alert.title,
        source: alert.source,
        eventType: alert.eventType,
        alertLevel: alert.alertLevel ?? null,
        updatedAt: alert.updatedAt,
        severity: alert.severity ?? null,
      },
    });
    entityById.set(id, entity);
  });

  for (const [id, entity] of Array.from(entityById.entries())) {
    if (incoming.has(id)) continue;
    dataSource.entities.remove(entity);
    entityById.delete(id);
  }
}

// 閳光偓閳光偓閳光偓 Traffic layer 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓

export async function renderTraffic(
  viewer: import('cesium').Viewer,
  vehicles: Vehicle[]
): Promise<void> {
  if (!isViewerAlive(viewer)) return;
  const Cesium = await import('cesium');
  clearLayer(viewer, 'traffic');
  if (!isViewerAlive(viewer)) return;

  const billboards = new Cesium.BillboardCollection({ scene: viewer.scene });

  for (const v of vehicles) {
    billboards.add({
      position: Cesium.Cartesian3.fromDegrees(v.lon, v.lat, 2),
      image: createDotCanvas(3, '#69f0ae'),
      color: new Cesium.Color(0.41, 0.94, 0.68, 0.8),
      id: { type: 'traffic', id: v.id, data: v },
      scaleByDistance: new Cesium.NearFarScalar(1e3, 1.0, 1e5, 0.4),
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 100_000),
    });
  }

  viewer.scene.primitives.add(billboards);

  const map = getLayerMap(viewer);
  map.set('traffic', {
    remove: () => {
      if (!billboards.isDestroyed()) viewer.scene.primitives.remove(billboards);
    },
  });
}

// 閳光偓閳光偓閳光偓 CCTV layer 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓

let cctvRenderSeq = 0;

export async function renderCctv(
  viewer: import('cesium').Viewer,
  cameras: CctvCamera[],
  _calibrations: Record<string, CameraCalibration>
): Promise<void> {
  const seq = ++cctvRenderSeq;
  if (!isViewerAlive(viewer)) return;
  const Cesium = await import('cesium');
  clearLayer(viewer, 'cctv');
  if (!isViewerAlive(viewer) || seq !== cctvRenderSeq) return;

  const billboards = new Cesium.BillboardCollection({ scene: viewer.scene });
  const labels = new Cesium.LabelCollection();
  const cctvColor = '#00e5ff';
  const [r, g, b] = hexToRgb(cctvColor);

  for (const cam of cameras) {
    if (!isViewerAlive(viewer)) break;
    const pos = Cesium.Cartesian3.fromDegrees(cam.lon, cam.lat, 20);

    billboards.add({
      position: pos,
      image: createDotCanvas(5, cctvColor),
      color: new Cesium.Color(r, g, b, 0.9),
      id: { type: 'cctv', id: cam.id, data: cam },
      disableDepthTestDistance: 3_000_000,
      scaleByDistance: new Cesium.NearFarScalar(5e4, 1.0, 1.5e7, 0.4),
      translucencyByDistance: new Cesium.NearFarScalar(5e5, 1.0, 1.2e7, 0.3),
    });

    labels.add({
      position: pos,
      text: cam.name,
      font: '10px monospace',
      fillColor: new Cesium.Color(r, g, b, 0.85),
      style: Cesium.LabelStyle.FILL,
      pixelOffset: new Cesium.Cartesian2(8, 0),
      scaleByDistance: new Cesium.NearFarScalar(5e4, 1.0, 5e6, 0.0),
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5e5),
    });
  }

  viewer.scene.primitives.add(billboards);
  viewer.scene.primitives.add(labels);

  const map = getLayerMap(viewer);
  map.set('cctv', {
    remove: () => {
      if (!billboards.isDestroyed()) viewer.scene.primitives.remove(billboards);
      if (!labels.isDestroyed()) viewer.scene.primitives.remove(labels);
    },
  });
}

// 閳光偓閳光偓閳光偓 Flight highlight (yellow box for double-click tracking) 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓

export interface NewsMarkerRenderOptions {
  highlightedMarkerId?: string | null;
  enableClustering?: boolean;
  pixelRange?: number;
  minimumClusterSize?: number;
}

function newsMarkerColor(category: GeoMarker["category"]): string {
  switch (category) {
    case "markets":
      return "#36b37e";
    case "tech":
      return "#00e5ff";
    case "energy":
      return "#ffab40";
    case "defense":
      return "#ea80fc";
    case "crypto":
      return "#76ff03";
    case "local":
      return "#4fc3f7";
    case "filings":
      return "#7f9fbe";
    case "watchlist":
      return "#f4d03f";
    case "world":
    default:
      return "#ff5630";
  }
}

export async function renderNewsMarkers(
  viewer: import("cesium").Viewer,
  markers: GeoMarker[],
  options: NewsMarkerRenderOptions = {}
): Promise<void> {
  if (!isViewerAlive(viewer)) return;
  const Cesium = await import("cesium");
  clearLayer(viewer, "news");
  if (!isViewerAlive(viewer)) return;
  if (!Array.isArray(markers) || markers.length === 0) return;

  const dataSource = new Cesium.CustomDataSource("news");

  markers.slice(0, 2000).forEach((marker) => {
    const isHighlighted = marker.id === options.highlightedMarkerId;
    const color = newsMarkerColor(marker.category);

    dataSource.entities.add({
      id: marker.id,
      position: Cesium.Cartesian3.fromDegrees(marker.lon, marker.lat, 20),
      billboard: {
        image: createDotCanvas(isHighlighted ? 8 : 5, color),
        scaleByDistance: new Cesium.NearFarScalar(200_000, 1.7, 28_000_000, 0.32),
      },
      label: {
        text: marker.headline,
        font: "11px monospace",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        showBackground: true,
        backgroundColor: new Cesium.Color(0, 0, 0, 0.6),
        pixelOffset: new Cesium.Cartesian2(10, -10),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 1_600_000),
        scaleByDistance: new Cesium.NearFarScalar(120_000, 1.0, 4_000_000, 0.0),
      },
      properties: {
        type: "news",
        markerId: marker.id,
        articleId: marker.articleId,
        headline: marker.headline,
        source: marker.source,
        publishedAt: marker.publishedAt,
      },
    });
  });

  dataSource.clustering.enabled = options.enableClustering !== false;
  dataSource.clustering.pixelRange = options.pixelRange ?? 58;
  dataSource.clustering.minimumClusterSize = options.minimumClusterSize ?? 3;
  dataSource.clustering.clusterEvent.addEventListener((clusteredEntities, cluster) => {
    cluster.label.show = true;
    cluster.label.text = String(clusteredEntities.length);
    cluster.label.font = "12px monospace";
    cluster.label.fillColor = Cesium.Color.BLACK;
    cluster.label.showBackground = true;
    cluster.label.backgroundColor = Cesium.Color.fromCssColorString("#f4d03f").withAlpha(0.95);
    cluster.billboard.show = true;
    cluster.billboard.image = createDotCanvas(10, "#f4d03f").toDataURL();
  });

  await viewer.dataSources.add(dataSource);

  const map = getLayerMap(viewer);
  map.set("news", {
    remove: () => {
      if (!isViewerAlive(viewer)) return;
      viewer.dataSources.remove(dataSource, true);
    },
  });
}

const FLIGHT_HIGHLIGHT_ENTITY_ID = 'flight_highlight_entity';

export async function renderFlightHighlight(
  viewer: import('cesium').Viewer,
  flight: Flight,
  getPosition?: GetFlightPosition
): Promise<void> {
  if (!isViewerAlive(viewer)) return;
  const Cesium = await import('cesium');
  clearLayer(viewer, 'flight_highlight');
  if (!isViewerAlive(viewer)) return;

  const altM = flight.altM ?? 0;

  if (getPosition) {
    const icao = flight.icao;
    const entity = viewer.entities.add({
      id: FLIGHT_HIGHLIGHT_ENTITY_ID,
      position: new Cesium.CallbackProperty(() => {
        const p = getPosition(icao);
        if (!p) return Cesium.Cartesian3.fromDegrees(flight.lon, flight.lat, Math.max(0, altM));
        return Cesium.Cartesian3.fromDegrees(p.lon, p.lat, Math.max(0, p.altM));
      }, false) as unknown as import("cesium").PositionProperty,
      billboard: {
        image: createYellowBoxCanvas(32),
        scaleByDistance: new Cesium.NearFarScalar(5e4, 2, 1e7, 0.45),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    const map = getLayerMap(viewer);
    map.set('flight_highlight', {
      remove: () => {
        try {
          if (viewer.entities.contains(entity)) viewer.entities.remove(entity);
        } catch {
          // ignore if viewer destroyed
        }
      },
    });
    return;
  }

  const billboards = new Cesium.BillboardCollection({ scene: viewer.scene });
  billboards.add({
    position: Cesium.Cartesian3.fromDegrees(flight.lon, flight.lat, altM),
    image: createYellowBoxCanvas(32),
    id: { type: 'flight_highlight', id: flight.icao },
    scaleByDistance: new Cesium.NearFarScalar(5e4, 2, 1e7, 0.45),
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
  });
  viewer.scene.primitives.add(billboards);

  const map = getLayerMap(viewer);
  map.set('flight_highlight', {
    remove: () => {
      if (!billboards.isDestroyed()) viewer.scene.primitives.remove(billboards);
    },
    billboards,
  });
}

/** Update the flight highlight (yellow box) position from interpolated position. Cesium must be passed for sync use (e.g. preRender). */
export function updateFlightHighlightPosition(
  viewer: import('cesium').Viewer,
  getPosition: GetFlightPosition,
  icao: string,
  Cesium: typeof import('cesium')
): void {
  if (!isViewerAlive(viewer)) return;
  const map = getLayerMap(viewer);
  const handle = map.get('flight_highlight');
  if (!handle?.billboards || handle.billboards.isDestroyed() || handle.billboards.length === 0)
    return;

  const p = getPosition(icao);
  if (!p) return;

  const Ces = Cesium;
  const altM = Math.max(0, p.altM);
  handle.billboards.get(0).position = Ces.Cartesian3.fromDegrees(p.lon, p.lat, altM);
}

// 閳光偓閳光偓閳光偓 Satellite highlight (yellow box for selected satellite, same as flight) 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓

export async function renderSatelliteHighlight(
  viewer: import('cesium').Viewer,
  sat: PropagatedSat
): Promise<void> {
  if (!isViewerAlive(viewer)) return;
  const Cesium = await import('cesium');
  clearLayer(viewer, 'satellite_highlight');
  if (!isViewerAlive(viewer)) return;

  const altM = Math.max(0, sat.altKm * 1000);

  const billboards = new Cesium.BillboardCollection({ scene: viewer.scene });
  billboards.add({
    position: Cesium.Cartesian3.fromDegrees(sat.lon, sat.lat, altM),
    image: createYellowBoxCanvas(32),
    id: { type: 'satellite_highlight', id: sat.noradId },
    scaleByDistance: new Cesium.NearFarScalar(5e4, 2, 1e7, 0.45),
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
  });
  viewer.scene.primitives.add(billboards);

  const map = getLayerMap(viewer);
  map.set('satellite_highlight', {
    remove: () => {
      if (!billboards.isDestroyed()) viewer.scene.primitives.remove(billboards);
    },
  });
}

// 閳光偓閳光偓閳光偓 Flight path (accumulated polyline for tracked flight) 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓

export async function renderFlightPath(
  viewer: import('cesium').Viewer,
  path: [number, number, number][]
): Promise<void> {
  if (!isViewerAlive(viewer)) return;
  const Cesium = await import('cesium');
  clearLayer(viewer, 'flight_path');
  if (path.length < 2) return;
  if (!isViewerAlive(viewer)) return;
  const entities = getViewerEntities(viewer);
  if (!entities) return;

  const positions = path.map(([lon, lat, alt]) =>
    Cesium.Cartesian3.fromDegrees(lon, lat, alt)
  );

  entities.add({
    id: 'flight_path_base',
    polyline: {
      positions,
      width: 1.5,
      material: new Cesium.Color(0.02, 0.04, 0.06, 0.85),
      clampToGround: false,
    },
  });

  entities.add({
    id: 'flight_path',
    polyline: {
      positions,
      width: 2.4,
      material: new Cesium.PolylineDashMaterialProperty({
        color: new Cesium.Color(0.78, 0.35, 1.0, 0.9),
        dashLength: 18,
        dashPattern: 0b1111000011110000,
      }),
      depthFailMaterial: new Cesium.ColorMaterialProperty(
        new Cesium.Color(0.55, 0.3, 0.9, 0.5)
      ),
      clampToGround: false,
    },
  });

  entities.add({
    id: 'flight_path_glow',
    polyline: {
      positions,
      width: 4.6,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.08,
        color: new Cesium.Color(0.75, 0.3, 1.0, 0.28),
      }),
      clampToGround: false,
    },
  });

  const map = getLayerMap(viewer);
  map.set('flight_path', {
    remove: () => {
      if (!isViewerAlive(viewer)) return;
      const liveEntities = getViewerEntities(viewer);
      if (!liveEntities) return;
      liveEntities.removeById('flight_path_base');
      liveEntities.removeById('flight_path');
      liveEntities.removeById('flight_path_glow');
    },
  });
}

// 閳光偓閳光偓閳光偓 Orbit path 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓

export async function renderOrbitPath(
  viewer: import('cesium').Viewer,
  noradId: string,
  path: [number, number, number][]
): Promise<void> {
  if (!isViewerAlive(viewer)) return;
  const Cesium = await import('cesium');
  clearAllOrbitLayers(viewer);

  if (path.length < 2) return;
  if (!isViewerAlive(viewer)) return;
  const entities = getViewerEntities(viewer);
  if (!entities) return;

  const positions = path.map(([lon, lat, alt]) =>
    Cesium.Cartesian3.fromDegrees(lon, lat, alt)
  );

  entities.add({
    id: `orbit_${noradId}`,
    polyline: {
      positions,
      width: 3,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.4,
        color: new Cesium.Color(0.0, 0.95, 1.0, 0.95),
      }),
      clampToGround: false,
    },
  });

  const map = getLayerMap(viewer);
  map.set(`orbit_${noradId}`, {
    remove: () => {
      if (!isViewerAlive(viewer)) return;
      const liveEntities = getViewerEntities(viewer);
      if (!liveEntities) return;
      liveEntities.removeById(`orbit_${noradId}`);
    },
  });
}

// 閳光偓閳光偓閳光偓 Canvas helpers 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓

function createYellowBoxCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, size, size);

  const padding = Math.max(2, Math.floor(size * 0.08));
  const x = padding;
  const y = padding;
  const w = size - padding * 2;
  const h = size - padding * 2;

  // Dashed golden rectangular frame
  const golden = '#c9a227';
  ctx.strokeStyle = golden;
  ctx.lineWidth = Math.max(1, size / 28);
  ctx.setLineDash([Math.max(2, size / 12), Math.max(2, size / 10)]);
  ctx.strokeRect(x, y, w, h);

  // L-shaped corner brackets (thicker, solid golden)
  const bracketLen = Math.max(4, size * 0.2);
  const bracketThick = Math.max(1.5, size / 16);
  ctx.setLineDash([]);
  ctx.lineWidth = bracketThick;
  ctx.strokeStyle = golden;
  ctx.lineCap = 'square';
  // Top-left
  ctx.beginPath();
  ctx.moveTo(x, y + bracketLen);
  ctx.lineTo(x, y);
  ctx.lineTo(x + bracketLen, y);
  ctx.stroke();
  // Top-right
  ctx.beginPath();
  ctx.moveTo(x + w - bracketLen, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + bracketLen);
  ctx.stroke();
  // Bottom-right
  ctx.beginPath();
  ctx.moveTo(x + w, y + h - bracketLen);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w - bracketLen, y + h);
  ctx.stroke();
  // Bottom-left
  ctx.beginPath();
  ctx.moveTo(x + bracketLen, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + h - bracketLen);
  ctx.stroke();

  return canvas;
}

const canvasCache = new Map<string, HTMLCanvasElement>();

function createDotCanvas(radius: number, color: string): HTMLCanvasElement {
  const key = `dot_${radius}_${color}`;
  if (canvasCache.has(key)) return canvasCache.get(key)!;

  const size = radius * 2 + 8;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;
  // Soft outer ring for visibility on terrain
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 1.5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();
  canvasCache.set(key, canvas);
  return canvas;
}

function createGlowDotCanvas(radius: number, color: string): HTMLCanvasElement {
  const key = `glowdot_${radius}_${color}`;
  if (canvasCache.has(key)) return canvasCache.get(key)!;

  const glowRadius = radius * 3;
  const size = glowRadius * 2 + 4;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  // Outer glow halo via radial gradient
  const grad = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, glowRadius);
  grad.addColorStop(0, color + 'aa');
  grad.addColorStop(0.4, color + '55');
  grad.addColorStop(1, color + '00');
  ctx.beginPath();
  ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Solid core dot
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Bright white outline
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  canvasCache.set(key, canvas);
  return canvas;
}

function createQuakeCanvas(size: number, color: string, mag: number): HTMLCanvasElement {
  const key = `quake_${size}_${color}_${mag.toFixed(1)}`;
  if (canvasCache.has(key)) return canvasCache.get(key)!;

  const pad = 6;
  const total = size + pad * 2;
  const canvas = document.createElement('canvas');
  canvas.width = total;
  canvas.height = total;
  const ctx = canvas.getContext('2d')!;
  const cx = total / 2;
  const cy = total / 2;
  const r = size / 2;

  // Outer pulse ring (soft glow)
  ctx.beginPath();
  ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.18;
  ctx.fill();

  // Middle ring
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Inner filled circle
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // White seismograph zigzag across the center
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(1.2, size / 18);
  ctx.beginPath();
  const halfW = r * 0.42;
  const amp = r * (mag >= 5 ? 0.35 : mag >= 3 ? 0.25 : 0.16);
  const steps = 6;
  const stepX = (halfW * 2) / steps;
  ctx.moveTo(cx - halfW, cy);
  for (let i = 1; i <= steps; i++) {
    const x = cx - halfW + i * stepX;
    const dir = i % 2 === 1 ? -1 : 1;
    const peakAmp = i === 2 || i === 3 ? amp : amp * 0.5;
    ctx.lineTo(x, cy + dir * peakAmp);
  }
  ctx.lineTo(cx + halfW, cy);
  ctx.stroke();

  // Outer crisp ring
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  canvasCache.set(key, canvas);
  return canvas;
}

function createPlaneCanvas(
  color: string,
  size = 20,
  military = false
): HTMLCanvasElement {
  const key = `plane_${color}_${size}_${military ? 'mil' : 'civil'}`;
  if (canvasCache.has(key)) return canvasCache.get(key)!;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  const s = size / 20;

  if (military) {
    // Military: transparent icon with orange chevron only.
    const cx = size / 2;
    const cy = size / 2;
    const wing = size * 0.24;
    const body = size * 0.16;

    // Main chevron (forward pointer).
    ctx.fillStyle = '#e53935';
    ctx.beginPath();
    ctx.moveTo(cx + wing, cy);
    ctx.lineTo(cx - wing, cy - wing * 0.9);
    ctx.lineTo(cx - body, cy);
    ctx.lineTo(cx - wing, cy + wing * 0.9);
    ctx.closePath();
    ctx.fill();

    // Inner cut to create a tactical chevron look.
    ctx.fillStyle = 'rgba(229, 57, 53, 0.5)';
    ctx.beginPath();
    ctx.moveTo(cx + body * 0.95, cy);
    ctx.lineTo(cx - body * 0.7, cy - body * 0.62);
    ctx.lineTo(cx - body * 0.1, cy);
    ctx.lineTo(cx - body * 0.7, cy + body * 0.62);
    ctx.closePath();
    ctx.fill();
  } else {
    // Civil: pure white airplane silhouette (top-down, pointing up), no glow
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = Math.max(1.35, size * 0.085);

    ctx.beginPath();
    // Fuselage
    ctx.moveTo(10 * s, 2 * s);
    ctx.lineTo(12 * s, 14 * s);
    ctx.lineTo(10 * s, 12 * s);
    ctx.lineTo(8 * s, 14 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Wings
    ctx.beginPath();
    ctx.moveTo(10 * s, 7 * s);
    ctx.lineTo(18 * s, 12 * s);
    ctx.lineTo(16 * s, 12 * s);
    ctx.lineTo(10 * s, 9 * s);
    ctx.lineTo(4 * s, 12 * s);
    ctx.lineTo(2 * s, 12 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Tail
    ctx.beginPath();
    ctx.moveTo(10 * s, 13 * s);
    ctx.lineTo(14 * s, 18 * s);
    ctx.lineTo(10 * s, 16 * s);
    ctx.lineTo(6 * s, 18 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  canvasCache.set(key, canvas);
  return canvas;
}

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [1, 1, 1];
  return [
    parseInt(result[1], 16) / 255,
    parseInt(result[2], 16) / 255,
    parseInt(result[3], 16) / 255,
  ];
}

function defaultCal(): CameraCalibration {
  return { heading: 0, pitch: -15, fov: 60, range: 200, height: 5, northM: 0, eastM: 0 };
}

// ── Trade Routes layer ───────────────────────────────────────────────────

import {
  renderTradeRoutes,
  identifyTradeRoutePick,
  type TradeRouteRenderOptions,
  type TradeRouteLayerHandle,
} from "./tradeRoutes/render";

export type { TradeRouteLayerHandle, TradeRouteRenderOptions };
export { identifyTradeRoutePick };

let activeTradeRouteHandle: TradeRouteLayerHandle | null = null;

export async function renderTradeRoutesLayer(
  viewer: import("cesium").Viewer,
  options: TradeRouteRenderOptions
): Promise<TradeRouteLayerHandle | null> {
  clearTradeRoutesLayer(viewer);
  if (!isViewerAlive(viewer)) return null;
  const handle = await renderTradeRoutes(viewer, options);
  activeTradeRouteHandle = handle;

  const map = getLayerMap(viewer);
  if (handle) {
    map.set("trade_routes", {
      remove: () => {
        handle.remove();
        activeTradeRouteHandle = null;
      },
    });
  }

  return handle;
}

export function clearTradeRoutesLayer(viewer: import("cesium").Viewer): void {
  clearLayer(viewer, "trade_routes");
  activeTradeRouteHandle = null;
}

export function getActiveTradeRouteHandle(): TradeRouteLayerHandle | null {
  return activeTradeRouteHandle;
}

export function tickTradeRouteAnimation(frameNumber: number): void {
  if (activeTradeRouteHandle) {
    activeTradeRouteHandle.tick(frameNumber);
  }
}

// ── Static GeoJSON point layers (volcanoes, nuclear sites, military bases) ──

interface GeoJsonPointFeature {
  id?: string;
  geometry: { type: string; coordinates: [number, number] };
  properties: Record<string, unknown>;
}

async function renderStaticGeoJsonLayer(
  viewer: import('cesium').Viewer,
  layerName: string,
  features: GeoJsonPointFeature[],
  options: {
    entityType: string;
    dotRadius: number;
    colorFn: (props: Record<string, unknown>) => string;
    labelFn: (props: Record<string, unknown>) => string;
  }
): Promise<void> {
  if (!isViewerAlive(viewer)) return;
  const Cesium = await import('cesium');
  clearLayer(viewer, layerName);
  if (!isViewerAlive(viewer)) return;

  const billboards = new Cesium.BillboardCollection({ scene: viewer.scene });
  const labels = new Cesium.LabelCollection();

  for (const feature of features) {
    if (!isViewerAlive(viewer)) break;
    const [lon, lat] = feature.geometry.coordinates;
    const color = options.colorFn(feature.properties);
    const [r, g, b] = hexToRgb(color);
    const pos = Cesium.Cartesian3.fromDegrees(lon, lat, 500);

    billboards.add({
      position: pos,
      image: createGlowDotCanvas(options.dotRadius, color),
      color: new Cesium.Color(r, g, b, 1.0),
      id: { type: options.entityType, id: feature.id ?? `${layerName}-${lon}-${lat}`, data: feature.properties },
      scaleByDistance: new Cesium.NearFarScalar(5e4, 1.8, 1.8e7, 0.45),
      translucencyByDistance: new Cesium.NearFarScalar(5e5, 1.0, 1.5e7, 0.4),
    });

    const labelText = options.labelFn(feature.properties);
    if (labelText) {
      labels.add({
        position: pos,
        text: labelText,
        font: '11px monospace',
        fillColor: new Cesium.Color(r, g, b, 0.95),
        outlineColor: new Cesium.Color(0.0, 0.0, 0.0, 0.9),
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(10, 0),
        scaleByDistance: new Cesium.NearFarScalar(5e4, 1.0, 5e6, 0.0),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 8e5),
      });
    }
  }

  viewer.scene.primitives.add(billboards);
  viewer.scene.primitives.add(labels);

  const map = getLayerMap(viewer);
  map.set(layerName, {
    remove: () => {
      if (!billboards.isDestroyed()) viewer.scene.primitives.remove(billboards);
      if (!labels.isDestroyed()) viewer.scene.primitives.remove(labels);
    },
  });
}

// ── Country borders (polygon outlines from GeoJSON) ─────────────────────────

interface CountryBorderFeature {
  id?: string;
  properties: Record<string, unknown>;
  geometry: {
    type: string;
    coordinates: number[][][] | number[][][][];
  };
}

export async function renderCountryBorders(
  viewer: import('cesium').Viewer,
  features: CountryBorderFeature[]
): Promise<void> {
  if (!isViewerAlive(viewer)) return;
  const Cesium = await import('cesium');
  clearLayer(viewer, 'country_borders');
  if (!isViewerAlive(viewer)) return;
  if (features.length === 0) return;

  const dataSource = new Cesium.CustomDataSource('country_borders');
  const borderColor = new Cesium.Color(0.75, 0.85, 1.0, 0.7);

  for (let fi = 0; fi < features.length; fi++) {
    const feature = features[fi];
    const { geometry } = feature;
    if (!geometry) continue;

    // Collect exterior rings depending on Polygon vs MultiPolygon
    const rings: number[][][] =
      geometry.type === 'MultiPolygon'
        ? (geometry.coordinates as number[][][][]).map(poly => poly[0])
        : geometry.type === 'Polygon'
          ? [geometry.coordinates[0] as number[][]]
          : [];

    for (let ri = 0; ri < rings.length; ri++) {
      const ring = rings[ri];
      if (!ring || ring.length < 3) continue;

      // Flatten [lon,lat] pairs into a flat array for fromDegreesArray
      const flat: number[] = [];
      for (const coord of ring) {
        flat.push(coord[0], coord[1]);
      }

      dataSource.entities.add({
        id: `border_${fi}_${ri}`,
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray(flat),
          width: 2.0,
          material: borderColor,
          clampToGround: true,
        },
      });
    }
  }

  if (!isViewerAlive(viewer)) return;
  await viewer.dataSources.add(dataSource);

  const map = getLayerMap(viewer);
  map.set('country_borders', {
    remove: () => {
      if (!isViewerAlive(viewer)) return;
      try { viewer.dataSources.remove(dataSource, true); } catch { /* */ }
    },
    dataSource,
  });
}

export async function renderVolcanoes(
  viewer: import('cesium').Viewer,
  features: GeoJsonPointFeature[]
): Promise<void> {
  return renderStaticGeoJsonLayer(viewer, 'volcanoes', features, {
    entityType: 'volcano',
    dotRadius: 6,
    colorFn: (props) => (props.status === 'active' ? '#ff6d00' : '#ffa726'),
    labelFn: (props) => {
      const name = (props.name as string) || '';
      const status = (props.status as string) || '';
      return `${name} [${status.toUpperCase()}]`;
    },
  });
}

export async function renderNuclearSites(
  viewer: import('cesium').Viewer,
  features: GeoJsonPointFeature[]
): Promise<void> {
  return renderStaticGeoJsonLayer(viewer, 'nuclear_sites', features, {
    entityType: 'nuclear-site',
    dotRadius: 5,
    colorFn: () => '#fdd835',
    labelFn: (props) => {
      const name = (props.name as string) || '';
      const capacity = (props.capacity as string) || '';
      return capacity ? `${name} (${capacity})` : name;
    },
  });
}

export async function renderMilitaryBases(
  viewer: import('cesium').Viewer,
  features: GeoJsonPointFeature[]
): Promise<void> {
  return renderStaticGeoJsonLayer(viewer, 'military_bases', features, {
    entityType: 'military-base',
    dotRadius: 5,
    colorFn: () => '#69f0ae',
    labelFn: (props) => {
      const aka = (props.aka as string) || '';
      const name = (props.name as string) || '';
      const sponsor = (props.sponsor as string) || '';
      const label = aka || name;
      return sponsor ? `${label} (${sponsor})` : label;
    },
  });
}
