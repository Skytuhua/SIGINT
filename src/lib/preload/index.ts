/**
 * Preload orchestration — module-level singleton.
 *
 * Starts exactly once when `startPreload()` is called (from PreloadGatedApp at
 * module evaluation time, i.e. before any React component mounts).  Results
 * live in module memory and are never reset by React lifecycle events.
 *
 * Browser-only. Never call on the server.
 */

import { writePersistentFeedCache } from "../runtime/persistentFeedCache";
import { setCountryBordersCache } from "../maps/countryBordersCache";
import type { NewsArticle } from "../news/types";
import type { LayerFeatureCollection } from "../newsLayers/types";

// ─── Public types ─────────────────────────────────────────────────────────────

export type SubsystemId =
  | "news"
  | "map"
  | "globe"
  | "layers"
  | "country-detail"
  | "search";

export type SubsystemStatus = "loading" | "ready" | "partial" | "offline" | "failed";

export interface SubsystemState {
  id: SubsystemId;
  label: string;
  status: SubsystemStatus;
  detail?: string;
}

export type SubsystemMap = Record<SubsystemId, SubsystemState>;

// ─── Module-level state ───────────────────────────────────────────────────────

const SUBSYSTEM_ORDER: SubsystemId[] = [
  "news", "map", "globe", "layers", "country-detail", "search",
];

const LABELS: Record<SubsystemId, string> = {
  news: "News Feed",
  map: "Map Assets",
  globe: "Globe",
  layers: "Intelligence Layers",
  "country-detail": "Country Detail",
  search: "Search Index",
};

function makeInitial(): SubsystemMap {
  return Object.fromEntries(
    SUBSYSTEM_ORDER.map((id) => [id, { id, label: LABELS[id], status: "loading" as const }])
  ) as SubsystemMap;
}

let _states: SubsystemMap = makeInitial();
let _started = false;
let _done = false;
let _deferMapWarmup = false;
const _listeners = new Set<(s: SubsystemMap) => void>();
const _doneWaiters: Array<() => void> = [];

function _emit(): void {
  const snapshot = { ..._states };
  _listeners.forEach((l) => { try { l(snapshot); } catch {} });
}

function _update(id: SubsystemId, status: SubsystemStatus, detail?: string): void {
  _states = { ..._states, [id]: { ..._states[id], status, detail } };
  _emit();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Subscribe to state updates. Returns an unsubscribe function. */
export function subscribeToPreload(listener: (s: SubsystemMap) => void): () => void {
  _listeners.add(listener);
  listener({ ..._states }); // immediate snapshot
  return () => _listeners.delete(listener);
}

/** Promise that resolves once all subsystems have settled (or timed out). */
export function preloadComplete(): Promise<void> {
  if (_done) return Promise.resolve();
  return new Promise<void>((resolve) => _doneWaiters.push(resolve));
}

/**
 * Start the preload. Idempotent — safe to call multiple times,
 * only the first call has any effect.
 */
export function startPreload(options?: { deferMapWarmup?: boolean }): void {
  if (_started || typeof window === "undefined") return;
  _started = true;
  _deferMapWarmup = options?.deferMapWarmup === true;
  void _run();
}

// ─── Per-task safe fetch ──────────────────────────────────────────────────────

const HARD_TIMEOUT_MS = 25_000;
const MIN_DISPLAY_MS  = 2_000;

const PRELOAD_LAYERS: Array<{ id: string; ttlMs: number }> = [
  { id: "intel-hotspots",   ttlMs: 90_000 },
  { id: "military-activity",ttlMs: 20_000 },
];

async function _safeJson(url: string, timeoutMs: number): Promise<unknown> {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ─── Main orchestration ───────────────────────────────────────────────────────

async function _run(): Promise<void> {
  const t0 = Date.now();

  // Lazy store import — start resolution now so it's ready when news task needs it
  const storeImport = import("../../store").catch(() => null);

  // ── News + Search ─────────────────────────────────────────────────────────
  const newsTask = _safeJson("/api/news/search?q=&limit=60&timespan=24h", 20_000)
    .then(async (raw) => {
      const data  = raw as { items?: NewsArticle[]; degraded?: Record<string, boolean> };
      const items = data.items ?? [];
      const degraded = Object.values(data.degraded ?? {}).some(Boolean);

      // Seed the Zustand store — await so it's done before preloadComplete() fires
      const storeModule = await storeImport;
      if (storeModule && items.length > 0) {
        try { storeModule.useSIGINTStore.getState().setNewsFeedItems(items); } catch {}
      }

      const s: SubsystemStatus =
        items.length >= 20 ? (degraded ? "partial" : "ready") :
        items.length >=  1 ? "partial" : "failed";
      _update("news",   s, `${items.length} articles`);
      _update("search", s === "failed" ? "partial" : s);
    })
    .catch(() => { _update("news", "failed"); _update("search", "failed"); });

  // ── 2D Map ────────────────────────────────────────────────────────────────
  const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  if (maptilerKey) {
    void fetch(
      `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${maptilerKey}`,
      { credentials: "omit" }
    ).catch(() => null);
  }

  const mapTask = _deferMapWarmup
    ? _safeJson("/data/ne_50m_admin_0_countries.geojson", 12_000)
        .then((d) => {
          setCountryBordersCache(d as GeoJSON.FeatureCollection);
          _update("map", "partial", "map warmup deferred on phone");
        })
        .catch(() => _update("map", "offline", "map warmup deferred on phone"))
    : Promise.allSettled([
        _safeJson("/data/ne_50m_admin_0_countries.geojson", 12_000).then((d) => {
          setCountryBordersCache(d as GeoJSON.FeatureCollection);
          return true;
        }),
        import("maplibre-gl").then(() => true),
      ]).then(([geoResult]) => {
        const ok = geoResult.status === "fulfilled";
        _update("map", ok ? "ready" : "partial", ok ? "module + borders cached" : "borders unavailable");
      });

  // ── Globe ─────────────────────────────────────────────────────────────────
  const globeTask = import("../cesium/viewer")
    .then(({ preloadCesium }) => preloadCesium())
    .then(() => _update("globe", "ready"))
    .catch(() => _update("globe", "partial", "module warm failed"));

  // ── Layers ────────────────────────────────────────────────────────────────
  const layersTask = Promise.allSettled(
    PRELOAD_LAYERS.map(({ id, ttlMs }) =>
      _safeJson(`/api/news/layers/${id}`, 12_000)
        .then(async (data) => {
          const fc = data as LayerFeatureCollection;
          if (fc?.features?.length) {
            const now = Date.now();
            await writePersistentFeedCache({
              cacheKey: `news-layer:${id}`,
              savedAt: now,
              expiresAt: now + ttlMs,
              staleUntil: now + 24 * 60 * 60_000,
              payload: fc,
              itemCount: fc.features.length,
            });
          }
          return { id, ok: true, n: fc?.features?.length ?? 0 };
        })
        .catch(() => ({ id, ok: false, n: 0 }))
    )
  ).then((results) => {
    const settled = results.map((r) => r.status === "fulfilled" ? r.value : { id: "?", ok: false, n: 0 });
    const okCount = settled.filter((r) => r.ok).length;
    _update("layers",
      okCount === PRELOAD_LAYERS.length ? "ready" : okCount > 0 ? "partial" : "failed",
      settled.map((r) => `${r.id}:${r.ok ? r.n : "err"}`).join(", "));
  });

  // ── Country Detail ────────────────────────────────────────────────────────
  const countryTask = _safeJson("/api/news/country-profile?country=US", 8_000)
    .then(() => _update("country-detail", "ready"))
    .catch(() => _update("country-detail", "offline", "endpoint unreachable"));

  // ── Race against hard timeout ─────────────────────────────────────────────
  await Promise.race([
    Promise.allSettled([newsTask, mapTask, globeTask, layersTask, countryTask]),
    new Promise<void>((r) => setTimeout(r, HARD_TIMEOUT_MS)),
  ]);

  for (const id of SUBSYSTEM_ORDER) {
    if (_states[id].status === "loading") _update(id, "offline", "timed out");
  }

  // Enforce minimum display time
  const elapsed = Date.now() - t0;
  if (elapsed < MIN_DISPLAY_MS) {
    await new Promise<void>((r) => setTimeout(r, MIN_DISPLAY_MS - elapsed));
  }

  _done = true;
  _doneWaiters.forEach((r) => r());
  _doneWaiters.length = 0;
  _emit();
}
