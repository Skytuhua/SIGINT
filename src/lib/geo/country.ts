type FlightCountryInput = {
  country?: string | null;
  icao?: string | null;
  lat?: number | null;
  lon?: number | null;
};

const UNKNOWN_TOKENS = new Set(["", "unknown", "n/a", "na", "null", "undefined"]);

const ICAO_PREFIX_COUNTRY: Array<{ prefix: string; country: string }> = [
  { prefix: "AE", country: "United States" },
  { prefix: "AA", country: "United States" },
  { prefix: "AB", country: "United States" },
  { prefix: "AC", country: "United States" },
  { prefix: "AD", country: "United States" },
  { prefix: "A", country: "United States" },
  { prefix: "C0", country: "Canada" },
  { prefix: "C1", country: "Canada" },
  { prefix: "C2", country: "Canada" },
  { prefix: "C3", country: "Canada" },
  { prefix: "43", country: "United Kingdom" },
  { prefix: "3C", country: "Germany" },
  { prefix: "39", country: "Italy" },
  { prefix: "4B", country: "Switzerland" },
  { prefix: "4D", country: "Spain" },
  { prefix: "44", country: "Belgium" },
  { prefix: "45", country: "Denmark" },
  { prefix: "46", country: "Sweden" },
  { prefix: "47", country: "Norway" },
  { prefix: "48", country: "Poland" },
  { prefix: "49", country: "Czech Republic" },
  { prefix: "4A", country: "Romania" },
  { prefix: "71", country: "South Korea" },
  { prefix: "76", country: "Australia" },
  { prefix: "78", country: "China" },
  { prefix: "79", country: "China" },
  { prefix: "86", country: "China" },
  { prefix: "89", country: "Thailand" },
  { prefix: "8A", country: "Indonesia" },
  { prefix: "E4", country: "Brazil" },
  { prefix: "E8", country: "Argentina" },
];

const COUNTRY_BOUNDS: Array<{
  country: string;
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}> = [
  { country: "United States", latMin: 24, latMax: 49.7, lonMin: -125, lonMax: -66 },
  { country: "Canada", latMin: 49, latMax: 83, lonMin: -141, lonMax: -52 },
  { country: "Mexico", latMin: 14, latMax: 33, lonMin: -118, lonMax: -86 },
  { country: "Brazil", latMin: -34, latMax: 6, lonMin: -74, lonMax: -34 },
  { country: "Argentina", latMin: -55, latMax: -21, lonMin: -73, lonMax: -53 },
  { country: "United Kingdom", latMin: 49, latMax: 61, lonMin: -8.6, lonMax: 2.3 },
  { country: "France", latMin: 41, latMax: 51.5, lonMin: -5.7, lonMax: 9.7 },
  { country: "Germany", latMin: 47, latMax: 55.5, lonMin: 5.4, lonMax: 15.6 },
  { country: "Spain", latMin: 35.5, latMax: 44.2, lonMin: -10.2, lonMax: 4.4 },
  { country: "Italy", latMin: 36, latMax: 47.2, lonMin: 6.5, lonMax: 18.8 },
  { country: "Turkey", latMin: 35.5, latMax: 43, lonMin: 25.5, lonMax: 45.2 },
  { country: "Saudi Arabia", latMin: 16, latMax: 33.5, lonMin: 34, lonMax: 56 },
  { country: "South Africa", latMin: -35.5, latMax: -22, lonMin: 16, lonMax: 33 },
  { country: "India", latMin: 6, latMax: 36, lonMin: 68, lonMax: 97.5 },
  { country: "China", latMin: 18, latMax: 54, lonMin: 73, lonMax: 135 },
  { country: "Japan", latMin: 24, latMax: 46, lonMin: 123, lonMax: 146 },
  { country: "Russia", latMin: 41, latMax: 82, lonMin: 19, lonMax: 180 },
  { country: "Indonesia", latMin: -11, latMax: 6, lonMin: 95, lonMax: 141 },
  { country: "Australia", latMin: -44, latMax: -10, lonMin: 112, lonMax: 154 },
];

function cleanCountry(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (UNKNOWN_TOKENS.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

function inferCountryFromIcao(icao?: string | null): string | null {
  if (!icao) return null;
  const upper = icao.trim().toUpperCase();
  if (!upper) return null;

  for (const item of ICAO_PREFIX_COUNTRY) {
    if (upper.startsWith(item.prefix)) return item.country;
  }
  return null;
}

function inferCountryFromPosition(lat?: number | null, lon?: number | null): string | null {
  if (typeof lat !== "number" || typeof lon !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  for (const bounds of COUNTRY_BOUNDS) {
    if (lat >= bounds.latMin && lat <= bounds.latMax && lon >= bounds.lonMin && lon <= bounds.lonMax) {
      return bounds.country;
    }
  }
  return null;
}

export function inferFlightCountry(input: FlightCountryInput): string {
  const fromFeed = cleanCountry(input.country);
  if (fromFeed) return fromFeed;
  return (
    inferCountryFromIcao(input.icao) ??
    inferCountryFromPosition(input.lat, input.lon) ??
    "International"
  );
}

const SATELLITE_COUNTRY_RULES: Array<{ pattern: RegExp; country: string }> = [
  { pattern: /STARLINK|NOAA|GOES|GPS|IRIDIUM|NROL|USAF|TDRS/i, country: "United States" },
  { pattern: /GALILEO|EUTELSAT|ASTRA/i, country: "European Union" },
  { pattern: /GLONASS|COSMOS|METEOR-M/i, country: "Russia" },
  { pattern: /BEIDOU|FENGYUN|TIANLIAN|YAOGAN/i, country: "China" },
  { pattern: /QZS|MICHIBIKI|HIMAWARI|JCSAT/i, country: "Japan" },
  { pattern: /NAVIC|INSAT|GSAT/i, country: "India" },
  { pattern: /THAICOM/i, country: "Thailand" },
  { pattern: /AUSSAT|NBN/i, country: "Australia" },
  { pattern: /ISS|TIANGONG|SES|INTELSAT|INMARSAT|ONEWEB/i, country: "International" },
];

export function inferSatelliteCountry(name?: string | null): string {
  if (!name) return "International";
  const trimmed = name.trim();
  if (!trimmed) return "International";
  for (const rule of SATELLITE_COUNTRY_RULES) {
    if (rule.pattern.test(trimmed)) return rule.country;
  }
  return "International";
}
