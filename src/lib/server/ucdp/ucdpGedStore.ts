import type { UcdpEvent, UcdpQueryParams, UcdpStoreMeta, UcdpViolenceType } from "./types";

const UCDP_API_BASE = "https://ucdpapi.pcr.uu.se/api/gedevents";
const DEFAULT_VERSION = process.env.UCDP_GED_VERSION ?? "25.1";
const DEFAULT_RELEASE_DATE = process.env.UCDP_GED_RELEASE_DATE ?? "2025-06-01";
const UCDP_SOURCE_URL = "https://ucdp.uu.se/downloads/index.html";
const PAGE_SIZE = 1000;
const FETCH_TIMEOUT_MS = 30_000;
const MAX_PAGES = 300;
const REFRESH_INTERVAL_MS = 12 * 60 * 60_000;

function mapViolenceType(typeCode: number): UcdpViolenceType {
  if (typeCode === 1) return "state-based";
  if (typeCode === 2) return "non-state";
  return "one-sided";
}

interface UcdpApiRow {
  id: number;
  relid?: string;
  year: number;
  active_year?: number;
  type_of_violence: number;
  conflict_new_id: number;
  conflict_name?: string;
  dyad_name?: string;
  side_a?: string;
  side_a_new_id?: number;
  side_b?: string;
  side_b_new_id?: number;
  where_coordinates?: string;
  where_description?: string;
  adm_1?: string;
  adm_2?: string;
  latitude: number;
  longitude: number;
  country?: string;
  country_id?: number;
  region?: string;
  date_start?: string;
  date_end?: string;
  best: number;
  low: number;
  high: number;
  deaths_a?: number;
  deaths_b?: number;
  deaths_civilians?: number;
  deaths_unknown?: number;
}

interface StoreState {
  events: UcdpEvent[];
  byYear: Map<number, UcdpEvent[]>;
  byYearCountry: Map<string, UcdpEvent[]>;
  meta: UcdpStoreMeta;
  loading: boolean;
  loadPromise: Promise<void> | null;
}

const store: StoreState = {
  events: [],
  byYear: new Map(),
  byYearCountry: new Map(),
  meta: {
    datasetVersion: DEFAULT_VERSION,
    releaseDate: DEFAULT_RELEASE_DATE,
    coverage: { fromYear: 0, toYear: 0 },
    lastRefreshedAt: 0,
    totalEvents: 0,
    status: "unavailable",
  },
  loading: false,
  loadPromise: null,
};

function parseRow(row: UcdpApiRow, version: string): UcdpEvent | null {
  const lat = Number(row.latitude);
  const lon = Number(row.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const dateRaw = row.date_start ?? "";
  const date = dateRaw.slice(0, 10) || `${row.year}-01-01`;

  return {
    id: `ucdp-${row.id}`,
    type: "ucdp_event",
    violenceType: mapViolenceType(row.type_of_violence),
    conflictId: row.conflict_new_id ?? 0,
    conflictName: row.conflict_name ?? "",
    actor1Name: row.side_a ?? "",
    actor2Name: row.side_b || null,
    country: row.country ?? "",
    admin1: row.adm_1 ?? "",
    locationName: row.where_coordinates ?? row.where_description ?? "",
    lat,
    lon,
    date,
    year: row.year,
    fatalities_best: Math.max(0, row.best ?? 0),
    fatalities_low: Math.max(0, row.low ?? 0),
    fatalities_high: Math.max(0, row.high ?? 0),
    sourceDatasetVersion: version,
    sourceName: "UCDP GED",
    sourceUrl: UCDP_SOURCE_URL,
    lastUpdated: Date.now(),
  };
}

async function fetchPage(
  version: string,
  year: number,
  page: number,
): Promise<{ rows: UcdpApiRow[]; totalPages: number }> {
  const url = `${UCDP_API_BASE}/${version}?pagesize=${PAGE_SIZE}&page=${page}&Year=${year}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`UCDP API ${res.status}`);
    const json = (await res.json()) as {
      TotalCount?: number;
      Result?: UcdpApiRow[];
    };
    const rows = json.Result ?? [];
    const total = json.TotalCount ?? rows.length;
    const totalPages = Math.ceil(total / PAGE_SIZE);
    return { rows, totalPages };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function fetchYear(version: string, year: number): Promise<UcdpEvent[]> {
  const events: UcdpEvent[] = [];
  let page = 0;
  let totalPages = 1;

  while (page < totalPages && page < MAX_PAGES) {
    const result = await fetchPage(version, year, page);
    totalPages = result.totalPages;
    for (const row of result.rows) {
      const parsed = parseRow(row, version);
      if (parsed) events.push(parsed);
    }
    page++;
  }

  return events;
}

function buildIndices(events: UcdpEvent[]): void {
  store.byYear.clear();
  store.byYearCountry.clear();

  for (const ev of events) {
    const yearBucket = store.byYear.get(ev.year);
    if (yearBucket) yearBucket.push(ev);
    else store.byYear.set(ev.year, [ev]);

    const ycKey = `${ev.year}::${ev.country}`;
    const ycBucket = store.byYearCountry.get(ycKey);
    if (ycBucket) ycBucket.push(ev);
    else store.byYearCountry.set(ycKey, [ev]);
  }
}

async function loadDataset(): Promise<void> {
  const version = DEFAULT_VERSION;
  // Derive the dataset's latest data year from the version string.
  // UCDP GED vXX.1 (e.g. "25.1") covers events through year 20XX-1 (e.g. 2024).
  // Using currentYear-1 would fetch a year not yet in the dataset when the app
  // runs in the year after the dataset release.
  const versionMajor = parseInt(version.split(".")[0], 10);
  const defaultYear = versionMajor > 0 ? versionMajor + 2000 - 1 : new Date().getFullYear() - 1;

  try {
    const events = await fetchYear(version, defaultYear);

    store.events = events;
    buildIndices(events);

    const years = Array.from(store.byYear.keys()).sort((a, b) => a - b);
    store.meta = {
      datasetVersion: version,
      releaseDate: DEFAULT_RELEASE_DATE,
      coverage: {
        fromYear: years[0] ?? defaultYear,
        toYear: years[years.length - 1] ?? defaultYear,
      },
      lastRefreshedAt: Date.now(),
      totalEvents: events.length,
      status: events.length > 0 ? "live" : "degraded",
    };
  } catch (err) {
    console.error("[ucdp-store] Failed to load dataset:", err);
    if (store.events.length > 0) {
      store.meta.status = "cached";
    } else {
      store.meta.status = "degraded";
    }
  }
}

export async function ensureUcdpLoaded(): Promise<void> {
  const now = Date.now();
  const stale = now - store.meta.lastRefreshedAt > REFRESH_INTERVAL_MS;

  if (store.events.length > 0 && !stale) return;

  if (store.loading && store.loadPromise) {
    await store.loadPromise;
    return;
  }

  store.loading = true;
  store.loadPromise = loadDataset().finally(() => {
    store.loading = false;
    store.loadPromise = null;
  });

  await store.loadPromise;
}

export async function loadAdditionalYear(year: number): Promise<void> {
  if (store.byYear.has(year)) return;
  const version = DEFAULT_VERSION;
  try {
    const events = await fetchYear(version, year);
    store.events.push(...events);
    for (const ev of events) {
      const yearBucket = store.byYear.get(ev.year);
      if (yearBucket) yearBucket.push(ev);
      else store.byYear.set(ev.year, [ev]);

      const ycKey = `${ev.year}::${ev.country}`;
      const ycBucket = store.byYearCountry.get(ycKey);
      if (ycBucket) ycBucket.push(ev);
      else store.byYearCountry.set(ycKey, [ev]);
    }
    const years = Array.from(store.byYear.keys()).sort((a, b) => a - b);
    store.meta.coverage.fromYear = years[0] ?? store.meta.coverage.fromYear;
    store.meta.coverage.toYear = years[years.length - 1] ?? store.meta.coverage.toYear;
    store.meta.totalEvents = store.events.length;
  } catch (err) {
    console.error(`[ucdp-store] Failed to load year ${year}:`, err);
  }
}

export function queryUcdpEvents(params: UcdpQueryParams): UcdpEvent[] {
  const {
    fromYear,
    toYear,
    countries,
    violenceTypes,
    minFatalities = 1,
    viewport,
  } = params;

  let pool: UcdpEvent[];

  if (fromYear != null && toYear != null && fromYear === toYear && countries?.length === 1) {
    pool = store.byYearCountry.get(`${fromYear}::${countries[0]}`) ?? [];
  } else if (fromYear != null && toYear != null && fromYear === toYear) {
    pool = store.byYear.get(fromYear) ?? [];
  } else {
    pool = store.events;
  }

  return pool.filter((ev) => {
    if (fromYear != null && ev.year < fromYear) return false;
    if (toYear != null && ev.year > toYear) return false;
    if (countries?.length && !countries.includes(ev.country)) return false;
    if (violenceTypes?.length && !violenceTypes.includes(ev.violenceType))
      return false;
    if (ev.fatalities_best < minFatalities) return false;
    if (viewport) {
      if (
        ev.lon < viewport.west ||
        ev.lon > viewport.east ||
        ev.lat < viewport.south ||
        ev.lat > viewport.north
      )
        return false;
    }
    return true;
  });
}

export function getUcdpMeta(): UcdpStoreMeta {
  return { ...store.meta };
}

export function getUcdpDefaultYear(): number {
  if (store.meta.coverage.toYear > 0) return store.meta.coverage.toYear;
  return new Date().getFullYear() - 1;
}
