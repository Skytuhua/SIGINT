export interface MergePolicyOptions<T> {
  source: string;
  maxItems: number;
  getUpstreamId: (item: T) => string;
  getUpdatedAt: (item: T) => number;
}

export function mergeByCanonicalId<T>(
  existing: T[],
  incoming: T[],
  options: MergePolicyOptions<T>
): T[] {
  const byId = new Map<string, T>();

  const put = (item: T) => {
    const upstreamId = options.getUpstreamId(item);
    if (!upstreamId) return;
    const key = `${options.source}:${upstreamId}`;
    const prev = byId.get(key);
    if (!prev) {
      byId.set(key, item);
      return;
    }
    const prevTs = options.getUpdatedAt(prev);
    const nextTs = options.getUpdatedAt(item);
    if (nextTs > prevTs) {
      byId.set(key, item);
    }
  };

  existing.forEach(put);
  incoming.forEach(put);

  return Array.from(byId.values())
    .sort((a, b) => options.getUpdatedAt(b) - options.getUpdatedAt(a))
    .slice(0, Math.max(1, options.maxItems));
}
