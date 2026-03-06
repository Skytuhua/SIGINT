/**
 * Generate static GeoJSON files for the MapLibre news layer:
 *   - trade-routes.geojson       (LineString features per route)
 *   - trade-route-nodes.geojson  (Point features for hubs + chokepoints)
 *
 * Run with: npx tsx scripts/generate-trade-routes-geojson.ts
 */
import { TRADE_ROUTE_GRAPH, NODE_MAP } from "../src/lib/cesium/tradeRoutes/data";
import { buildRoutePolyline } from "../src/lib/cesium/tradeRoutes/geometry";
import { writeFileSync } from "fs";
import { join } from "path";

const routeFeatures = TRADE_ROUTE_GRAPH.routes.map((route) => {
  const coords = buildRoutePolyline(route, NODE_MAP);
  return {
    type: "Feature" as const,
    id: route.id,
    geometry: {
      type: "LineString" as const,
      coordinates: coords,
    },
    properties: {
      name: route.name,
      category: route.category,
      importance: route.importance,
      startHub: route.startHub,
      endHub: route.endHub,
      whyItMatters: route.whyItMatters,
      keyChokepoints: route.keyChokepoints.join(","),
      sourceTrace: route.sourceTrace.join(" "),
      ts: Date.now(),
    },
  };
});

const routeGeoJson = { type: "FeatureCollection" as const, features: routeFeatures };
const routePath = join(__dirname, "..", "public", "data", "news-layers", "trade-routes.geojson");
writeFileSync(routePath, JSON.stringify(routeGeoJson));
console.log(`Wrote ${routeFeatures.length} routes to ${routePath}`);

const usedNodeIds = new Set<string>();
for (const route of TRADE_ROUTE_GRAPH.routes) {
  for (const wp of route.waypoints) {
    const node = NODE_MAP.get(wp);
    if (node && (node.type === "hub" || node.type === "chokepoint")) {
      usedNodeIds.add(node.id);
    }
  }
}

const nodeFeatures = TRADE_ROUTE_GRAPH.nodes
  .filter((n) => usedNodeIds.has(n.id))
  .map((n) => ({
    type: "Feature" as const,
    id: n.id,
    geometry: {
      type: "Point" as const,
      coordinates: [n.lon, n.lat],
    },
    properties: {
      name: n.name,
      nodeType: n.type,
      country: n.country ?? "",
      wikidataId: n.wikidataId ?? "",
      summary: n.summary ?? "",
      topExports: (n.topExports ?? []).join(", "),
      topImports: (n.topImports ?? []).join(", "),
      throughput: n.throughput ?? "",
      globalRank: n.globalRank ?? "",
      dailyVessels: n.dailyVessels ?? 0,
      tradeSharePct: n.tradeSharePct ?? "",
      widthKm: n.widthKm ?? 0,
      primaryCommodities: (n.primaryCommodities ?? []).join(", "),
      controlledBy: n.controlledBy ?? "",
      ts: Date.now(),
    },
  }));

const nodesGeoJson = { type: "FeatureCollection" as const, features: nodeFeatures };
const nodesPath = join(__dirname, "..", "public", "data", "news-layers", "trade-route-nodes.geojson");
writeFileSync(nodesPath, JSON.stringify(nodesGeoJson));
console.log(`Wrote ${nodeFeatures.length} nodes to ${nodesPath}`);
