import type {
  AiDataCenterSite,
  AiDataCenterCluster,
  AiDataCenterImportanceBreakdown,
  AiDataCenterSourceTrace,
  AiDataCenterSiteSummary,
  OperatorType,
} from "./types";

// ── Constants ────────────────────────────────────────────────────────────────

const MERGE_DISTANCE_KM = 5;      // Sites within 5 km = same facility
const CLUSTER_DISTANCE_KM = 50;   // Sites within 50 km = same cluster
const MIN_IMPORTANCE = 15;
const MAX_CLUSTERS = 500;
const MAX_SITES_IN_PROPERTIES = 20;

const IMPORTANCE_WEIGHTS = {
  operatorDiversity:    0.25,
  hyperscalerPresence:  0.35,
  siteScale:            0.25,
  regionWeight:         0.15,
} as const;

/** Countries known for major data center concentration */
const REGION_WEIGHT_MAP: Record<string, number> = {
  US: 90, CN: 85, IE: 80, NL: 78, SG: 78, JP: 75, GB: 72, DE: 70,
  KR: 68, AU: 65, CA: 65, IN: 62, FR: 60, SE: 58, FI: 55, NO: 55,
  BR: 50, IL: 50, AE: 48, HK: 48,
};
const DEFAULT_REGION_WEIGHT = 30;

const OVERPASS_QUERY_SUMMARY =
  "OSM: building=data_centre, telecom=data_center, man_made=data_center, industrial=data_centre, name heuristic";

// ── Haversine distance ───────────────────────────────────────────────────────

const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS_KM = 6371;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Step 1: Merge/dedup Wikidata + OSM sites ─────────────────────────────────

function nameSimilarity(a: string, b: string): number {
  const la = a.toLowerCase().replace(/[^a-z0-9]/g, "");
  const lb = b.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (la === lb) return 1;
  if (la.includes(lb) || lb.includes(la)) return 0.7;
  return 0;
}

export function mergeSites(
  wikidataSites: AiDataCenterSite[],
  osmSites: AiDataCenterSite[],
): AiDataCenterSite[] {
  // Start with all Wikidata sites (higher authority)
  const merged = [...wikidataSites];
  const wdCoords = wikidataSites.map((s) => ({ lat: s.lat, lon: s.lon, name: s.name }));

  for (const osm of osmSites) {
    let isDuplicate = false;
    for (const wd of wdCoords) {
      const dist = haversineKm(osm.lat, osm.lon, wd.lat, wd.lon);
      if (dist <= MERGE_DISTANCE_KM) {
        const sim = nameSimilarity(osm.name, wd.name);
        if (sim >= 0.3 || dist <= 1) {
          isDuplicate = true;
          // Boost confidence of matching Wikidata site
          const wdSite = merged.find(
            (s) => s.sourceType === "wikidata" && s.lat === wd.lat && s.lon === wd.lon,
          );
          if (wdSite) {
            wdSite.confidence = Math.min(100, wdSite.confidence + 10);
            if (!wdSite.evidenceTags.includes("osm:corroborated")) {
              wdSite.evidenceTags.push("osm:corroborated");
            }
          }
          break;
        }
      }
    }
    if (!isDuplicate) {
      merged.push(osm);
    }
  }

  return merged;
}

// ── Step 2: Cluster sites ────────────────────────────────────────────────────

interface SiteCluster {
  sites: AiDataCenterSite[];
}

function clusterSites(sites: AiDataCenterSite[]): SiteCluster[] {
  const assigned = new Set<number>();
  const clusters: SiteCluster[] = [];

  for (let i = 0; i < sites.length; i++) {
    if (assigned.has(i)) continue;

    const cluster: AiDataCenterSite[] = [sites[i]];
    assigned.add(i);

    // Greedy: find all unassigned sites within CLUSTER_DISTANCE_KM of any site in the cluster
    let frontier = [sites[i]];
    while (frontier.length > 0) {
      const nextFrontier: AiDataCenterSite[] = [];
      for (let j = 0; j < sites.length; j++) {
        if (assigned.has(j)) continue;
        for (const f of frontier) {
          if (haversineKm(f.lat, f.lon, sites[j].lat, sites[j].lon) <= CLUSTER_DISTANCE_KM) {
            cluster.push(sites[j]);
            assigned.add(j);
            nextFrontier.push(sites[j]);
            break;
          }
        }
      }
      frontier = nextFrontier;
    }

    clusters.push({ sites: cluster });
  }

  return clusters;
}

// ── Step 3: Score clusters ───────────────────────────────────────────────────

function uniqueOperators(sites: AiDataCenterSite[]): string[] {
  const ops = new Set<string>();
  for (const s of sites) {
    if (s.operator && s.operator !== "Unknown") ops.add(s.operator);
  }
  return Array.from(ops);
}

function uniqueOperatorTypes(sites: AiDataCenterSite[]): OperatorType[] {
  const types = new Set<OperatorType>();
  for (const s of sites) types.add(s.operatorType);
  return Array.from(types);
}

function computeImportance(sites: AiDataCenterSite[], countryIso2: string): {
  importance: number;
  breakdown: AiDataCenterImportanceBreakdown;
} {
  const operators = uniqueOperators(sites);
  const hyperscalerCount = sites.filter((s) => s.operatorType === "hyperscaler").length;
  const distinctHyperscalers = new Set(
    sites.filter((s) => s.operatorType === "hyperscaler").map((s) => s.operator),
  ).size;

  const operatorDiversity = Math.min(100, operators.length * 15);
  const hyperscalerPresence = Math.min(100, distinctHyperscalers * 30 + (hyperscalerCount > 3 ? 10 : 0));
  const siteScale = Math.min(100, Math.log2(sites.length + 1) * 25);
  const regionWeight = REGION_WEIGHT_MAP[countryIso2] ?? DEFAULT_REGION_WEIGHT;

  const importance = Math.round(
    IMPORTANCE_WEIGHTS.operatorDiversity * operatorDiversity +
    IMPORTANCE_WEIGHTS.hyperscalerPresence * hyperscalerPresence +
    IMPORTANCE_WEIGHTS.siteScale * siteScale +
    IMPORTANCE_WEIGHTS.regionWeight * regionWeight,
  );

  return {
    importance,
    breakdown: {
      operatorDiversity: Math.round(operatorDiversity),
      hyperscalerPresence: Math.round(hyperscalerPresence),
      siteScale: Math.round(siteScale),
      regionWeight,
    },
  };
}

function clusterName(sites: AiDataCenterSite[]): string {
  // Pick the best name: prefer city, then admin1, then country
  const cityCount = new Map<string, number>();
  const admin1Count = new Map<string, number>();

  for (const s of sites) {
    if (s.city) cityCount.set(s.city, (cityCount.get(s.city) ?? 0) + 1);
    if (s.admin1) admin1Count.set(s.admin1, (admin1Count.get(s.admin1) ?? 0) + 1);
  }

  let label = "";
  if (cityCount.size > 0) {
    label = Array.from(cityCount.entries()).sort((a, b) => b[1] - a[1])[0][0];
  } else if (admin1Count.size > 0) {
    label = Array.from(admin1Count.entries()).sort((a, b) => b[1] - a[1])[0][0];
  }

  const country = sites[0]?.country || "";
  if (label && country) return `${label}, ${country}`;
  if (label) return label;
  if (country) return `${country} Cluster`;

  // Fallback: use the name of the most confident site
  const bestSite = sites.reduce((a, b) => (a.confidence >= b.confidence ? a : b), sites[0]);
  return bestSite.name;
}

function stableClusterId(centroidLat: number, centroidLon: number, operators: string[]): string {
  const key = `${centroidLat.toFixed(2)}-${centroidLon.toFixed(2)}-${operators.sort().join(",")}`;
  // Simple hash
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) - h + key.charCodeAt(i)) | 0;
  }
  return `cluster-${Math.abs(h).toString(36)}`;
}

// ── Public entry point ───────────────────────────────────────────────────────

export function clusterAndScoreSites(
  wikidataSites: AiDataCenterSite[],
  osmSites: AiDataCenterSite[],
  wikidataTs: number,
  overpassTs: number,
): AiDataCenterCluster[] {
  // Step 1: merge
  const allSites = mergeSites(wikidataSites, osmSites);
  if (allSites.length === 0) return [];

  // Step 2: cluster
  const rawClusters = clusterSites(allSites);

  // Step 3: score and build cluster records
  const now = Date.now();
  const clusters: AiDataCenterCluster[] = rawClusters.map((rc) => {
    const sites = rc.sites;

    // Centroid
    const centroidLat = sites.reduce((sum, s) => sum + s.lat, 0) / sites.length;
    const centroidLon = sites.reduce((sum, s) => sum + s.lon, 0) / sites.length;

    // Metadata
    const operators = uniqueOperators(sites);
    const operatorTypes = uniqueOperatorTypes(sites);
    const maxConfidence = Math.max(...sites.map((s) => s.confidence));
    const primaryCountryIso2 = sites[0]?.countryIso2 || "";
    const primaryCountry = sites[0]?.country || "";
    const primaryAdmin1 = sites[0]?.admin1;

    // Importance
    const { importance, breakdown } = computeImportance(sites, primaryCountryIso2);

    // Source trace
    const wikidataQids = sites
      .filter((s) => s.sourceType === "wikidata")
      .map((s) => s.sourceId);
    const osmIds = sites
      .filter((s) => s.sourceType === "osm")
      .map((s) => s.sourceId);

    const sourceTrace: AiDataCenterSourceTrace = {
      wikidataQids,
      osmIds,
      overpassQuery: OVERPASS_QUERY_SUMMARY,
      lastUpdated: { wikidata: wikidataTs, overpass: overpassTs },
    };

    // Site summaries (cap at MAX_SITES_IN_PROPERTIES)
    const siteSummaries: AiDataCenterSiteSummary[] = sites
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, MAX_SITES_IN_PROPERTIES)
      .map((s) => ({
        name: s.name,
        operator: s.operator,
        sourceType: s.sourceType,
        sourceId: s.sourceId,
      }));

    // Notes
    const hyperscalerNames = Array.from(
      new Set(sites.filter((s) => s.operatorType === "hyperscaler").map((s) => s.operator)),
    );
    const notes = hyperscalerNames.length > 0
      ? `Hyperscaler hub: ${hyperscalerNames.join(", ")}`
      : operators.length > 1
        ? `Multi-operator cluster: ${operators.length} operators`
        : operators.length === 1
          ? `Single operator: ${operators[0]}`
          : "";

    return {
      id: stableClusterId(centroidLat, centroidLon, operators),
      name: clusterName(sites),
      centroidLat,
      centroidLon,
      country: primaryCountry,
      countryIso2: primaryCountryIso2,
      admin1: primaryAdmin1,
      operators,
      operatorTypes,
      siteCount: sites.length,
      sites: siteSummaries,
      confidence: maxConfidence,
      importance,
      importanceBreakdown: breakdown,
      notes,
      sourceTrace,
      lastUpdated: now,
    };
  });

  // Filter and cap
  return clusters
    .filter((c) => c.importance >= MIN_IMPORTANCE)
    .sort((a, b) => b.importance - a.importance)
    .slice(0, MAX_CLUSTERS);
}
