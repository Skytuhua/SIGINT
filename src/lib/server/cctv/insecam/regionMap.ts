import type { CctvRegion } from "../../../providers/types";

const COUNTRY_TO_REGION: Record<string, CctvRegion> = {
  // Americas
  US: "americas", CA: "americas", BR: "americas", AR: "americas", MX: "americas",
  CL: "americas", CO: "americas", PE: "americas", EC: "americas", PA: "americas",
  HN: "americas", NI: "americas", KY: "americas", GU: "americas",

  // Europe
  IT: "europe", DE: "europe", RU: "europe", AT: "europe", FR: "europe",
  CZ: "europe", RO: "europe", CH: "europe", NO: "europe", PL: "europe",
  SE: "europe", NL: "europe", ES: "europe", GB: "europe", DK: "europe",
  UA: "europe", RS: "europe", BG: "europe", SK: "europe", BE: "europe",
  FI: "europe", GR: "europe", HU: "europe", BA: "europe", IE: "europe",
  SI: "europe", LT: "europe", EE: "europe", IS: "europe", MD: "europe",
  BY: "europe", FO: "europe",

  // Asia
  JP: "asia", KR: "asia", TW: "asia", IN: "asia", ID: "asia",
  MY: "asia", TH: "asia", CN: "asia",
  HK: "asia", VN: "asia", KZ: "asia", AM: "asia", PK: "asia",
  BD: "asia", SG: "asia", PH: "asia", MM: "asia", KH: "asia",
  LA: "asia", NP: "asia", LK: "asia", MN: "asia",

  // Oceania
  AU: "oceania", NZ: "oceania", FJ: "oceania", PG: "oceania",
  WS: "oceania", TO: "oceania",

  // Middle East
  TR: "mideast", IL: "mideast", EG: "mideast", SY: "mideast",
  AE: "mideast", SA: "mideast", IQ: "mideast", IR: "mideast",
  JO: "mideast", LB: "mideast", QA: "mideast", BH: "mideast",
  OM: "mideast", KW: "mideast", YE: "mideast", PS: "mideast",

  // Africa
  ZA: "africa", AO: "africa", TZ: "africa", KE: "africa",
  NG: "africa", GH: "africa", ET: "africa", UG: "africa",
  CM: "africa", SN: "africa", CI: "africa", MA: "africa",
  TN: "africa", DZ: "africa", LY: "africa", SD: "africa",
  MZ: "africa", ZW: "africa", BW: "africa", NA: "africa",
};

export function countryCodeToRegion(code: string): CctvRegion {
  return COUNTRY_TO_REGION[code.toUpperCase()] ?? "europe";
}
