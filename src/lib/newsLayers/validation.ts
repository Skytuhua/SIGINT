import type { LayerRegistryEntry } from "./types";

const REQUIRED_TYPES = new Set([
  "rasterTiles",
  "geojsonPoints",
  "geojsonLines",
  "geojsonPolygons",
  "heatmap",
  "dynamicEntities",
]);

export function validateLayerRegistry(registry: LayerRegistryEntry[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const stackSeen = new Set<number>();

  registry.forEach((layer, index) => {
    const prefix = `layer[${index}]`;
    if (!layer.id?.trim()) errors.push(`${prefix}: missing id`);
    if (seen.has(layer.id)) errors.push(`${prefix}: duplicate id ${layer.id}`);
    seen.add(layer.id);
    if (!layer.label?.trim()) errors.push(`${prefix}: missing label`);
    if (!REQUIRED_TYPES.has(layer.type)) errors.push(`${prefix}: invalid type ${String(layer.type)}`);
    if (stackSeen.has(layer.stackOrder)) errors.push(`${prefix}: duplicate stackOrder ${layer.stackOrder}`);
    stackSeen.add(layer.stackOrder);

    if (!layer.dataSource) errors.push(`${prefix}: missing dataSource`);
    if (!layer.dataSource.cacheKey?.trim()) errors.push(`${prefix}: missing dataSource.cacheKey`);
    if (!Number.isFinite(layer.dataSource.refreshMs) || layer.dataSource.refreshMs < 250) {
      errors.push(`${prefix}: invalid dataSource.refreshMs`);
    }
    if (!Number.isFinite(layer.stackOrder)) errors.push(`${prefix}: invalid stackOrder`);
    if (!layer.performance || layer.performance.maxFeatures < 1) {
      errors.push(`${prefix}: invalid performance.maxFeatures`);
    }
    if (layer.minZoom != null && layer.maxZoom != null && layer.minZoom > layer.maxZoom) {
      errors.push(`${prefix}: minZoom > maxZoom`);
    }
    if (layer.minCameraHeight != null && layer.maxCameraHeight != null && layer.minCameraHeight > layer.maxCameraHeight) {
      errors.push(`${prefix}: minCameraHeight > maxCameraHeight`);
    }

    if (layer.type === "rasterTiles" && !layer.style.rasterUrlTemplate) {
      errors.push(`${prefix}: rasterTiles requires style.rasterUrlTemplate`);
    }

    if (layer.dataSource.adapter === "route" && !layer.dataSource.routePath) {
      errors.push(`${prefix}: route adapter requires dataSource.routePath`);
    }
    if (layer.dataSource.adapter === "snapshot" && !layer.dataSource.snapshotPath) {
      errors.push(`${prefix}: snapshot adapter requires dataSource.snapshotPath`);
    }
  });

  return errors;
}
