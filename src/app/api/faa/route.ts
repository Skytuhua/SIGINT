import { NextResponse } from "next/server";
import { STANDARD_LIMITER } from "../../../lib/server/rateLimitPresets";
import { withRateLimit } from "../../../lib/server/withRateLimit";

export const dynamic = "force-dynamic";

const FAA_URL = "https://nasstatus.faa.gov/api/airport-status-information";
const TTL_MS = 5 * 60_000;
const STALE_MS = 60 * 60_000;

export interface FaaAirportStatus {
  icao: string;
  iata: string;
  name: string;
  city: string;
  state: string;
  lat: number;
  lon: number;
  delayType?: string;
  avgDelay?: string;
  reason?: string;
  closureBegin?: string;
  closureEnd?: string;
}

interface FaaRawEntry {
  IATA?: string;
  ICAO?: string;
  Name?: string;
  City?: string;
  State?: string;
  Latitude?: string;
  Longitude?: string;
  SupportedAirport?: string;
  Delay?: boolean;
  GroundDelay?: { avgTime?: string; reason?: string };
  GroundStop?: { endTime?: string; reason?: string };
  Depart?: Array<{ maxTime?: string; minTime?: string; trend?: string; reason?: string }>;
  Arrive?: Array<{ maxTime?: string; minTime?: string; trend?: string; reason?: string }>;
  Closure?: { begin?: string; end?: string; reason?: string };
}

let cache: { data: FaaAirportStatus[]; expires: number; staleUntil: number } | null = null;

function normalize(raw: FaaRawEntry[]): FaaAirportStatus[] {
  return raw
    .filter((r) => r.Latitude && r.Longitude)
    .map((r) => {
      let delayType: string | undefined;
      let avgDelay: string | undefined;
      let reason: string | undefined;
      let closureBegin: string | undefined;
      let closureEnd: string | undefined;

      if (r.GroundDelay?.avgTime) {
        delayType = "Ground Delay";
        avgDelay = r.GroundDelay.avgTime;
        reason = r.GroundDelay.reason;
      } else if (r.GroundStop?.endTime) {
        delayType = "Ground Stop";
        avgDelay = `until ${r.GroundStop.endTime}`;
        reason = r.GroundStop.reason;
      } else if (r.Depart?.length) {
        const d = r.Depart[0];
        delayType = "Departure Delay";
        avgDelay = [d.minTime, d.maxTime].filter(Boolean).join("-");
        reason = d.reason;
      } else if (r.Arrive?.length) {
        const a = r.Arrive[0];
        delayType = "Arrival Delay";
        avgDelay = [a.minTime, a.maxTime].filter(Boolean).join("-");
        reason = a.reason;
      } else if (r.Closure?.begin) {
        delayType = "Closure";
        closureBegin = r.Closure.begin;
        closureEnd = r.Closure.end;
        reason = r.Closure.reason;
      }

      return {
        icao: r.ICAO ?? "",
        iata: r.IATA ?? "",
        name: r.Name ?? r.IATA ?? "Unknown",
        city: r.City ?? "",
        state: r.State ?? "",
        lat: parseFloat(r.Latitude!),
        lon: parseFloat(r.Longitude!),
        delayType,
        avgDelay,
        reason,
        closureBegin,
        closureEnd,
      };
    })
    .filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lon));
}

async function handler() {
  const now = Date.now();

  if (cache && cache.expires > now) {
    return NextResponse.json(cache.data, {
      headers: { "Cache-Control": "private, max-age=0, must-revalidate" },
    });
  }

  try {
    const res = await fetch(FAA_URL, {
      headers: {
        "User-Agent": "SIGINT/0.1 (educational/research use)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`FAA returned ${res.status}`);

    const raw = (await res.json()) as FaaRawEntry[];
    const data = normalize(Array.isArray(raw) ? raw : []);

    cache = { data, expires: now + TTL_MS, staleUntil: now + STALE_MS };
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, max-age=0, must-revalidate" },
    });
  } catch (err) {
    console.error("[api/faa] fetch error:", err);
    if (cache && cache.staleUntil > now) {
      return NextResponse.json(cache.data, {
        headers: { "X-Stale": "true", "Cache-Control": "private, max-age=0" },
      });
    }
    return NextResponse.json([], { status: 200 });
  }
}

export const GET = withRateLimit(STANDARD_LIMITER, handler);
