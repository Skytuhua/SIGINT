export function toUtcMs(value: unknown, fallback = Date.now()): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  if (value instanceof Date) {
    const ts = value.getTime();
    if (Number.isFinite(ts)) return ts;
  }
  return fallback;
}

export function buildRecordKey(...parts: Array<string | number | null | undefined>): string {
  return parts
    .map((part) => (part == null ? "" : String(part).trim().toLowerCase()))
    .filter(Boolean)
    .join("|");
}

export function dedupeByRecordKey<T>(items: T[], keyFn: (item: T) => string): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = keyFn(item).trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function sortByUtcDesc<T>(
  items: T[],
  ts: (item: T) => number,
  tie: (item: T) => string = () => ""
): T[] {
  return [...items].sort((a, b) => {
    const aTs = ts(a);
    const bTs = ts(b);
    if (aTs !== bTs) return bTs - aTs;
    return tie(a).localeCompare(tie(b));
  });
}

