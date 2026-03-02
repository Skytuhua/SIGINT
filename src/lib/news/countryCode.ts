import { GDELT_FIPS_TO_ISO2 } from "../../config/newsConfig";

const COUNTRY_NAME_TO_ISO2: Record<string, string> = {
  "united states": "US",
  "united kingdom": "GB",
  france: "FR",
  germany: "DE",
  italy: "IT",
  japan: "JP",
  china: "CN",
  india: "IN",
  russia: "RU",
  canada: "CA",
  australia: "AU",
  brazil: "BR",
  "south africa": "ZA",
  mexico: "MX",
  "south korea": "KR",
  taiwan: "TW",
  israel: "IL",
  egypt: "EG",
  "saudi arabia": "SA",
  iran: "IR",
  syria: "SY",
  ukraine: "UA",
  poland: "PL",
  spain: "ES",
  nigeria: "NG",
  argentina: "AR",
  colombia: "CO",
  thailand: "TH",
  indonesia: "ID",
  malaysia: "MY",
  philippines: "PH",
  vietnam: "VN",
  pakistan: "PK",
  bangladesh: "BD",
  turkey: "TR",
  sweden: "SE",
  norway: "NO",
  denmark: "DK",
  finland: "FI",
  netherlands: "NL",
  belgium: "BE",
  austria: "AT",
  switzerland: "CH",
  portugal: "PT",
  greece: "GR",
  "czech republic": "CZ",
  romania: "RO",
  hungary: "HU",
  ireland: "IE",
  "new zealand": "NZ",
  singapore: "SG",
  "united arab emirates": "AE",
  qatar: "QA",
  kuwait: "KW",
  iraq: "IQ",
  afghanistan: "AF",
  kenya: "KE",
  ethiopia: "ET",
  ghana: "GH",
  tanzania: "TZ",
  chile: "CL",
  peru: "PE",
  venezuela: "VE",
  ecuador: "EC",
  greenland: "GL",
  iceland: "IS",
};

const ISO3_TO_ISO2: Record<string, string> = {
  USA: "US",
  GBR: "GB",
  FRA: "FR",
  DEU: "DE",
  ITA: "IT",
  ESP: "ES",
  PRT: "PT",
  NLD: "NL",
  BEL: "BE",
  CHE: "CH",
  AUT: "AT",
  POL: "PL",
  SWE: "SE",
  NOR: "NO",
  DNK: "DK",
  FIN: "FI",
  IRL: "IE",
  RUS: "RU",
  CHN: "CN",
  JPN: "JP",
  IND: "IN",
  KOR: "KR",
  PRK: "KP",
  TWN: "TW",
  THA: "TH",
  VNM: "VN",
  PHL: "PH",
  IDN: "ID",
  MYS: "MY",
  SGP: "SG",
  BGD: "BD",
  PAK: "PK",
  TUR: "TR",
  CAN: "CA",
  MEX: "MX",
  BRA: "BR",
  ARG: "AR",
  COL: "CO",
  PER: "PE",
  VEN: "VE",
  CHL: "CL",
  ECU: "EC",
  AUS: "AU",
  NZL: "NZ",
  ZAF: "ZA",
  EGY: "EG",
  NGA: "NG",
  KEN: "KE",
  ETH: "ET",
  GHA: "GH",
  TZA: "TZ",
  SAU: "SA",
  IRN: "IR",
  ISR: "IL",
  UKR: "UA",
};

export function normalizeCountryCode(rawCountry?: string | null): string | null {
  if (!rawCountry) return null;
  const raw = rawCountry.trim();
  if (!raw) return null;

  const upper = raw.toUpperCase();
  const fipsMapped = GDELT_FIPS_TO_ISO2[upper];
  if (fipsMapped) return fipsMapped;

  if (/^[A-Z]{2}$/.test(upper)) return upper;

  const iso3Mapped = ISO3_TO_ISO2[upper];
  if (iso3Mapped) return iso3Mapped;

  const normalizedName = raw
    .toLowerCase()
    .replace(/[`'".,-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return COUNTRY_NAME_TO_ISO2[normalizedName] ?? null;
}

export function isCountryMatch(rawCountry: string | null | undefined, iso2: string): boolean {
  const normalizedTarget = normalizeCountryCode(iso2);
  if (!normalizedTarget) return false;
  return normalizeCountryCode(rawCountry) === normalizedTarget;
}
