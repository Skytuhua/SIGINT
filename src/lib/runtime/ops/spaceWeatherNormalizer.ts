import type { SpaceWeatherAlert, SpaceWeatherAlertLevel } from "../../providers/types";
import type { SwpcRawItem } from "./types";
import { mergeByCanonicalId } from "./mergePolicy";

export const SPACE_WEATHER_MAX_ITEMS = 300;

function toTs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function firstMeaningfulLine(message: string): string {
  const lines = message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines[0] ?? "Space Weather Bulletin";
}

function deriveLevel(message: string): SpaceWeatherAlertLevel {
  const upper = message.toUpperCase();
  if (upper.includes("WARNING")) return "WARNING";
  if (upper.includes("WATCH")) return "WATCH";
  if (upper.includes("ALERT")) return "ALERT";
  return "INFO";
}

function summarizeMessage(message: string): string {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (!normalized) return "No summary provided.";
  return normalized.slice(0, 280);
}

export function normalizeSwpcItem(raw: SwpcRawItem): SpaceWeatherAlert | null {
  const productId = String(raw.product_id ?? "").trim();
  const issueDatetimeRaw = String(raw.issue_datetime ?? "").trim();
  const message = typeof raw.message === "string" ? raw.message.trim() : "";
  if (!productId || !issueDatetimeRaw || !message) return null;

  const issuedAt = toTs(issueDatetimeRaw);
  if (issuedAt == null) return null;

  const upstreamId = `${productId}:${issueDatetimeRaw}`;
  return {
    id: `swpc:${upstreamId}`,
    source: "swpc",
    upstreamId,
    productId,
    issueDatetime: issuedAt,
    title: firstMeaningfulLine(message),
    level: deriveLevel(message),
    summary: summarizeMessage(message),
    rawMessage: message,
  };
}

export function normalizeSwpcItems(
  items: SwpcRawItem[],
  existing: SpaceWeatherAlert[] = []
): SpaceWeatherAlert[] {
  const normalized = items
    .map(normalizeSwpcItem)
    .filter((item): item is SpaceWeatherAlert => Boolean(item));

  return mergeByCanonicalId(existing, normalized, {
    source: "swpc",
    maxItems: SPACE_WEATHER_MAX_ITEMS,
    getUpstreamId: (item) => item.upstreamId,
    getUpdatedAt: (item) => item.issueDatetime,
  });
}
