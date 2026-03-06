import type { TradeRoute, TradeRouteNode, TradeRouteCategory } from "./types";
import { CATEGORY_COLORS } from "./types";
import { TRADE_ROUTE_GRAPH, NODE_MAP } from "./data";
import {
  precomputeAllGeometries,
  samplePointsAlongPolyline,
  type RouteGeometry,
} from "./geometry";

// ── Types ────────────────────────────────────────────────────────────────

export interface TradeRouteRenderOptions {
  categoryFilters: Record<TradeRouteCategory, boolean>;
  selectedRouteId?: string | null;
  hoveredRouteId?: string | null;
  selectedNodeId?: string | null;
  hoveredNodeId?: string | null;
}

export interface TradeRouteLayerHandle {
  remove: () => void;
  /** Call each frame from scene.preRender to advance dash animation. */
  tick: (frameNumber: number) => void;
  /** Update visual state (selection, hover, filters) without full rebuild. */
  updateState: (options: TradeRouteRenderOptions) => void;
}

// ── Canvas icon helpers ──────────────────────────────────────────────────

const iconCache = new Map<string, HTMLCanvasElement>();

function createHubHaloCanvas(radius: number, color: string): HTMLCanvasElement {
  const key = `hub_halo_${radius}_${color}`;
  if (iconCache.has(key)) return iconCache.get(key)!;

  const size = radius * 2 + 16;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cx = size / 2;
  const cy = size / 2;

  // Outer glow ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.12;
  ctx.fill();

  // Mid ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 1, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.5;
  ctx.stroke();

  // Core dot
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.fill();

  // Bright inner highlight
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.globalAlpha = 0.6;
  ctx.fill();

  iconCache.set(key, canvas);
  return canvas;
}

function createChokepointCanvas(radius: number, color: string): HTMLCanvasElement {
  const key = `choke_${radius}_${color}`;
  if (iconCache.has(key)) return iconCache.get(key)!;

  const size = radius * 2 + 8;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cx = size / 2;
  const cy = size / 2;

  // Crisp diamond shape
  ctx.beginPath();
  ctx.moveTo(cx, cy - radius);
  ctx.lineTo(cx + radius, cy);
  ctx.lineTo(cx, cy + radius);
  ctx.lineTo(cx - radius, cy);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.95;
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.7;
  ctx.stroke();

  iconCache.set(key, canvas);
  return canvas;
}

function createArrowCanvas(size: number, color: string): HTMLCanvasElement {
  const key = `arrow_${size}_${color}`;
  if (iconCache.has(key)) return iconCache.get(key)!;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.35;

  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(cx + r, cy);
  ctx.lineTo(cx - r * 0.6, cy - r * 0.7);
  ctx.lineTo(cx - r * 0.2, cy);
  ctx.lineTo(cx - r * 0.6, cy + r * 0.7);
  ctx.closePath();
  ctx.fill();

  iconCache.set(key, canvas);
  return canvas;
}

// ── Hex to RGB helper ────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [1, 1, 1];
  return [
    parseInt(result[1], 16) / 255,
    parseInt(result[2], 16) / 255,
    parseInt(result[3], 16) / 255,
  ];
}

// ── Route color helper ───────────────────────────────────────────────────

function routeColor(route: TradeRoute): string {
  return CATEGORY_COLORS[route.category] ?? "#4fc3f7";
}

function routeBaseWidth(route: TradeRoute): number {
  return 1.0 + route.importance * 0.6;
}

// ── Main render function ─────────────────────────────────────────────────

export async function renderTradeRoutes(
  viewer: import("cesium").Viewer,
  options: TradeRouteRenderOptions
): Promise<TradeRouteLayerHandle | null> {
  if (!viewer || viewer.isDestroyed()) return null;

  const Cesium = await import("cesium");
  if (viewer.isDestroyed()) return null;

  const graph = TRADE_ROUTE_GRAPH;
  const geometries = precomputeAllGeometries(graph.routes, NODE_MAP);

  // Determine which routes to render based on category filters
  const activeRoutes = graph.routes.filter(
    (r) => options.categoryFilters[r.category]
  );

  // ── Route polylines (Entity API for dash material support) ──────────
  const routeDataSource = new Cesium.CustomDataSource("trade_routes");

  // Track entities by route for state updates
  const routeEntityMap = new Map<string, {
    glow: import("cesium").Entity;
    dash: import("cesium").Entity;
  }>();

  // Shared time-based dash offset for animation
  let dashOffset = 0;

  for (const route of activeRoutes) {
    const geom = geometries.get(route.id);
    if (!geom || geom.full.length < 2) continue;

    const color = routeColor(route);
    const [r, g, b] = hexToRgb(color);
    const baseWidth = routeBaseWidth(route);
    const isSelected = route.id === options.selectedRouteId;
    const isHovered = route.id === options.hoveredRouteId;
    const brightnessMult = isSelected ? 1.0 : isHovered ? 0.85 : 0.6;

    const positions = geom.full.map(([lon, lat]) =>
      Cesium.Cartesian3.fromDegrees(lon, lat, 500)
    );

    // Base glow polyline
    const glowEntity = routeDataSource.entities.add({
      id: `trade_route_glow_${route.id}`,
      polyline: {
        positions,
        width: baseWidth * 4,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.15,
          color: new Cesium.Color(r, g, b, 0.15 * brightnessMult),
        }),
        clampToGround: false,
      },
      properties: {
        type: "trade_route",
        routeId: route.id,
        routeName: route.name,
        category: route.category,
      },
    });

    // Dashed flow polyline with animated offset via CallbackProperty
    const dashEntity = routeDataSource.entities.add({
      id: `trade_route_dash_${route.id}`,
      polyline: {
        positions,
        width: baseWidth * 1.8,
        material: new Cesium.PolylineDashMaterialProperty({
          color: new Cesium.Color(r, g, b, 0.7 * brightnessMult),
          gapColor: new Cesium.Color(r, g, b, 0.08 * brightnessMult),
          dashLength: new Cesium.CallbackProperty(() => {
            return 16 + Math.sin(dashOffset * 0.02) * 4;
          }, false) as unknown as number,
          dashPattern: 0b1111111100000000,
        }),
        clampToGround: false,
      },
      properties: {
        type: "trade_route",
        routeId: route.id,
        routeName: route.name,
        category: route.category,
      },
    });

    routeEntityMap.set(route.id, { glow: glowEntity, dash: dashEntity });
  }

  await viewer.dataSources.add(routeDataSource);

  // ── Arrow billboards ───────────────────────────────────────────────
  const arrowBillboards = new Cesium.BillboardCollection({ scene: viewer.scene });

  for (const route of activeRoutes) {
    const geom = geometries.get(route.id);
    if (!geom || geom.full.length < 2) continue;

    const color = routeColor(route);
    const spacingKm = route.importance >= 4 ? 600 : 900;
    const arrowPts = samplePointsAlongPolyline(geom.full, spacingKm);

    for (const [lon, lat, bearing] of arrowPts) {
      arrowBillboards.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 600),
        image: createArrowCanvas(16, color),
        rotation: Cesium.Math.toRadians(-bearing + 90),
        alignedAxis: Cesium.Cartesian3.UNIT_Z,
        id: { type: "trade_route_arrow", routeId: route.id },
        scaleByDistance: new Cesium.NearFarScalar(1e6, 0.9, 2e7, 0.25),
        translucencyByDistance: new Cesium.NearFarScalar(5e5, 0.8, 2e7, 0.15),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      });
    }
  }

  viewer.scene.primitives.add(arrowBillboards);

  // ── Node billboards (hubs + chokepoints) ───────────────────────────
  const nodeBillboards = new Cesium.BillboardCollection({ scene: viewer.scene });
  const nodeLabels = new Cesium.LabelCollection();

  const renderedNodes = new Set<string>();

  for (const route of activeRoutes) {
    for (const wpId of route.waypoints) {
      if (renderedNodes.has(wpId)) continue;
      const node = NODE_MAP.get(wpId);
      if (!node || node.type === "waypoint") continue;
      renderedNodes.add(wpId);

      const isHub = node.type === "hub";
      const isSelectedNode = node.id === options.selectedNodeId;
      const isHoveredNode = node.id === options.hoveredNodeId;

      // Hub color: white/cyan; chokepoint: red/amber
      const nodeColor = isHub ? "#4fc3f7" : "#ff8f6b";
      const [nr, ng, nb] = hexToRgb(nodeColor);
      const alphaBoost = isSelectedNode ? 1.0 : isHoveredNode ? 0.9 : 0.75;

      if (isHub) {
        nodeBillboards.add({
          position: Cesium.Cartesian3.fromDegrees(node.lon, node.lat, 800),
          image: createHubHaloCanvas(8, nodeColor),
          id: { type: "trade_node", nodeId: node.id, nodeType: node.type, nodeName: node.name },
          color: new Cesium.Color(nr, ng, nb, alphaBoost),
          scaleByDistance: new Cesium.NearFarScalar(5e5, 1.2, 2.5e7, 0.35),
          translucencyByDistance: new Cesium.NearFarScalar(5e5, 1.0, 3e7, 0.5),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        });
      } else {
        nodeBillboards.add({
          position: Cesium.Cartesian3.fromDegrees(node.lon, node.lat, 800),
          image: createChokepointCanvas(5, nodeColor),
          id: { type: "trade_node", nodeId: node.id, nodeType: node.type, nodeName: node.name },
          color: new Cesium.Color(nr, ng, nb, alphaBoost),
          scaleByDistance: new Cesium.NearFarScalar(5e5, 1.0, 2e7, 0.3),
          translucencyByDistance: new Cesium.NearFarScalar(5e5, 1.0, 2.5e7, 0.4),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        });
      }

      // Zoom-aware labels: hubs show at further distance, chokepoints closer
      const maxDisplay = isHub ? 12_000_000 : 5_000_000;
      nodeLabels.add({
        position: Cesium.Cartesian3.fromDegrees(node.lon, node.lat, 900),
        text: node.name,
        font: isHub ? "11px monospace" : "10px monospace",
        fillColor: new Cesium.Color(nr, ng, nb, 0.9),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(isHub ? 14 : 10, isHub ? -6 : -4),
        scaleByDistance: new Cesium.NearFarScalar(3e5, 1.0, maxDisplay, 0.0),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, maxDisplay),
        id: { type: "trade_node_label", nodeId: node.id },
      });
    }
  }

  viewer.scene.primitives.add(nodeBillboards);
  viewer.scene.primitives.add(nodeLabels);

  // ── Handle: cleanup + tick + updateState ──────────────────────────

  const handle: TradeRouteLayerHandle = {
    remove: () => {
      if (!viewer.isDestroyed()) {
        viewer.dataSources.remove(routeDataSource, true);
        if (!arrowBillboards.isDestroyed()) viewer.scene.primitives.remove(arrowBillboards);
        if (!nodeBillboards.isDestroyed()) viewer.scene.primitives.remove(nodeBillboards);
        if (!nodeLabels.isDestroyed()) viewer.scene.primitives.remove(nodeLabels);
      }
    },

    tick: (frameNumber: number) => {
      dashOffset = frameNumber;
    },

    updateState: (newOptions: TradeRouteRenderOptions) => {
      // Update route brightness based on selection/hover
      for (const route of activeRoutes) {
        const entities = routeEntityMap.get(route.id);
        if (!entities) continue;

        const color = routeColor(route);
        const [r, g, b] = hexToRgb(color);
        const isSelected = route.id === newOptions.selectedRouteId;
        const isHovered = route.id === newOptions.hoveredRouteId;
        const brightnessMult = isSelected ? 1.0 : isHovered ? 0.85 : 0.6;

        // Update glow alpha
        const glowPoly = entities.glow.polyline;
        if (glowPoly) {
          glowPoly.material = new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.15,
            color: new Cesium.Color(r, g, b, 0.15 * brightnessMult),
          });
          (glowPoly as unknown as { width: unknown }).width = new Cesium.ConstantProperty(
            routeBaseWidth(route) * (isSelected ? 6 : isHovered ? 5 : 4)
          );
        }

        // Update dash alpha
        const dashPoly = entities.dash.polyline;
        if (dashPoly) {
          dashPoly.material = new Cesium.PolylineDashMaterialProperty({
            color: new Cesium.Color(r, g, b, 0.7 * brightnessMult),
            gapColor: new Cesium.Color(r, g, b, 0.08 * brightnessMult),
            dashLength: new Cesium.CallbackProperty(() => {
              return 16 + Math.sin(dashOffset * 0.02) * 4;
            }, false) as unknown as number,
            dashPattern: 0b1111111100000000,
          });
          (dashPoly as unknown as { width: unknown }).width = new Cesium.ConstantProperty(
            routeBaseWidth(route) * (isSelected ? 2.5 : isHovered ? 2.2 : 1.8)
          );
        }
      }
    },
  };

  return handle;
}

/**
 * Identify which trade route or node was picked from a scene.pick() result.
 */
export function identifyTradeRoutePick(
  picked: { id?: unknown; primitive?: { id?: unknown } } | undefined
): { type: "route"; routeId: string } | { type: "node"; nodeId: string } | null {
  if (!picked) return null;

  const id = (picked.id ?? picked.primitive?.id) as Record<string, unknown> | undefined;
  if (!id || typeof id !== "object") return null;

  if (id.type === "trade_route" && typeof id.routeId === "string") {
    return { type: "route", routeId: id.routeId };
  }
  if (id.type === "trade_route_arrow" && typeof id.routeId === "string") {
    return { type: "route", routeId: id.routeId };
  }
  if (id.type === "trade_node" && typeof id.nodeId === "string") {
    return { type: "node", nodeId: id.nodeId };
  }

  return null;
}
