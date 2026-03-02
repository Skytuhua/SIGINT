import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Earthquake, Flight } from "../../../../../lib/providers/types";

export const dynamic = "force-dynamic";

type GenericFeature = {
  type: "Feature";
  id?: string | number;
  geometry: {
    type: "Point" | "LineString" | "Polygon";
    coordinates: unknown;
  };
  properties?: Record<string, unknown>;
};

type GenericFeatureCollection = {
  type: "FeatureCollection";
  features: GenericFeature[];
};

function toFeatureCollection(features: GenericFeature[]): GenericFeatureCollection {
  return { type: "FeatureCollection", features };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} => ${res.status}`);
  return (await res.json()) as T;
}

function featurePoint(id: string, lon: number, lat: number, properties: Record<string, unknown>): GenericFeature {
  return {
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties,
  };
}

function fromGdeltPoints(points: Array<{ lat: number; lon: number; name?: string; count?: number }>, prefix: string): GenericFeatureCollection {
  return toFeatureCollection(
    points
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
      .slice(0, 2000)
      .map((p, idx) =>
        featurePoint(`${prefix}-${idx}`, p.lon, p.lat, {
          name: p.name ?? prefix,
          count: p.count ?? 1,
          ts: Date.now(),
        })
      )
  );
}

function fromFlightsAsPoints(rows: Flight[], prefix: string): GenericFeatureCollection {
  return toFeatureCollection(
    rows
      .filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lon))
      .slice(0, 4000)
      .map((f) =>
        featurePoint(`${prefix}-${f.icao}`, f.lon, f.lat, {
          callsign: f.callsign,
          icao: f.icao,
          speedMs: f.speedMs ?? null,
          onGround: Boolean(f.onGround),
          ts: Date.now(),
        })
      )
  );
}

function fromEarthquakes(rows: Earthquake[]): GenericFeatureCollection {
  return toFeatureCollection(
    rows.slice(0, 2000).map((q) =>
      featurePoint(`eq-${q.id}`, q.lon, q.lat, {
        mag: q.mag,
        depthKm: q.depthKm,
        place: q.place,
        ts: q.time,
      })
    )
  );
}

function fromFlightDelayProxy(rows: Flight[]): GenericFeatureCollection {
  const buckets = new Map<string, { lon: number; lat: number; count: number; ground: number }>();
  for (const row of rows) {
    if (!Number.isFinite(row.lat) || !Number.isFinite(row.lon)) continue;
    const latCell = Math.floor((row.lat + 90) / 4);
    const lonCell = Math.floor((row.lon + 180) / 4);
    const key = `${latCell}:${lonCell}`;
    const current = buckets.get(key);
    if (!current) {
      buckets.set(key, {
        lon: row.lon,
        lat: row.lat,
        count: 1,
        ground: row.onGround ? 1 : 0,
      });
      continue;
    }
    current.count += 1;
    current.ground += row.onGround ? 1 : 0;
    current.lon = (current.lon + row.lon) / 2;
    current.lat = (current.lat + row.lat) / 2;
  }

  return toFeatureCollection(
    Array.from(buckets.entries())
      .slice(0, 1200)
      .map(([key, value]) => {
        const delayScore = Math.round((value.ground / Math.max(1, value.count)) * 100);
        return featurePoint(`flight-delay-${key}`, value.lon, value.lat, {
          flights: value.count,
          delayScore,
          label: `${delayScore}% delay proxy`,
          ts: Date.now(),
        });
      })
  );
}

async function loadSnapshot(layerId: string): Promise<GenericFeatureCollection> {
  const file = path.join(process.cwd(), "public", "data", "news-layers", `${layerId}.geojson`);
  const text = await readFile(file, "utf8");
  const payload = JSON.parse(text) as GenericFeatureCollection;
  if (payload?.type !== "FeatureCollection" || !Array.isArray(payload.features)) {
    throw new Error(`invalid snapshot ${layerId}`);
  }
  return payload;
}

async function getLayerPayload(layerId: string, origin: string): Promise<GenericFeatureCollection> {
  if (layerId === "intel-hotspots" || layerId === "conflict-zones" || layerId === "protests") {
    const query =
      layerId === "intel-hotspots"
        ? "conflict intel hotspot"
        : layerId === "conflict-zones"
          ? "conflict violence armed"
          : "protest demonstration riot";

    const gdelt = await fetchJson<{ points: Array<{ lat: number; lon: number; name?: string; count?: number }> }>(
      `${origin}/api/news/gdelt-geo?q=${encodeURIComponent(query)}&timespan=24h&mode=pointdata&maxrecords=250`
    );
    return fromGdeltPoints(gdelt.points ?? [], layerId);
  }

  if (layerId === "military-activity") {
    const flights = await fetchJson<Flight[]>(`${origin}/api/military`);
    return fromFlightsAsPoints(flights ?? [], "mil-activity");
  }

  if (layerId === "flight-delays") {
    const flights = await fetchJson<Flight[]>(`${origin}/api/opensky`);
    return fromFlightDelayProxy(flights ?? []);
  }

  if (layerId === "earthquakes-live") {
    const quakes = await fetchJson<Earthquake[]>(`${origin}/api/earthquakes`);
    return fromEarthquakes(quakes ?? []);
  }

  if (layerId === "natural-events" || layerId === "fires") {
    const url =
      layerId === "fires"
        ? "https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&status=open"
        : "https://eonet.gsfc.nasa.gov/api/v3/events?status=open";
    const payload = await fetchJson<{ events?: Array<{ id: string; title: string; categories?: Array<{ title: string }>; geometry?: Array<{ date: string; coordinates: [number, number] }> }> }>(url);
    const features = (payload.events ?? [])
      .flatMap((event) =>
        (event.geometry ?? [])
          .filter((g) => Array.isArray(g.coordinates) && g.coordinates.length >= 2)
          .map((g, idx) =>
            featurePoint(`${event.id}-${idx}`, Number(g.coordinates[0]), Number(g.coordinates[1]), {
              title: event.title,
              category: event.categories?.[0]?.title ?? "event",
              ts: Date.parse(g.date) || Date.now(),
            })
          )
      )
      .slice(0, 2000);
    return toFeatureCollection(features);
  }

  if (layerId === "disaster-alerts") {
    const payload = await fetchJson<{
      items?: Array<{ lat?: number; lon?: number; title?: string; eventType?: string; alertLevel?: string; updatedAt?: number }>;
    }>(`${origin}/api/gdacs`);
    const features = (payload.items ?? [])
      .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon))
      .slice(0, 500)
      .map((item, idx) =>
        featurePoint(`gdacs-${idx}`, item.lon!, item.lat!, {
          name: item.title ?? "Disaster Alert",
          eventType: item.eventType ?? "unknown",
          alertLevel: item.alertLevel ?? "green",
          ts: item.updatedAt ?? Date.now(),
        })
      );
    return toFeatureCollection(features);
  }

  if (
    layerId === "piracy-incidents" ||
    layerId === "cyber-incidents" ||
    layerId === "election-events" ||
    layerId === "disease-outbreaks"
  ) {
    const queryMap: Record<string, string> = {
      "piracy-incidents":  "piracy maritime hijack vessel attack",
      "cyber-incidents":   "cyber attack hacking ransomware data breach",
      "election-events":   "election vote referendum ballot electoral",
      "disease-outbreaks": "disease outbreak epidemic cholera ebola mpox",
    };
    const gdelt = await fetchJson<{ points?: Array<{ lat: number; lon: number; name?: string; count?: number }> }>(
      `${origin}/api/news/gdelt-geo?q=${encodeURIComponent(queryMap[layerId])}&timespan=24h&mode=pointdata&maxrecords=200`
    );
    return fromGdeltPoints(gdelt.points ?? [], layerId);
  }

  if (layerId === "space-launches") {
    const payload = await fetchJson<{
      results?: Array<{
        id: string;
        name: string;
        status?: { name?: string };
        launch_service_provider?: { name?: string };
        pad?: { latitude?: string; longitude?: string };
        net?: string;
      }>;
    }>("https://ll.thespacedevs.com/2.3.0/launch/previous/?format=json&limit=50&ordering=-net");
    const features = (payload.results ?? [])
      .filter((r) => r.pad?.latitude && r.pad?.longitude)
      .map((r) =>
        featurePoint(`launch-${r.id}`, parseFloat(r.pad!.longitude!), parseFloat(r.pad!.latitude!), {
          name: r.name,
          provider: r.launch_service_provider?.name ?? "",
          status: r.status?.name ?? "",
          ts: r.net ? Date.parse(r.net) : Date.now(),
        })
      );
    return toFeatureCollection(features);
  }

  if (layerId === "weather-alerts") {
    const payload = await fetchJson<{ features?: Array<{ id?: string; geometry?: { type: "Polygon" | "Point"; coordinates: unknown }; properties?: Record<string, unknown> }> }>(
      "https://api.weather.gov/alerts/active"
    );
    const features: GenericFeature[] = [];
    for (const item of payload.features ?? []) {
      if (!item.geometry) continue;
      if (item.geometry.type === "Point") {
        const coords = item.geometry.coordinates as number[];
        if (!Array.isArray(coords) || coords.length < 2) continue;
        features.push(featurePoint(`wx-${item.id ?? features.length}`, Number(coords[0]), Number(coords[1]), {
          ...(item.properties ?? {}),
          ts: Date.now(),
        }));
      } else if (item.geometry.type === "Polygon") {
        features.push({
          type: "Feature",
          id: `wx-${item.id ?? features.length}`,
          geometry: { type: "Polygon", coordinates: item.geometry.coordinates },
          properties: { ...(item.properties ?? {}), ts: Date.now() },
        });
      }
    }
    return toFeatureCollection(features.slice(0, 1500));
  }

  return loadSnapshot(layerId);
}

export async function GET(request: Request, { params }: { params: { layerId: string } }) {
  const layerId = params.layerId;
  const origin = new URL(request.url).origin;
  try {
    const payload = await getLayerPayload(layerId, origin);
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    try {
      const fallback = await loadSnapshot(layerId);
      return NextResponse.json(fallback, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return NextResponse.json(
        { type: "FeatureCollection", features: [], error: String(error) },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }
  }
}
