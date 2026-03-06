import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LayerFeatureCollection } from "../../../newsLayers/types";
import type {
  ArmsEmbargoProgramme,
  ArmsEmbargoCountryAggregate,
  ArmsEmbargoStatus,
  ArmsEmbargoScope,
} from "./types";

interface CountryFeature {
  type: "Feature";
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: unknown;
  };
  properties: Record<string, unknown>;
}

interface CountryGeoJson {
  type: "FeatureCollection";
  features: CountryFeature[];
}

let cachedCountryIndex: Map<string, CountryFeature> | null = null;

async function loadCountryIndex(): Promise<Map<string, CountryFeature>> {
  if (cachedCountryIndex) return cachedCountryIndex;

  const filePath = path.join(process.cwd(), "public", "data", "ne_50m_admin_0_countries.geojson");
  const text = await readFile(filePath, "utf8");
  const geojson = JSON.parse(text) as CountryGeoJson;

  const index = new Map<string, CountryFeature>();
  for (const feature of geojson.features) {
    const props = feature.properties ?? {};
    const iso =
      (props.ISO_A2_EH as string) ||
      (props.ISO_A2 as string) ||
      (props.WB_A2 as string) ||
      (props.POSTAL as string);
    if (iso && iso !== "-99" && iso.length === 2) {
      index.set(iso.toUpperCase(), feature);
    }
  }

  cachedCountryIndex = index;
  return index;
}

function dominantStatus(programmes: ArmsEmbargoProgramme[]): ArmsEmbargoStatus {
  if (programmes.some((p) => p.status === "Active")) return "Active";
  if (programmes.some((p) => p.status === "Unknown")) return "Unknown";
  return "Ended";
}

function dominantScope(programmes: ArmsEmbargoProgramme[]): ArmsEmbargoScope {
  if (programmes.some((p) => p.scope === "Full")) return "Full";
  if (programmes.some((p) => p.scope === "Partial")) return "Partial";
  return "Unknown";
}

function computeCentroid(geometry: CountryFeature["geometry"]): [number, number] {
  let coords: number[][][] = [];
  if (geometry.type === "Polygon") {
    coords = [geometry.coordinates as unknown as number[][]];
  } else if (geometry.type === "MultiPolygon") {
    const multi = geometry.coordinates as unknown as number[][][][];
    coords = multi.map((poly) => poly[0]);
  }

  let sumLon = 0;
  let sumLat = 0;
  let count = 0;
  for (const ring of coords) {
    if (!ring) continue;
    for (const pt of ring) {
      if (!pt || pt.length < 2) continue;
      sumLon += pt[0];
      sumLat += pt[1];
      count++;
    }
  }

  return count > 0 ? [sumLon / count, sumLat / count] : [0, 0];
}

export interface BuildResult {
  collection: LayerFeatureCollection;
  unmatched: string[];
}

export async function buildCountryAggregates(
  programmes: ArmsEmbargoProgramme[]
): Promise<BuildResult> {
  const countryIndex = await loadCountryIndex();

  const byCountry = new Map<string, ArmsEmbargoProgramme[]>();
  const unmatchedSet = new Set<string>();

  for (const prog of programmes) {
    for (const isoCode of prog.targets) {
      if (!countryIndex.has(isoCode)) {
        unmatchedSet.add(isoCode);
        continue;
      }
      const list = byCountry.get(isoCode) ?? [];
      list.push(prog);
      byCountry.set(isoCode, list);
    }

    if (prog.targets.length === 0) {
      unmatchedSet.add(prog.wikidataQid ?? prog.id);
    }
  }

  const features: LayerFeatureCollection["features"] = [];

  for (const [code, progs] of Array.from(byCountry.entries())) {
    const countryFeature = countryIndex.get(code);
    if (!countryFeature) continue;

    const countryName =
      (countryFeature.properties?.NAME as string) ||
      (countryFeature.properties?.ADMIN as string) ||
      code;

    const sortedProgs = [...progs].sort((a, b) => {
      if (a.status === "Active" && b.status !== "Active") return -1;
      if (a.status !== "Active" && b.status === "Active") return 1;
      return (a.startDate ?? "").localeCompare(b.startDate ?? "");
    });

    const aggregate: ArmsEmbargoCountryAggregate = {
      countryCode: code,
      countryLabel: countryName,
      programmes: sortedProgs,
      programmeCount: sortedProgs.length,
      activeProgrammeCount: sortedProgs.filter((p) => p.status === "Active").length,
      dominantStatus: dominantStatus(sortedProgs),
      dominantScope: dominantScope(sortedProgs),
    };

    const [centLon, centLat] = computeCentroid(countryFeature.geometry);

    const latestUpdate = sortedProgs
      .map((p) => p.lastUpdated)
      .filter(Boolean)
      .sort()
      .reverse()[0] ?? null;

    features.push({
      id: `emb-${code.toLowerCase()}`,
      geometry: {
        type: "Polygon" as const,
        coordinates: countryFeature.geometry.coordinates as unknown as [Array<[number, number]>],
      },
      properties: {
        id: `emb-${code.toLowerCase()}`,
        countryCode: aggregate.countryCode,
        countryLabel: aggregate.countryLabel,
        programmeCount: aggregate.programmeCount,
        activeProgrammeCount: aggregate.activeProgrammeCount,
        scope: aggregate.dominantScope,
        status: aggregate.dominantStatus,
        programmes: JSON.stringify(aggregate.programmes),
        centroidLon: centLon,
        centroidLat: centLat,
        lastUpdated: latestUpdate,
      },
      ts: Date.now(),
    });
  }

  return {
    collection: { type: "FeatureCollection", features },
    unmatched: Array.from(unmatchedSet),
  };
}
