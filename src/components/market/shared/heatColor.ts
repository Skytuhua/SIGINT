/** Solid-fill tile color for treemap heatmap cells (Finviz-style). */
export function heatColor(pct: number): string {
  if (pct >=  20) return "#145214";
  if (pct >=  10) return "#1a6b1a";
  if (pct >=   5) return "#1e7d22";
  if (pct >=   2) return "#1a5c1a";
  if (pct >=   0.5) return "#133d13";
  if (pct >=  -0.5) return "#1c2220";
  if (pct >=  -2)   return "#4a1414";
  if (pct >=  -5)   return "#6b1818";
  if (pct >= -10)   return "#8b1a1a";
  return                   "#a82020";
}

/** Text color for percentage labels — white in treemap context. */
export function heatTextColor(_pct: number): string {
  return "#ffffff";
}

/**
 * Lighter rgba variant — use this for spark-chart fills, gauge backgrounds,
 * or anywhere you need a translucent heat indicator instead of a solid tile.
 */
export function heatColorAlpha(pct: number): string {
  if (pct <= -2)   return "rgba(255,90,95,0.50)";
  if (pct <= -1)   return "rgba(255,90,95,0.32)";
  if (pct <= -0.5) return "rgba(255,90,95,0.18)";
  if (pct <  0.5)  return "rgba(80,100,125,0.14)";
  if (pct <  1)    return "rgba(54,179,126,0.18)";
  if (pct <  2)    return "rgba(54,179,126,0.32)";
  return                   "rgba(54,179,126,0.50)";
}
