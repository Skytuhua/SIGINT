/**
 * City and country coordinate lookup for insecam cameras.
 * Primary: exact city name match. Fallback: country centroid + random offset.
 */

interface LatLon {
  lat: number;
  lon: number;
}

// Common cities found on insecam, keyed by lowercase city name
const CITY_COORDS: Record<string, LatLon> = {
  // Americas
  "new york": { lat: 40.7128, lon: -74.006 },
  "los angeles": { lat: 34.0522, lon: -118.2437 },
  "chicago": { lat: 41.8781, lon: -87.6298 },
  "miami": { lat: 25.7617, lon: -80.1918 },
  "houston": { lat: 29.7604, lon: -95.3698 },
  "san francisco": { lat: 37.7749, lon: -122.4194 },
  "seattle": { lat: 47.6062, lon: -122.3321 },
  "washington": { lat: 38.9072, lon: -77.0369 },
  "boston": { lat: 42.3601, lon: -71.0589 },
  "atlanta": { lat: 33.749, lon: -84.388 },
  "dallas": { lat: 32.7767, lon: -96.797 },
  "denver": { lat: 39.7392, lon: -104.9903 },
  "phoenix": { lat: 33.4484, lon: -112.074 },
  "las vegas": { lat: 36.1699, lon: -115.1398 },
  "portland": { lat: 45.5152, lon: -122.6784 },
  "toronto": { lat: 43.6532, lon: -79.3832 },
  "vancouver": { lat: 49.2827, lon: -123.1207 },
  "montreal": { lat: 45.5017, lon: -73.5673 },
  "mexico city": { lat: 19.4326, lon: -99.1332 },
  "sao paulo": { lat: -23.5505, lon: -46.6333 },
  "rio de janeiro": { lat: -22.9068, lon: -43.1729 },
  "buenos aires": { lat: -34.6037, lon: -58.3816 },
  "bogota": { lat: 4.711, lon: -74.0721 },
  "lima": { lat: -12.0464, lon: -77.0428 },
  "santiago": { lat: -33.4489, lon: -70.6693 },

  // Europe
  "london": { lat: 51.5074, lon: -0.1278 },
  "paris": { lat: 48.8566, lon: 2.3522 },
  "berlin": { lat: 52.52, lon: 13.405 },
  "rome": { lat: 41.9028, lon: 12.4964 },
  "madrid": { lat: 40.4168, lon: -3.7038 },
  "amsterdam": { lat: 52.3676, lon: 4.9041 },
  "vienna": { lat: 48.2082, lon: 16.3738 },
  "prague": { lat: 50.0755, lon: 14.4378 },
  "warsaw": { lat: 52.2297, lon: 21.0122 },
  "budapest": { lat: 47.4979, lon: 19.0402 },
  "bucharest": { lat: 44.4268, lon: 26.1025 },
  "moscow": { lat: 55.7558, lon: 37.6173 },
  "st. petersburg": { lat: 59.9311, lon: 30.3609 },
  "saint petersburg": { lat: 59.9311, lon: 30.3609 },
  "stockholm": { lat: 59.3293, lon: 18.0686 },
  "oslo": { lat: 59.9139, lon: 10.7522 },
  "copenhagen": { lat: 55.6761, lon: 12.5683 },
  "helsinki": { lat: 60.1699, lon: 24.9384 },
  "zurich": { lat: 47.3769, lon: 8.5417 },
  "geneva": { lat: 46.2044, lon: 6.1432 },
  "brussels": { lat: 50.8503, lon: 4.3517 },
  "lisbon": { lat: 38.7223, lon: -9.1393 },
  "dublin": { lat: 53.3498, lon: -6.2603 },
  "athens": { lat: 37.9838, lon: 23.7275 },
  "sofia": { lat: 42.6977, lon: 23.3219 },
  "belgrade": { lat: 44.7866, lon: 20.4489 },
  "zagreb": { lat: 45.815, lon: 15.9819 },
  "kyiv": { lat: 50.4501, lon: 30.5234 },
  "kiev": { lat: 50.4501, lon: 30.5234 },
  "bratislava": { lat: 48.1486, lon: 17.1077 },
  "ljubljana": { lat: 46.0569, lon: 14.5058 },
  "tallinn": { lat: 59.437, lon: 24.7536 },
  "riga": { lat: 56.9496, lon: 24.1052 },
  "vilnius": { lat: 54.6872, lon: 25.2797 },
  "minsk": { lat: 53.9006, lon: 27.559 },
  "barcelona": { lat: 41.3874, lon: 2.1686 },
  "milan": { lat: 45.4642, lon: 9.19 },
  "munich": { lat: 48.1351, lon: 11.582 },
  "hamburg": { lat: 53.5511, lon: 9.9937 },
  "frankfurt": { lat: 50.1109, lon: 8.6821 },
  "marseille": { lat: 43.2965, lon: 5.3698 },
  "naples": { lat: 40.8518, lon: 14.2681 },
  "turin": { lat: 45.0703, lon: 7.6869 },
  "florence": { lat: 43.7696, lon: 11.2558 },
  "reykjavik": { lat: 64.1466, lon: -21.9426 },

  // Asia
  "tokyo": { lat: 35.6762, lon: 139.6503 },
  "osaka": { lat: 34.6937, lon: 135.5023 },
  "seoul": { lat: 37.5665, lon: 126.978 },
  "busan": { lat: 35.1796, lon: 129.0756 },
  "taipei": { lat: 25.033, lon: 121.5654 },
  "beijing": { lat: 39.9042, lon: 116.4074 },
  "shanghai": { lat: 31.2304, lon: 121.4737 },
  "hong kong": { lat: 22.3193, lon: 114.1694 },
  "singapore": { lat: 1.3521, lon: 103.8198 },
  "bangkok": { lat: 13.7563, lon: 100.5018 },
  "mumbai": { lat: 19.076, lon: 72.8777 },
  "delhi": { lat: 28.7041, lon: 77.1025 },
  "new delhi": { lat: 28.6139, lon: 77.209 },
  "bangalore": { lat: 12.9716, lon: 77.5946 },
  "chennai": { lat: 13.0827, lon: 80.2707 },
  "kolkata": { lat: 22.5726, lon: 88.3639 },
  "jakarta": { lat: -6.2088, lon: 106.8456 },
  "hanoi": { lat: 21.0278, lon: 105.8342 },
  "ho chi minh city": { lat: 10.8231, lon: 106.6297 },
  "kuala lumpur": { lat: 3.139, lon: 101.6869 },
  "almaty": { lat: 43.2551, lon: 76.9126 },

  // Middle East
  "istanbul": { lat: 41.0082, lon: 28.9784 },
  "ankara": { lat: 39.9334, lon: 32.8597 },
  "izmir": { lat: 38.4237, lon: 27.1428 },
  "antalya": { lat: 36.8969, lon: 30.7133 },
  "tel aviv": { lat: 32.0853, lon: 34.7818 },
  "jerusalem": { lat: 31.7683, lon: 35.2137 },
  "haifa": { lat: 32.7940, lon: 34.9896 },
  "tehran": { lat: 35.6892, lon: 51.389 },
  "isfahan": { lat: 32.6546, lon: 51.668 },
  "dubai": { lat: 25.2048, lon: 55.2708 },
  "abu dhabi": { lat: 24.4539, lon: 54.3773 },
  "riyadh": { lat: 24.7136, lon: 46.6753 },
  "doha": { lat: 25.2854, lon: 51.531 },
  "beirut": { lat: 33.8938, lon: 35.5018 },
  "amman": { lat: 31.9454, lon: 35.9284 },
  "cairo": { lat: 30.0444, lon: 31.2357 },

  // Africa
  "johannesburg": { lat: -26.2041, lon: 28.0473 },
  "cape town": { lat: -33.9249, lon: 18.4241 },
  "durban": { lat: -29.8587, lon: 31.0218 },
  "nairobi": { lat: -1.2921, lon: 36.8219 },
  "lagos": { lat: 6.5244, lon: 3.3792 },
  "accra": { lat: 5.6037, lon: -0.187 },
  "addis ababa": { lat: 9.025, lon: 38.7469 },

  // Oceania
  "sydney": { lat: -33.8688, lon: 151.2093 },
  "melbourne": { lat: -37.8136, lon: 144.9631 },
  "brisbane": { lat: -27.4698, lon: 153.0251 },
  "perth": { lat: -31.9505, lon: 115.8605 },
  "auckland": { lat: -36.8485, lon: 174.7633 },
  "wellington": { lat: -41.2865, lon: 174.7762 },
};

// Country centroids (capital or geographic center) keyed by ISO 2-letter code
const COUNTRY_CENTROIDS: Record<string, LatLon> = {
  // Americas
  US: { lat: 38.9, lon: -77.0 },
  CA: { lat: 45.4, lon: -75.7 },
  BR: { lat: -15.8, lon: -47.9 },
  MX: { lat: 19.4, lon: -99.1 },
  AR: { lat: -34.6, lon: -58.4 },
  CL: { lat: -33.4, lon: -70.7 },
  CO: { lat: 4.7, lon: -74.1 },
  PE: { lat: -12.0, lon: -77.0 },
  EC: { lat: -0.2, lon: -78.5 },
  PA: { lat: 9.0, lon: -79.5 },
  HN: { lat: 14.1, lon: -87.2 },
  NI: { lat: 12.1, lon: -86.3 },

  // Europe
  DE: { lat: 52.5, lon: 13.4 },
  IT: { lat: 41.9, lon: 12.5 },
  FR: { lat: 48.9, lon: 2.4 },
  GB: { lat: 51.5, lon: -0.1 },
  RU: { lat: 55.8, lon: 37.6 },
  NL: { lat: 52.4, lon: 4.9 },
  ES: { lat: 40.4, lon: -3.7 },
  CZ: { lat: 50.1, lon: 14.4 },
  AT: { lat: 48.2, lon: 16.4 },
  CH: { lat: 46.9, lon: 7.4 },
  NO: { lat: 59.9, lon: 10.8 },
  SE: { lat: 59.3, lon: 18.1 },
  PL: { lat: 52.2, lon: 21.0 },
  UA: { lat: 50.5, lon: 30.5 },
  RO: { lat: 44.4, lon: 26.1 },
  HU: { lat: 47.5, lon: 19.0 },
  BG: { lat: 42.7, lon: 23.3 },
  RS: { lat: 44.8, lon: 20.4 },
  SK: { lat: 48.1, lon: 17.1 },
  BE: { lat: 50.9, lon: 4.4 },
  FI: { lat: 60.2, lon: 24.9 },
  DK: { lat: 55.7, lon: 12.6 },
  GR: { lat: 38.0, lon: 23.7 },
  IE: { lat: 53.3, lon: -6.3 },
  BA: { lat: 43.9, lon: 18.4 },
  SI: { lat: 46.1, lon: 14.5 },
  LT: { lat: 54.7, lon: 25.3 },
  EE: { lat: 59.4, lon: 24.8 },
  IS: { lat: 64.1, lon: -21.9 },
  MD: { lat: 47.0, lon: 28.9 },
  BY: { lat: 53.9, lon: 27.6 },

  // Asia
  JP: { lat: 35.7, lon: 139.7 },
  KR: { lat: 37.6, lon: 127.0 },
  TW: { lat: 25.0, lon: 121.6 },
  IN: { lat: 28.6, lon: 77.2 },
  ID: { lat: -6.2, lon: 106.8 },
  TH: { lat: 13.8, lon: 100.5 },
  VN: { lat: 21.0, lon: 105.8 },
  CN: { lat: 39.9, lon: 116.4 },
  MY: { lat: 3.1, lon: 101.7 },
  PH: { lat: 14.6, lon: 121.0 },
  SG: { lat: 1.4, lon: 103.8 },
  KZ: { lat: 51.2, lon: 71.4 },
  PK: { lat: 33.7, lon: 73.0 },
  BD: { lat: 23.8, lon: 90.4 },
  HK: { lat: 22.3, lon: 114.2 },

  // Middle East
  TR: { lat: 39.9, lon: 32.9 },
  IL: { lat: 31.8, lon: 35.2 },
  IR: { lat: 35.7, lon: 51.4 },
  AE: { lat: 25.2, lon: 55.3 },
  SA: { lat: 24.7, lon: 46.7 },
  EG: { lat: 30.0, lon: 31.2 },
  IQ: { lat: 33.3, lon: 44.4 },
  SY: { lat: 33.5, lon: 36.3 },
  JO: { lat: 31.9, lon: 35.9 },
  LB: { lat: 33.9, lon: 35.5 },
  QA: { lat: 25.3, lon: 51.5 },

  // Africa
  ZA: { lat: -25.7, lon: 28.2 },
  NG: { lat: 9.1, lon: 7.5 },
  KE: { lat: -1.3, lon: 36.8 },
  GH: { lat: 5.6, lon: -0.2 },
  ET: { lat: 9.0, lon: 38.7 },
  AO: { lat: -8.8, lon: 13.2 },
  TZ: { lat: -6.8, lon: 39.3 },

  // Oceania
  AU: { lat: -33.9, lon: 151.2 },
  NZ: { lat: -41.3, lon: 174.8 },
};

/**
 * Lookup coordinates for a camera given its city name and country code.
 * Tries exact city match first, then falls back to country centroid with offset.
 */
export function lookupCameraCoords(
  city: string,
  countryCode: string,
): LatLon {
  const cityKey = city.toLowerCase().trim();

  // Try exact city match
  const cityMatch = CITY_COORDS[cityKey];
  if (cityMatch) return cityMatch;

  // Fallback: country centroid with small random offset to spread dots
  const centroid = COUNTRY_CENTROIDS[countryCode.toUpperCase()];
  if (centroid) {
    // Deterministic offset based on city name hash to keep positions stable
    let hash = 0;
    for (let i = 0; i < cityKey.length; i++) {
      hash = ((hash << 5) - hash + cityKey.charCodeAt(i)) | 0;
    }
    const offsetLat = ((hash & 0xff) / 255 - 0.5) * 1.0;
    const offsetLon = (((hash >> 8) & 0xff) / 255 - 0.5) * 1.0;
    return {
      lat: centroid.lat + offsetLat,
      lon: centroid.lon + offsetLon,
    };
  }

  // Last resort: no coordinates available
  return { lat: 0, lon: 0 };
}
