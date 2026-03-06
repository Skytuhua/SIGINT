import type {
  SanctionsEntity,
  SanctionsEntityType,
  SanctionsEntityStatus,
  SanctionsAuthority,
  SanctionsIdentifiers,
  SanctionsEntityGeo,
  GeoConfidence,
  SanctionsSourceTrace,
} from "./types";

// ── Shared helpers for authority-specific parsers ──────────────────────────

const CITY_COUNTRY_COORDS: Record<string, [number, number]> = {
  "moscow,ru": [55.7558, 37.6173],
  "tehran,ir": [35.6892, 51.389],
  "damascus,sy": [33.5138, 36.2765],
  "pyongyang,kp": [39.0392, 125.7625],
  "beijing,cn": [39.9042, 116.4074],
  "minsk,by": [53.9045, 27.5615],
  "havana,cu": [23.1136, -82.3666],
  "caracas,ve": [10.4806, -66.9036],
  "belgrade,rs": [44.7866, 20.4489],
  "khartoum,sd": [15.5007, 32.5599],
  "tripoli,ly": [32.8872, 13.1802],
  "kabul,af": [34.5553, 69.2075],
  "baghdad,iq": [33.3152, 44.3661],
  "sanaa,ye": [15.3694, 44.191],
  "mogadishu,so": [2.0469, 45.3182],
  "bangui,cf": [4.3947, 18.5582],
  "juba,ss": [4.8594, 31.5713],
  "kinshasa,cd": [4.4419, -15.2663],
  "donetsk,ua": [48.0159, 37.8029],
  "sevastopol,ua": [44.6054, 33.5221],
};

const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  RU: [61.524, 105.3188],
  IR: [32.4279, 53.688],
  SY: [34.8021, 38.9968],
  KP: [40.3399, 127.5101],
  CN: [35.8617, 104.1954],
  BY: [53.7098, 27.9534],
  CU: [21.5218, -77.7812],
  VE: [6.4238, -66.5897],
  SD: [12.8628, 30.2176],
  LY: [26.3351, 17.2283],
  AF: [33.9391, 67.7099],
  IQ: [33.2232, 43.6793],
  YE: [15.5527, 48.5164],
  SO: [5.1521, 46.1996],
  CF: [6.6111, 20.9394],
  SS: [6.877, 31.307],
  CD: [-4.0383, 21.7587],
  UA: [48.3794, 31.1656],
  MM: [21.9162, 95.956],
  ZW: [-19.0154, 29.1549],
  ER: [15.1794, 39.7823],
  LB: [33.8547, 35.8623],
  ML: [17.5707, -3.9962],
  HT: [18.9712, -72.2852],
  NI: [12.8654, -85.2072],
  RS: [44.0165, 21.0059],
};

export function deriveGeo(
  city: string | null,
  countryCode: string | null,
  _raw?: Record<string, unknown>
): SanctionsEntityGeo | null {
  if (city && countryCode) {
    const key = `${city.toLowerCase().trim()},${countryCode.toLowerCase().trim()}`;
    const coords = CITY_COUNTRY_COORDS[key];
    if (coords) {
      return {
        lat: coords[0],
        lon: coords[1],
        placeName: `${city}, ${countryCode.toUpperCase()}`,
        geoConfidence: "Medium",
      };
    }
  }

  if (countryCode) {
    const centroid = COUNTRY_CENTROIDS[countryCode.toUpperCase()];
    if (centroid) {
      return {
        lat: centroid[0],
        lon: centroid[1],
        placeName: countryCode.toUpperCase(),
        geoConfidence: "Low",
      };
    }
  }

  return null;
}

export function classifyEntityType(
  rawType: string | null,
  extras?: { isVessel?: boolean; isAircraft?: boolean; isBank?: boolean }
): SanctionsEntityType {
  if (extras?.isVessel) return "Vessel";
  if (extras?.isAircraft) return "Aircraft";
  if (extras?.isBank) return "Bank";
  if (!rawType) return "Other";

  const t = rawType.toLowerCase();
  if (t.includes("individual") || t === "person") return "Individual";
  if (t.includes("vessel") || t.includes("ship")) return "Vessel";
  if (t.includes("aircraft")) return "Aircraft";
  if (t.includes("bank") || t.includes("financial")) return "Bank";
  if (t.includes("government")) return "Government";
  if (t.includes("company") || t.includes("corporate")) return "Company";
  if (t.includes("entity") || t.includes("organization") || t.includes("organisation"))
    return "Organization";
  return "Other";
}

export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export function stableEntityId(authority: SanctionsAuthority, officialId: string): string {
  return `${authority}:${officialId}`;
}

export function buildSourceTrace(
  authority: SanctionsAuthority,
  sourceUrl: string,
  version: string | null
): SanctionsSourceTrace {
  return {
    sourceName: authority,
    sourceUrl,
    datasetVersion: version,
    lastUpdated: new Date().toISOString(),
  };
}

export {
  type SanctionsEntity,
  type SanctionsEntityType,
  type SanctionsEntityStatus,
  type SanctionsAuthority,
  type SanctionsIdentifiers,
  type SanctionsEntityGeo,
  type GeoConfidence,
  type SanctionsSourceTrace,
};
