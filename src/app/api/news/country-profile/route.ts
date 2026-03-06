import { NextResponse } from "next/server";
import { computeAcledInstabilityScore, getAcledCountryEvents } from "../../../../lib/server/news/providers/acled";
import { searchPolymarketByCountry } from "../../../../lib/server/news/providers/polymarket";
import { getCountryInfo, getGovernanceIndicators } from "../../../../lib/server/news/providers/worldbank";

const ISO2_TO_NAME: Record<string, string> = {
  US: "United States", GB: "United Kingdom", FR: "France", DE: "Germany",
  IT: "Italy", JP: "Japan", CN: "China", IN: "India", RU: "Russia",
  CA: "Canada", AU: "Australia", BR: "Brazil", ZA: "South Africa",
  MX: "Mexico", KR: "South Korea", TW: "Taiwan", IL: "Israel",
  EG: "Egypt", SA: "Saudi Arabia", IR: "Iran", SY: "Syria",
  UA: "Ukraine", PL: "Poland", ES: "Spain", NG: "Nigeria",
  AR: "Argentina", CO: "Colombia", TH: "Thailand", ID: "Indonesia",
  MY: "Malaysia", PH: "Philippines", VN: "Vietnam", PK: "Pakistan",
  BD: "Bangladesh", TR: "Turkey", SE: "Sweden", NO: "Norway",
  DK: "Denmark", FI: "Finland", NL: "Netherlands", BE: "Belgium",
  AT: "Austria", CH: "Switzerland", PT: "Portugal", GR: "Greece",
  CZ: "Czech Republic", RO: "Romania", HU: "Hungary", IE: "Ireland",
  NZ: "New Zealand", SG: "Singapore", AE: "United Arab Emirates",
  QA: "Qatar", KW: "Kuwait", IQ: "Iraq", AF: "Afghanistan",
  KE: "Kenya", ET: "Ethiopia", GH: "Ghana", TZ: "Tanzania",
  CL: "Chile", PE: "Peru", VE: "Venezuela", EC: "Ecuador",
  GL: "Greenland", IS: "Iceland",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const countryCode = searchParams.get("country")?.toUpperCase();

  if (!countryCode || countryCode.length !== 2) {
    return NextResponse.json({ error: "Missing or invalid country ISO2 code" }, { status: 400 });
  }

  const countryName = ISO2_TO_NAME[countryCode] ?? countryCode;

  const [acledResult, governanceResult, countryInfoResult, polymarketResult] = await Promise.all([
    getAcledCountryEvents(countryName, 30),
    getGovernanceIndicators(countryCode),
    getCountryInfo(countryCode),
    searchPolymarketByCountry(countryName, 20),
  ]);

  const acledScore = computeAcledInstabilityScore(acledResult.data);

  // Build 7-day ACLED daily timeline
  const now7 = Date.now();
  const acledDailyMap: Record<string, { protest: number; conflict: number; natural: number; military: number }> = {};
  for (let d = 6; d >= 0; d--) {
    const ds = new Date(now7 - d * 86_400_000).toISOString().slice(0, 10);
    acledDailyMap[ds] = { protest: 0, conflict: 0, natural: 0, military: 0 };
  }
  for (const evt of acledResult.data.events ?? []) {
    // Parse GDELT seendate format: "20240315T120000Z"
    const raw = evt.eventDate ?? "";
    const m = raw.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!m) continue;
    const ds = `${m[1]}-${m[2]}-${m[3]}`;
    if (!acledDailyMap[ds]) continue;
    const t = evt.eventType;
    if (t === "battles" || t === "explosions" || t === "violenceAgainstCivilians") {
      acledDailyMap[ds].conflict += 1;
    } else if (t === "protests" || t === "riots") {
      acledDailyMap[ds].protest += 1;
    } else if (t === "strategicDevelopments") {
      acledDailyMap[ds].military += 1;
    }
  }
  const acledDailyTimeline = Object.entries(acledDailyMap).map(([date, counts]) => ({ date, ...counts }));

  const gov = governanceResult.data;
  const govIndicators = [
    gov.politicalStability,
    gov.ruleOfLaw,
    gov.controlOfCorruption,
    gov.governmentEffectiveness,
    gov.regulatoryQuality,
    gov.voiceAccountability,
  ].filter((v): v is number => v !== null);

  let governanceDeficit = 0;
  if (govIndicators.length > 0) {
    const avg = govIndicators.reduce((a, b) => a + b, 0) / govIndicators.length;
    governanceDeficit = Math.min(100, Math.max(0, Math.round((1 - (avg + 2.5) / 5) * 100)));
  }

  const compositeIndex = Math.min(100, Math.round(
    acledScore * 0.55 + governanceDeficit * 0.35 + Math.min(30, acledResult.data.totalFatalities) * 0.1 * 3.3,
  ));

  return NextResponse.json(
    {
      countryCode,
      countryName,
      compositeIndex,
      acledScore,
      governanceDeficit,
      acledSummary: {
        totalEvents: acledResult.data.totalEvents,
        totalFatalities: acledResult.data.totalFatalities,
        battles: acledResult.data.battles,
        protests: acledResult.data.protests,
        riots: acledResult.data.riots,
        violenceAgainstCivilians: acledResult.data.violenceAgainstCivilians,
        explosions: acledResult.data.explosions,
        strategicDevelopments: acledResult.data.strategicDevelopments,
      },
      governance: governanceResult.data,
      countryInfo: countryInfoResult.data,
      predictionMarkets: polymarketResult.data,
      acledDailyTimeline,
      degraded: acledResult.degraded || governanceResult.degraded || polymarketResult.degraded,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
