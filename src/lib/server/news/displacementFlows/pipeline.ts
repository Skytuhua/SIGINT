import type { DisplacementFlow, DisplacementFlowParams } from "./types";

type GenericFeature = {
  type: "Feature";
  id?: string | number;
  geometry: { type: "LineString"; coordinates: [number, number][] };
  properties: Record<string, unknown>;
};

export function formatValue(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toLocaleString();
}

/** Build a corridor key for dedup (order-invariant only for same-type flows) */
function corridorKey(flow: DisplacementFlow): string {
  return `${flow.flowType}:${flow.originIso3}:${flow.destinationIso3}`;
}

/**
 * Merge UNHCR refugee flows and IDMC IDP flows.
 * If the same refugee corridor appears in both sources, UNHCR is primary and
 * IDMC corroborates (stored separately in the feature properties).
 */
export function mergeFlows(
  unhcrFlows: DisplacementFlow[],
  idmcFlows: DisplacementFlow[],
  params: DisplacementFlowParams
): DisplacementFlow[] {
  const { mode = "all", cause = [], minVolume = 0, maxFeatures = 2000 } = params;

  // Dedup: prefer UNHCR for refugee corridors; no overlap expected for IDPs
  const seen = new Map<string, DisplacementFlow>();

  for (const flow of unhcrFlows) {
    seen.set(corridorKey(flow), flow);
  }

  for (const flow of idmcFlows) {
    const key = corridorKey(flow);
    if (seen.has(key)) {
      // Same IDP corridor already present — just add corroboration
      const existing = seen.get(key)!;
      seen.set(key, {
        ...existing,
        corroboratedValue: flow.value,
        corroboratedSource: flow.sourceName,
        sourceName: existing.sourceName === flow.sourceName
          ? existing.sourceName
          : `${existing.sourceName} + ${flow.sourceName}`,
      });
    } else {
      seen.set(key, flow);
    }
  }

  let flows = Array.from(seen.values());

  // Filter by mode
  if (mode !== "all") {
    flows = flows.filter((f) => f.flowType === mode);
  }

  // Filter by cause
  if (cause.length > 0) {
    flows = flows.filter((f) => f.cause && cause.includes(f.cause));
  }

  // Filter by minimum volume
  if (minVolume > 0) {
    flows = flows.filter((f) => f.value >= minVolume);
  }

  // Sort descending by value
  flows.sort((a, b) => b.value - a.value);

  // Cap
  return flows.slice(0, maxFeatures);
}

export function toFeature(flow: DisplacementFlow): GenericFeature {
  return {
    type: "Feature",
    id: flow.id,
    geometry: {
      type: "LineString",
      coordinates: [
        [flow.originLon, flow.originLat],
        [flow.destLon, flow.destLat],
      ],
    },
    properties: {
      type: "displacement_flow",
      flowType: flow.flowType,
      corridorName: flow.corridorName,
      originName: flow.originName,
      originIso3: flow.originIso3,
      originLat: flow.originLat,
      originLon: flow.originLon,
      destinationName: flow.destinationName,
      destinationIso3: flow.destinationIso3,
      destLat: flow.destLat,
      destLon: flow.destLon,
      value: flow.value,
      valueFormatted: flow.valueFormatted,
      unit: flow.unit,
      cause: flow.cause ?? null,
      confidence: flow.confidence,
      timeRangeFrom: flow.timeRangeFrom,
      timeRangeTo: flow.timeRangeTo,
      sourceName: flow.sourceName,
      sourceUrl: flow.sourceUrl,
      corroboratedValue: flow.corroboratedValue ?? null,
      corroboratedSource: flow.corroboratedSource ?? null,
      lastUpdated: flow.lastUpdated,
      ts: flow.ts,
    },
  };
}
