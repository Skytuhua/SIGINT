import type { LayerFeature, LayerFeatureCollection, LayerHealthState } from "./types";

interface LayerStoreState {
  enabled: Record<string, boolean>;
  data: Record<string, LayerFeatureCollection | null>;
  health: Record<string, LayerHealthState>;
  clickHandlers: Record<string, ((feature: LayerFeature) => void) | undefined>;
}

const state: LayerStoreState = {
  enabled: {},
  data: {},
  health: {},
  clickHandlers: {},
};

export function setLayerEnabled(layerId: string, enabled: boolean): void {
  state.enabled[layerId] = enabled;
}

export function setLayerData(layerId: string, data: LayerFeatureCollection | null): void {
  state.data[layerId] = data;
}

export function setLayerHealth(layerId: string, health: LayerHealthState): void {
  state.health[layerId] = health;
}

export function getLayerData(layerId: string): LayerFeatureCollection | null {
  return state.data[layerId] ?? null;
}

export function getLayerHealth(layerId: string): LayerHealthState | null {
  return state.health[layerId] ?? null;
}

export function isLayerEnabled(layerId: string): boolean {
  return state.enabled[layerId] === true;
}

export function setLayerClickHandler(
  layerId: string,
  handler: ((feature: LayerFeature) => void) | null
): void {
  if (handler) {
    state.clickHandlers[layerId] = handler;
  } else {
    delete state.clickHandlers[layerId];
  }
}

export function getLayerClickHandler(
  layerId: string
): ((feature: LayerFeature) => void) | undefined {
  return state.clickHandlers[layerId];
}

export function resetLayerStore(): void {
  state.enabled = {};
  state.data = {};
  state.health = {};
  state.clickHandlers = {};
}
