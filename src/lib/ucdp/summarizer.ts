import type { UcdpAggregatedStats } from "./aggregation";

export interface UcdpSummaryInput {
  stats: UcdpAggregatedStats;
  datasetVersion: string;
  timeWindow: string;
  filters: string;
  sampleIsSmall: boolean;
}

export function buildUcdpSummaryPrompt(input: UcdpSummaryInput): {
  system: string;
  user: string;
} {
  const system = [
    "You are a concise conflict-data analyst.",
    "Produce a 2–6 sentence, ≤120-word, neutral and analytic briefing based ONLY on the provided statistics.",
    "Requirements:",
    "- Include the date range covered.",
    "- Include the number of events summarized.",
    "- Identify the top 2–4 hotspots (by fatalities or event count).",
    "- Use clear place names and dates.",
    "- No speculative language, predictions, or adjectives like 'shocking', 'horrific', 'unprecedented'.",
    "- All statements must be grounded in and only in the provided data.",
    "- If the sample is small, state so concisely and avoid filler.",
    "- End with a one-line data note: 'Data note: UCDP GED, fatality-coded events; release version X'.",
  ].join("\n");

  const topLocs = input.stats.topLocations
    .map(
      (l) =>
        `${l.name || l.country} (${l.country}): ${l.eventCount} events, ${l.fatalitiesBestTotal} fatalities`
    )
    .join("\n  ");

  const topEvts = input.stats.topEvents
    .slice(0, 5)
    .map(
      (e) =>
        `${e.date} | ${e.location}, ${e.country} | ${e.actors} | fatalities: ${e.fatalitiesBest}`
    )
    .join("\n  ");

  const user = [
    `Date range: ${input.stats.dateRange.from} to ${input.stats.dateRange.to}`,
    `Total events: ${input.stats.eventCount}`,
    `Total fatalities (best): ${input.stats.fatalitiesBestTotal}`,
    input.stats.highestDay
      ? `Highest-day fatalities: ${input.stats.highestDay.fatalitiesBest} (${input.stats.highestDay.date})`
      : null,
    `Top locations:\n  ${topLocs || "(none)"}`,
    `Top events:\n  ${topEvts || "(none)"}`,
    `Dataset version: ${input.datasetVersion}`,
    `Active filters: ${input.filters || "none"}`,
    `Time window: ${input.timeWindow}`,
    input.sampleIsSmall ? "Note: the filtered sample is small." : null,
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}

function clampToWordLimit(text: string, maxWords = 120): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ") + "…";
}

function buildTemplateSummary(input: UcdpSummaryInput): string {
  const s = input.stats;
  const parts: string[] = [];

  parts.push(
    `Between ${s.dateRange.from} and ${s.dateRange.to}, ${s.eventCount} UCDP fatality-coded events were recorded with a combined best-estimate of ${s.fatalitiesBestTotal.toLocaleString()} fatalities.`
  );

  if (s.topLocations.length > 0) {
    const names = s.topLocations
      .slice(0, 3)
      .map((l) => `${l.name || l.country} (${l.fatalitiesBestTotal} fatalities)`)
      .join(", ");
    parts.push(`Top hotspots: ${names}.`);
  }

  if (s.highestDay) {
    parts.push(
      `The highest single-day fatality count was ${s.highestDay.fatalitiesBest} on ${s.highestDay.date}.`
    );
  }

  parts.push(
    `Data note: UCDP GED, fatality-coded events; release version ${input.datasetVersion}.`
  );

  return clampToWordLimit(parts.join(" "));
}

let localUnavailable = false;

export async function generateUcdpSummary(
  input: UcdpSummaryInput
): Promise<{ text: string; degraded: boolean }> {
  if (input.stats.eventCount === 0) {
    return { text: "", degraded: false };
  }

  const prompt = buildUcdpSummaryPrompt(input);

  if (!localUnavailable) {
    try {
      const { isLocalLlmAvailable, generateLocalSummary } = await import(
        "../llm/localClient"
      );
      if (isLocalLlmAvailable()) {
        const raw = await generateLocalSummary(prompt);
        return { text: clampToWordLimit(raw), degraded: false };
      } else {
        localUnavailable = true;
      }
    } catch {
      localUnavailable = true;
    }
  }

  try {
    const { isHostedLlmAvailable, generateHostedSummary } = await import(
      "../llm/hostedClient"
    );
    if (isHostedLlmAvailable()) {
      const raw = await generateHostedSummary(prompt);
      return { text: clampToWordLimit(raw), degraded: false };
    }
  } catch {
    // fall through to template
  }

  return { text: buildTemplateSummary(input), degraded: true };
}
