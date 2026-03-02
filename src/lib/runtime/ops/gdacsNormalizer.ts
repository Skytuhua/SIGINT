import type { DisasterAlert } from "../../providers/types";
import type { GdacsRawItem } from "./types";
import { mergeByCanonicalId } from "./mergePolicy";

export const GDACS_MAX_ITEMS = 500;

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toTs(value: unknown, fallback = Date.now()): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function extractSeverityValue(value: string | undefined): number | null {
  if (!value) return null;
  const numeric = value.match(/(-?\d+(?:\.\d+)?)/);
  if (!numeric) return null;
  const parsed = Number(numeric[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeGdacsItem(raw: GdacsRawItem): DisasterAlert | null {
  const eventType = String(raw["gdacs:eventtype"] ?? "").trim().toLowerCase();
  const eventId = String(raw["gdacs:eventid"] ?? "").trim();
  const episodeId = String(raw["gdacs:episodeid"] ?? "").trim();
  const guid = typeof raw.guid === "string" ? raw.guid.trim() : "";
  const upstreamId =
    guid || `gdacs:${eventType || "event"}:${eventId || "unknown"}:${episodeId || "0"}`;

  const lat = toNumber(raw["geo:lat"]);
  const lon = toNumber(raw["geo:long"]);
  if (lat == null || lon == null) return null;

  const title = String(raw.title ?? "").trim();
  if (!title) return null;

  const severity = String(raw["gdacs:severity"] ?? "").trim() || undefined;
  const alertLevel = String(raw["gdacs:alertlevel"] ?? "").trim() || undefined;
  const updatedAt = toTs(raw["gdacs:datemodified"] ?? raw.pubDate ?? raw["gdacs:todate"]);
  const startedAt = raw["gdacs:fromdate"] ? toTs(raw["gdacs:fromdate"], updatedAt) : null;

  return {
    id: `gdacs:${upstreamId}`,
    source: "gdacs",
    upstreamId,
    title,
    eventType: eventType || "unknown",
    eventId: eventId || undefined,
    episodeId: episodeId || undefined,
    alertLevel,
    severity,
    severityValue: extractSeverityValue(severity),
    country: String(raw["gdacs:country"] ?? "").trim() || undefined,
    description: String(raw.description ?? "").trim() || undefined,
    lat,
    lon,
    startedAt,
    updatedAt,
    link: String(raw.link ?? "").trim() || undefined,
    raw,
  };
}

export function normalizeGdacsItems(
  items: GdacsRawItem[],
  existing: DisasterAlert[] = []
): DisasterAlert[] {
  const normalized = items
    .map(normalizeGdacsItem)
    .filter((item): item is DisasterAlert => Boolean(item));

  return mergeByCanonicalId(existing, normalized, {
    source: "gdacs",
    maxItems: GDACS_MAX_ITEMS,
    getUpstreamId: (item) => item.upstreamId,
    getUpdatedAt: (item) => item.updatedAt,
  });
}
