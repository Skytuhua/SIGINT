import type { LayerFeatureCollection } from "../newsLayers/types";

export interface UcdpAggregatedStats {
  dateRange: { from: string; to: string };
  eventCount: number;
  fatalitiesBestTotal: number;
  highestDay: { date: string; fatalitiesBest: number } | null;
  topLocations: Array<{
    name: string;
    country: string;
    eventCount: number;
    fatalitiesBestTotal: number;
  }>;
  topEvents: Array<{
    date: string;
    location: string;
    country: string;
    actors: string;
    fatalitiesBest: number;
  }>;
}

export function aggregateUcdpStats(
  data: LayerFeatureCollection
): UcdpAggregatedStats {
  const features = data.features ?? [];

  if (features.length === 0) {
    return {
      dateRange: { from: "", to: "" },
      eventCount: 0,
      fatalitiesBestTotal: 0,
      highestDay: null,
      topLocations: [],
      topEvents: [],
    };
  }

  let minDate = "9999-99-99";
  let maxDate = "0000-00-00";
  let fatalitiesBestTotal = 0;

  const byDate = new Map<string, number>();
  const byLocation = new Map<
    string,
    { name: string; country: string; eventCount: number; fatalitiesBestTotal: number }
  >();

  interface EventRecord {
    date: string;
    location: string;
    country: string;
    actors: string;
    fatalitiesBest: number;
  }
  const allEvents: EventRecord[] = [];

  for (const f of features) {
    const props = (f.properties ?? {}) as Record<string, unknown>;
    const date = String(props.date ?? "");
    const fb = Number(props.fatalities_best ?? 0);
    const country = String(props.country ?? "");
    const locationName = String(props.locationName ?? props.admin1 ?? "");
    const actor1 = String(props.actor1Name ?? "");
    const actor2 = props.actor2Name ? String(props.actor2Name) : "";
    const actors = actor2 ? `${actor1} vs ${actor2}` : actor1;

    if (date < minDate) minDate = date;
    if (date > maxDate) maxDate = date;
    fatalitiesBestTotal += fb;

    byDate.set(date, (byDate.get(date) ?? 0) + fb);

    const locKey = `${country}::${locationName || country}`;
    const existing = byLocation.get(locKey);
    if (existing) {
      existing.eventCount += 1;
      existing.fatalitiesBestTotal += fb;
    } else {
      byLocation.set(locKey, {
        name: locationName || country,
        country,
        eventCount: 1,
        fatalitiesBestTotal: fb,
      });
    }

    allEvents.push({ date, location: locationName, country, actors, fatalitiesBest: fb });
  }

  let highestDay: { date: string; fatalitiesBest: number } | null = null;
  byDate.forEach((total, date) => {
    if (!highestDay || total > highestDay.fatalitiesBest) {
      highestDay = { date, fatalitiesBest: total };
    }
  });

  const topLocations = Array.from(byLocation.values())
    .sort((a, b) => b.fatalitiesBestTotal - a.fatalitiesBestTotal || b.eventCount - a.eventCount)
    .slice(0, 4);

  const topEvents = allEvents
    .sort((a, b) => b.fatalitiesBest - a.fatalitiesBest)
    .slice(0, 10);

  return {
    dateRange: { from: minDate, to: maxDate },
    eventCount: features.length,
    fatalitiesBestTotal,
    highestDay,
    topLocations,
    topEvents,
  };
}
