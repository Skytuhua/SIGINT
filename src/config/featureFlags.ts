export interface FeatureFlags {
  enablePanelDragResize: boolean;
  enableTableArrowNav: boolean;
  enablePanelHotkeys: boolean;
  enableInspectorSplitView: boolean;
}

function flag(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw == null) return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

export const featureFlags: FeatureFlags = {
  enablePanelDragResize: flag("NEXT_PUBLIC_ENABLE_PANEL_DRAG_RESIZE", true),
  enableTableArrowNav: flag("NEXT_PUBLIC_ENABLE_TABLE_ARROW_NAV", false),
  enablePanelHotkeys: flag("NEXT_PUBLIC_ENABLE_PANEL_HOTKEYS", false),
  enableInspectorSplitView: flag("NEXT_PUBLIC_ENABLE_INSPECTOR_SPLIT_VIEW", false),
};

