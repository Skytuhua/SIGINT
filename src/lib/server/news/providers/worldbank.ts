import { cachedFetch, fetchJsonOrThrow, type CachedFetchResult, type UpstreamPolicy } from "../upstream";

const WB_BASE = "https://api.worldbank.org/v2";

const POLICY: UpstreamPolicy = {
  key: "worldbank",
  ttlMs: 24 * 60 * 60_000,
  staleTtlMs: 7 * 24 * 60 * 60_000,
  timeoutMs: 15_000,
  maxRetries: 2,
  backoffBaseMs: 1_000,
  circuitFailureThreshold: 3,
  circuitOpenMs: 10 * 60_000,
  rateLimit: { capacity: 4, refillPerSec: 2, minIntervalMs: 500 },
};

export interface GovernanceIndicators {
  politicalStability: number | null;
  ruleOfLaw: number | null;
  controlOfCorruption: number | null;
  governmentEffectiveness: number | null;
  regulatoryQuality: number | null;
  voiceAccountability: number | null;
  year: number;
}

export interface CountryBasicInfo {
  id: string;
  name: string;
  region: string;
  incomeLevel: string;
  capitalCity: string;
  latitude: number;
  longitude: number;
}

type WBIndicatorResponse = [
  { page: number; pages: number; total: number },
  Array<{ indicator: { id: string }; country: { id: string }; date: string; value: number | null }> | null,
];

async function fetchIndicator(
  countryIso2: string,
  indicator: string,
): Promise<{ value: number | null; year: number }> {
  const url = `${WB_BASE}/country/${countryIso2}/indicator/${indicator}?format=json&per_page=5&date=2018:2024&mrv=1`;
  const resp = await fetchJsonOrThrow<WBIndicatorResponse>(
    url,
    { headers: { "User-Agent": "WorldView/0.1" } },
    POLICY.timeoutMs,
  );
  const rows = resp[1];
  if (!rows?.length) return { value: null, year: 0 };
  const latest = rows[0];
  return {
    value: latest.value,
    year: Number(latest.date) || 0,
  };
}

export async function getGovernanceIndicators(
  countryIso2: string,
): Promise<CachedFetchResult<GovernanceIndicators>> {
  return cachedFetch({
    cacheKey: `wb-governance-${countryIso2.toUpperCase()}`,
    policy: POLICY,
    fallbackValue: {
      politicalStability: null,
      ruleOfLaw: null,
      controlOfCorruption: null,
      governmentEffectiveness: null,
      regulatoryQuality: null,
      voiceAccountability: null,
      year: 0,
    },
    request: async () => {
      const [ps, rl, cc, ge, rq, va] = await Promise.all([
        fetchIndicator(countryIso2, "PV.EST"),
        fetchIndicator(countryIso2, "RL.EST"),
        fetchIndicator(countryIso2, "CC.EST"),
        fetchIndicator(countryIso2, "GE.EST"),
        fetchIndicator(countryIso2, "RQ.EST"),
        fetchIndicator(countryIso2, "VA.EST"),
      ]);

      return {
        politicalStability: ps.value,
        ruleOfLaw: rl.value,
        controlOfCorruption: cc.value,
        governmentEffectiveness: ge.value,
        regulatoryQuality: rq.value,
        voiceAccountability: va.value,
        year: Math.max(ps.year, rl.year, cc.year, ge.year, rq.year, va.year),
      };
    },
  });
}

export async function getCountryInfo(
  countryIso2: string,
): Promise<CachedFetchResult<CountryBasicInfo | null>> {
  return cachedFetch({
    cacheKey: `wb-country-${countryIso2.toUpperCase()}`,
    policy: POLICY,
    fallbackValue: null,
    request: async () => {
      const url = `${WB_BASE}/country/${countryIso2}?format=json`;
      const resp = await fetchJsonOrThrow<
        [unknown, Array<{
          id: string;
          name: string;
          region: { value: string };
          incomeLevel: { value: string };
          capitalCity: string;
          latitude: string;
          longitude: string;
        }> | null]
      >(url, { headers: { "User-Agent": "WorldView/0.1" } }, POLICY.timeoutMs);

      const rows = resp[1];
      if (!rows?.length) return null;
      const c = rows[0];
      return {
        id: c.id,
        name: c.name,
        region: c.region?.value ?? "",
        incomeLevel: c.incomeLevel?.value ?? "",
        capitalCity: c.capitalCity ?? "",
        latitude: Number(c.latitude) || 0,
        longitude: Number(c.longitude) || 0,
      };
    },
  });
}
