import type { TradeRoute, TradeRouteNode } from "./types";

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Interpolate N points along a great-circle arc between two lon/lat pairs.
 * Returns an array of [lon, lat] in degrees (inclusive of start and end).
 */
export function greatCircleArc(
  lon1: number, lat1: number,
  lon2: number, lat2: number,
  segments: number
): [number, number][] {
  const phi1 = lat1 * DEG2RAD;
  const lam1 = lon1 * DEG2RAD;
  const phi2 = lat2 * DEG2RAD;
  const lam2 = lon2 * DEG2RAD;

  const dPhi = phi2 - phi1;
  const dLam = lam2 - lam1;
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) ** 2;
  const angularDist = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  if (angularDist < 1e-10) {
    return [[lon1, lat1], [lon2, lat2]];
  }

  const pts: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const f = i / segments;
    const A = Math.sin((1 - f) * angularDist) / Math.sin(angularDist);
    const B = Math.sin(f * angularDist) / Math.sin(angularDist);
    const x = A * Math.cos(phi1) * Math.cos(lam1) + B * Math.cos(phi2) * Math.cos(lam2);
    const y = A * Math.cos(phi1) * Math.sin(lam1) + B * Math.cos(phi2) * Math.sin(lam2);
    const z = A * Math.sin(phi1) + B * Math.sin(phi2);
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * RAD2DEG;
    const lon = Math.atan2(y, x) * RAD2DEG;
    pts.push([lon, lat]);
  }
  return pts;
}

/**
 * Approximate distance in km between two lon/lat points (haversine).
 */
function haversineKm(
  lon1: number, lat1: number,
  lon2: number, lat2: number
): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * DEG2RAD;
  const dLon = (lon2 - lon1) * DEG2RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Choose segment count based on arc distance.
 * Longer arcs get more interpolation points for smooth curvature.
 */
function segmentsForDistance(km: number): number {
  if (km < 500) return 8;
  if (km < 2000) return 16;
  if (km < 5000) return 32;
  if (km < 10000) return 48;
  return 64;
}

/**
 * Unwrap longitudes so consecutive points never differ by more than 180°.
 * This prevents MapLibre from drawing a straight line across the antimeridian
 * for routes that cross the 180° meridian (e.g. Transpacific).
 */
function unwrapLongitudes(pts: [number, number][]): [number, number][] {
  if (pts.length === 0) return pts;
  const out: [number, number][] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    let lon = pts[i][0];
    const prev = out[i - 1][0];
    while (lon - prev > 180) lon -= 360;
    while (lon - prev < -180) lon += 360;
    out.push([lon, pts[i][1]]);
  }
  return out;
}

/**
 * Build a polyline (as [lon, lat][] ) for a route by chaining great-circle
 * arcs between consecutive waypoint nodes.
 */
export function buildRoutePolyline(
  route: TradeRoute,
  nodeMap: Map<string, TradeRouteNode>
): [number, number][] {
  const coords: [number, number][] = [];

  for (let i = 0; i < route.waypoints.length - 1; i++) {
    const a = nodeMap.get(route.waypoints[i]);
    const b = nodeMap.get(route.waypoints[i + 1]);
    if (!a || !b) continue;

    const dist = haversineKm(a.lon, a.lat, b.lon, b.lat);
    const segs = segmentsForDistance(dist);
    const arc = greatCircleArc(a.lon, a.lat, b.lon, b.lat, segs);

    if (i === 0) {
      coords.push(...arc);
    } else {
      coords.push(...arc.slice(1));
    }
  }

  return unwrapLongitudes(coords);
}

/**
 * Douglas-Peucker simplification on [lon, lat][] polyline.
 */
export function simplifyPolyline(
  pts: [number, number][],
  tolerance: number
): [number, number][] {
  if (pts.length <= 2) return pts;

  let maxDist = 0;
  let maxIdx = 0;
  const first = pts[0];
  const last = pts[pts.length - 1];

  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpendicularDistance(pts[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > tolerance) {
    const left = simplifyPolyline(pts.slice(0, maxIdx + 1), tolerance);
    const right = simplifyPolyline(pts.slice(maxIdx), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  return [first, last];
}

function perpendicularDistance(
  pt: [number, number],
  lineA: [number, number],
  lineB: [number, number]
): number {
  const dx = lineB[0] - lineA[0];
  const dy = lineB[1] - lineA[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((pt[0] - lineA[0]) ** 2 + (pt[1] - lineA[1]) ** 2);
  const t = Math.max(0, Math.min(1, ((pt[0] - lineA[0]) * dx + (pt[1] - lineA[1]) * dy) / lenSq));
  const projX = lineA[0] + t * dx;
  const projY = lineA[1] + t * dy;
  return Math.sqrt((pt[0] - projX) ** 2 + (pt[1] - projY) ** 2);
}

// ── Precomputed geometry cache ───────────────────────────────────────────

export interface RouteGeometry {
  routeId: string;
  /** Full-resolution [lon, lat][] */
  full: [number, number][];
  /** Simplified for low zoom */
  simplified: [number, number][];
  /** Total route length in km */
  lengthKm: number;
}

const geometryCache = new Map<string, RouteGeometry>();

/**
 * Build and cache geometry for a single route.
 */
export function getRouteGeometry(
  route: TradeRoute,
  nodeMap: Map<string, TradeRouteNode>
): RouteGeometry {
  const cached = geometryCache.get(route.id);
  if (cached) return cached;

  const full = buildRoutePolyline(route, nodeMap);
  const simplified = simplifyPolyline(full, 0.8);

  let lengthKm = 0;
  for (let i = 1; i < full.length; i++) {
    lengthKm += haversineKm(full[i - 1][0], full[i - 1][1], full[i][0], full[i][1]);
  }

  const geom: RouteGeometry = { routeId: route.id, full, simplified, lengthKm };
  geometryCache.set(route.id, geom);
  return geom;
}

/**
 * Precompute geometries for all routes in the graph.
 */
export function precomputeAllGeometries(
  routes: TradeRoute[],
  nodeMap: Map<string, TradeRouteNode>
): Map<string, RouteGeometry> {
  for (const route of routes) {
    getRouteGeometry(route, nodeMap);
  }
  return geometryCache;
}

/**
 * Sample evenly-spaced points along a polyline for arrow placement.
 * Returns [lon, lat, bearingDeg][] where bearing is the forward direction.
 */
export function samplePointsAlongPolyline(
  pts: [number, number][],
  spacingKm: number
): [number, number, number][] {
  if (pts.length < 2) return [];

  const result: [number, number, number][] = [];
  let accum = spacingKm * 0.5; // start half-spacing in

  for (let i = 1; i < pts.length; i++) {
    const segLen = haversineKm(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    if (segLen < 0.01) continue;

    const bearing = forwardBearing(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);

    while (accum <= segLen) {
      const f = accum / segLen;
      const lon = pts[i - 1][0] + f * (pts[i][0] - pts[i - 1][0]);
      const lat = pts[i - 1][1] + f * (pts[i][1] - pts[i - 1][1]);
      result.push([lon, lat, bearing]);
      accum += spacingKm;
    }
    accum -= segLen;
  }

  return result;
}

function forwardBearing(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const dLon = (lon2 - lon1) * DEG2RAD;
  const phi1 = lat1 * DEG2RAD;
  const phi2 = lat2 * DEG2RAD;
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * RAD2DEG) + 360) % 360;
}
