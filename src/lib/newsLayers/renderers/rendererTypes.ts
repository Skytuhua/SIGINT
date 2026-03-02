import type { LayerFeatureCollection, LayerRegistryEntry } from "../types";

export interface LayerRenderer<TMap> {
  mount(layer: LayerRegistryEntry, map: TMap): void;
  updateData(layer: LayerRegistryEntry, map: TMap, data: LayerFeatureCollection): void;
  setVisibility(layer: LayerRegistryEntry, map: TMap, visible: boolean): void;
  setOrder(layer: LayerRegistryEntry, map: TMap, stackOrder?: number): void;
  unmount(layer: LayerRegistryEntry, map: TMap): void;
}
