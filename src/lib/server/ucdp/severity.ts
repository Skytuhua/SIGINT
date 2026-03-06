import type { UcdpViolenceType } from "./types";

export type SeverityLabel = "Low" | "Moderate" | "High" | "Severe";

const VIOLENCE_TYPE_WEIGHT: Record<UcdpViolenceType, number> = {
  "state-based": 1.0,
  "non-state": 0.95,
  "one-sided": 1.1,
};

const LOG_SCALE_K = 38;
const BASE_OFFSET = 8;

export function computeUcdpSeverity(
  fatalitiesBest: number,
  violenceType: UcdpViolenceType,
  clusterCount = 1,
): number {
  const fatalities = Math.max(0, fatalitiesBest);
  const fatalityScore = Math.log10(1 + fatalities) * LOG_SCALE_K;
  const typeWeight = VIOLENCE_TYPE_WEIGHT[violenceType] ?? 1.0;
  const persistenceBoost =
    clusterCount > 1 ? Math.min(15, Math.log2(1 + clusterCount) * 4) : 0;

  const raw = BASE_OFFSET + fatalityScore * typeWeight + persistenceBoost;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function severityLabel(score: number): SeverityLabel {
  if (score >= 75) return "Severe";
  if (score >= 50) return "High";
  if (score >= 25) return "Moderate";
  return "Low";
}
