"use client";

import { useEffect } from "react";
import { useSIGINTStore } from "../store";
import type {
  DisasterAlert,
  Earthquake,
  Flight,
  Satellite,
  Scene,
  SpaceWeatherAlert,
} from "../lib/providers/types";
import type { SourceHealthState } from "../lib/dashboard/types";
import { fetchAllCctvCameras } from "../lib/cctv/sources";
import { fetchJsonWithPolicy, isAbortError } from "../lib/runtime/fetchJson";
import {
  buildRecordKey,
  dedupeByRecordKey,
  sortByUtcDesc,
  toUtcMs,
} from "../lib/runtime/normalize";
import { globalRefreshRuntime } from "../lib/runtime/globalRefreshRuntime";
import { logIngestEvent } from "../lib/runtime/ingestLog";
import {
  readPersistentFeedCache,
  writePersistentFeedCache,
} from "../lib/runtime/persistentFeedCache";
import {
  adaptGdacsResponse,
  adaptSpaceWeatherResponse,
  type GdacsRouteResponse,
  type SpaceWeatherRouteResponse,
} from "../lib/runtime/ops/adapters";

const GDACS_CACHE_KEY = "ops:gdacs";
const SWPC_CACHE_KEY = "ops:space-weather";
const GDACS_FRESH_TTL_MS = 6 * 60_000;
const GDACS_STALE_TTL_MS = 60 * 60_000;
const SWPC_FRESH_TTL_MS = 2 * 60_000;
const SWPC_STALE_TTL_MS = 60 * 60_000;

function normalizeFlights(rows: Flight[], forceMilitary: boolean): Flight[] {
  const normalized = rows
    .filter(
      (row) =>
        row &&
        typeof row.icao === "string" &&
        row.icao.trim().length > 0 &&
        Number.isFinite(row.lat) &&
        Number.isFinite(row.lon)
    )
    .map((row) => ({
      ...row,
      icao: row.icao.trim().toLowerCase(),
      isMilitary: forceMilitary ? true : Boolean(row.isMilitary),
    }));

  return dedupeByRecordKey(normalized, (row) =>
    buildRecordKey("flight", row.icao, row.callsign, row.lat, row.lon)
  );
}

/** Dedupe flights by ICAO hex, keeping the entry with highest messageRate. */
function dedupeByIcaoKeepBest(flights: Flight[]): Flight[] {
  const seen = new Map<string, Flight>();
  for (const f of flights) {
    const key = f.icao.toLowerCase();
    const existing = seen.get(key);
    if (!existing || (f.messageRate ?? 0) > (existing.messageRate ?? 0)) {
      seen.set(key, f);
    }
  }
  return Array.from(seen.values());
}

function normalizeEarthquakes(rows: Earthquake[]): Earthquake[] {
  const normalized = rows
    .filter(
      (row) =>
        row &&
        Number.isFinite(row.lat) &&
        Number.isFinite(row.lon) &&
        Number.isFinite(row.mag)
    )
    .map((row) => ({
      ...row,
      time: toUtcMs(row.time),
    }));

  return sortByUtcDesc(
    dedupeByRecordKey(normalized, (row) =>
      buildRecordKey("quake", row.id, row.time, row.lat, row.lon)
    ),
    (row) => row.time,
    (row) => row.id
  );
}

function normalizeSatellites(rows: Satellite[]): Satellite[] {
  const normalized = rows.filter(
    (row) =>
      row &&
      typeof row.noradId === "string" &&
      row.noradId.trim().length > 0 &&
      typeof row.tle1 === "string" &&
      row.tle1.startsWith("1 ") &&
      typeof row.tle2 === "string" &&
      row.tle2.startsWith("2 ")
  );

  return dedupeByRecordKey(normalized, (row) =>
    buildRecordKey("sat", row.noradId, row.name, row.tle1, row.tle2)
  );
}

function updateSourceHealth(source: string, state: SourceHealthState): void {
  const store = useSIGINTStore.getState();
  store.setOpsSourceHealth(source, state);
  if (state.status === "live" || state.status === "cached") {
    store.setFeedHealth(source, "ok");
    if (state.lastSuccessAt) {
      store.markFeedUpdated(source, state.lastSuccessAt);
    }
    return;
  }
  if (state.status === "degraded") {
    store.setFeedHealth(source, "stale");
    return;
  }
  store.setFeedHealth(source, "error");
}

function logTaskSuccess(
  source: string,
  taskKey: string,
  startedAt: number,
  itemCount: number,
  cacheHit: boolean,
  status: "live" | "cached" | "degraded" | "unavailable",
  retryCount: number
): void {
  logIngestEvent({
    source,
    taskKey,
    phase: status === "unavailable" ? "error" : "success",
    durationMs: Date.now() - startedAt,
    itemCount,
    cacheHit,
    status,
    retryCount,
    errorCode: status === "unavailable" ? "unavailable" : null,
  });
}

export function useDashboardFeeds() {
  const refreshTick = useSIGINTStore((s) => s.liveData.refreshTick);

  useEffect(() => {
    const applyStatus = (source: string, health: "loading" | "ok" | "stale" | "error") => {
      useSIGINTStore.getState().setFeedHealth(source, health);
    };

    const pollFlights = async (signal: AbortSignal, attempt: number) => {
      const startedAt = Date.now();
      applyStatus("opensky", "loading");
      applyStatus("military", "loading");
      logIngestEvent({
        source: "flight",
        taskKey: "ops:dashboard-flights",
        phase: "start",
        retryCount: attempt,
      });
      try {
        // Wave 1: opensky + military dedicated endpoints in parallel (fast ~2-3s)
        const [openskyRes, milP1Res] = await Promise.allSettled([
          fetchJsonWithPolicy<Flight[]>("/api/opensky", {
            key: "feed:opensky",
            signal,
            timeoutMs: 15_000,
            retries: 1,
            negativeTtlMs: 1_500,
          }),
          fetchJsonWithPolicy<Flight[]>("/api/military?phase=1", {
            key: "feed:military-p1",
            signal,
            timeoutMs: 15_000,
            retries: 1,
            negativeTtlMs: 1_500,
          }),
        ]);
        const s = useSIGINTStore.getState();

        if (openskyRes.status === "fulfilled") {
          const opensky = normalizeFlights(openskyRes.value ?? [], false);
          s.setLiveFlights(opensky);
          s.markFeedUpdated("opensky");
          s.setFeedHealth("opensky", "ok");
          s.setOpsSourceHealth("opensky", {
            status: "live",
            lastSuccessAt: Date.now(),
            errorCode: null,
            nextRetryAt: null,
          });
        } else {
          s.setFeedHealth("opensky", s.liveData.flights.length ? "stale" : "error");
          s.setOpsSourceHealth("opensky", {
            status: s.liveData.flights.length ? "degraded" : "unavailable",
            lastSuccessAt: s.liveData.lastUpdated.opensky,
            errorCode: "opensky_fetch_failed",
            nextRetryAt: Date.now() + 30_000,
          });
        }

        // Show Phase 1 military signals immediately on globe
        // Merge into existing store data so Phase 2 entries from previous cycle aren't clobbered
        let phase1Military: Flight[] = [];
        if (milP1Res.status === "fulfilled") {
          phase1Military = normalizeFlights(milP1Res.value ?? [], true);
          const existingMil = (s.liveData.military as Flight[]) ?? [];
          const p1IcaoSet = new Set(phase1Military.map((f) => f.icao));
          const keptFromPrev = existingMil.filter((f) => !p1IcaoSet.has(f.icao));
          s.setLiveMilitary([...phase1Military, ...keptFromPrev]);
          s.markFeedUpdated("military");
          s.setFeedHealth("military", "ok");
          s.setOpsSourceHealth("military", {
            status: "live",
            lastSuccessAt: Date.now(),
            errorCode: null,
            nextRetryAt: null,
          });
        } else {
          s.setFeedHealth("military", s.liveData.military.length ? "stale" : "error");
          s.setOpsSourceHealth("military", {
            status: s.liveData.military.length ? "degraded" : "unavailable",
            lastSuccessAt: s.liveData.lastUpdated.military,
            errorCode: "military_fetch_failed",
            nextRetryAt: Date.now() + 30_000,
          });
        }

        // Wave 2: Type + squawk queries (slower ~5-8s) — merge with Phase 1 results
        let mergedAfterP2 = phase1Military;
        try {
          const milP2Res = await fetchJsonWithPolicy<Flight[]>("/api/military?phase=2", {
            key: "feed:military-p2",
            signal,
            timeoutMs: 35_000,
            retries: 1,
            negativeTtlMs: 1_500,
          });
          if (milP2Res) {
            const phase2 = normalizeFlights(milP2Res ?? [], true);
            if (phase2.length > 0) {
              const currentMilP2 = useSIGINTStore.getState().liveData.military as Flight[];
              mergedAfterP2 = dedupeByIcaoKeepBest([...currentMilP2, ...phase2]);
              useSIGINTStore.getState().setLiveMilitary(mergedAfterP2);
              console.log(`[feeds] military phase2: +${phase2.length} type signals → ${mergedAfterP2.length} total`);
            }
          }
        } catch {
          // Phase 2 failure is non-critical — Phase 1 results already showing
        }

        // Wave 3: Regional geographic scanning (slowest ~10-20s) — merge with P1+P2
        try {
          const milP3Res = await fetchJsonWithPolicy<Flight[]>("/api/military?phase=3", {
            key: "feed:military-p3",
            signal,
            timeoutMs: 45_000,
            retries: 1,
            negativeTtlMs: 1_500,
          });
          if (milP3Res) {
            const phase3 = normalizeFlights(milP3Res ?? [], true);
            if (phase3.length > 0) {
              const currentMil = useSIGINTStore.getState().liveData.military as Flight[];
              const merged = dedupeByIcaoKeepBest([...currentMil, ...phase3]);
              useSIGINTStore.getState().setLiveMilitary(merged);
              console.log(`[feeds] military phase3: +${phase3.length} regional signals → ${merged.length} total`);
            }
          }
        } catch {
          // Phase 3 failure is non-critical — Phases 1+2 already showing
        }

        const totalTracks = s.liveData.flights.length + s.liveData.military.length;
        s.pushFeedLog({
          source: "FLIGHT",
          level: "info",
          message: `Updated ${totalTracks} tracks`,
        });
        logTaskSuccess("flight", "ops:dashboard-flights", startedAt, totalTracks, false, "live", attempt);
      } catch (error) {
        if (isAbortError(error)) return;
        const s = useSIGINTStore.getState();
        s.setFeedHealth("opensky", s.liveData.flights.length ? "stale" : "error");
        s.setFeedHealth("military", s.liveData.military.length ? "stale" : "error");
        s.pushFeedLog({
          source: "FLIGHT",
          level: "error",
          message: error instanceof Error ? error.message : "Flight feed failed",
        });
        logIngestEvent({
          source: "flight",
          taskKey: "ops:dashboard-flights",
          phase: "error",
          durationMs: Date.now() - startedAt,
          retryCount: attempt,
          errorCode: error instanceof Error ? error.message : "flight_feed_failed",
        });
      }
    };

    const pollEarthquakes = async (signal: AbortSignal, attempt: number) => {
      const startedAt = Date.now();
      applyStatus("earthquakes", "loading");
      logIngestEvent({
        source: "earthquakes",
        taskKey: "ops:dashboard-earthquakes",
        phase: "start",
        retryCount: attempt,
      });
      try {
        const earthquakes = await fetchJsonWithPolicy<Earthquake[]>("/api/earthquakes", {
          key: "feed:earthquakes",
          signal,
          timeoutMs: 12_000,
          retries: 2,
          backoffBaseMs: 450,
          negativeTtlMs: 1_500,
        });
        const s = useSIGINTStore.getState();
        const normalized = normalizeEarthquakes(earthquakes ?? []);
        s.setLiveEarthquakes(normalized);
        s.markFeedUpdated("earthquakes");
        s.setFeedHealth("earthquakes", "ok");
        s.setOpsSourceHealth("earthquakes", {
          status: "live",
          lastSuccessAt: Date.now(),
          errorCode: null,
          nextRetryAt: null,
        });
        logTaskSuccess(
          "earthquakes",
          "ops:dashboard-earthquakes",
          startedAt,
          normalized.length,
          false,
          "live",
          attempt
        );
      } catch (error) {
        if (isAbortError(error)) return;
        const s = useSIGINTStore.getState();
        s.setFeedHealth("earthquakes", s.liveData.earthquakes.length ? "stale" : "error");
        s.setOpsSourceHealth("earthquakes", {
          status: s.liveData.earthquakes.length ? "degraded" : "unavailable",
          lastSuccessAt: s.liveData.lastUpdated.earthquakes,
          errorCode: error instanceof Error ? error.message : "earthquakes_fetch_failed",
          nextRetryAt: Date.now() + 60_000,
        });
        s.pushFeedLog({
          source: "SEISMIC",
          level: "error",
          message: error instanceof Error ? error.message : "Seismic feed failed",
        });
        logIngestEvent({
          source: "earthquakes",
          taskKey: "ops:dashboard-earthquakes",
          phase: "error",
          durationMs: Date.now() - startedAt,
          retryCount: attempt,
          errorCode: error instanceof Error ? error.message : "earthquakes_feed_failed",
        });
      }
    };

    const pollSatellites = async (signal: AbortSignal, attempt: number) => {
      const startedAt = Date.now();
      applyStatus("satellites", "loading");
      logIngestEvent({
        source: "satellites",
        taskKey: "ops:dashboard-satellites",
        phase: "start",
        retryCount: attempt,
      });
      try {
        const satellites = await fetchJsonWithPolicy<Satellite[]>("/api/satellites", {
          key: "feed:satellites",
          signal,
          timeoutMs: 20_000,
          retries: 1,
          backoffBaseMs: 750,
          negativeTtlMs: 2_500,
        });
        const s = useSIGINTStore.getState();
        const normalized = normalizeSatellites(satellites ?? []);
        s.setSatelliteCatalog(normalized);
        s.markFeedUpdated("satellites");
        s.setFeedHealth("satellites", "ok");
        s.setOpsSourceHealth("satellites", {
          status: "live",
          lastSuccessAt: Date.now(),
          errorCode: null,
          nextRetryAt: null,
        });
        logTaskSuccess(
          "satellites",
          "ops:dashboard-satellites",
          startedAt,
          normalized.length,
          false,
          "live",
          attempt
        );
      } catch (error) {
        if (isAbortError(error)) return;
        const s = useSIGINTStore.getState();
        s.setFeedHealth("satellites", s.liveData.satelliteCatalog.length ? "stale" : "error");
        s.setOpsSourceHealth("satellites", {
          status: s.liveData.satelliteCatalog.length ? "degraded" : "unavailable",
          lastSuccessAt: s.liveData.lastUpdated.satellites,
          errorCode: error instanceof Error ? error.message : "satellite_fetch_failed",
          nextRetryAt: Date.now() + 5 * 60_000,
        });
        s.pushFeedLog({
          source: "SAT",
          level: "error",
          message: error instanceof Error ? error.message : "Satellite feed failed",
        });
        logIngestEvent({
          source: "satellites",
          taskKey: "ops:dashboard-satellites",
          phase: "error",
          durationMs: Date.now() - startedAt,
          retryCount: attempt,
          errorCode: error instanceof Error ? error.message : "satellites_feed_failed",
        });
      }
    };

    const pollStaticSources = async (signal: AbortSignal, attempt: number) => {
      const startedAt = Date.now();
      applyStatus("cctv", "loading");
      applyStatus("scenes", "loading");
      logIngestEvent({
        source: "static",
        taskKey: "ops:dashboard-static",
        phase: "start",
        retryCount: attempt,
      });
      try {
        const [cctv, scenes] = await Promise.all([
          fetchAllCctvCameras(),
          fetchJsonWithPolicy<Scene[]>("/data/scenes.json", {
            key: "feed:scenes",
            signal,
            timeoutMs: 8_000,
            retries: 1,
            negativeTtlMs: 5_000,
          }),
        ]);
        const s = useSIGINTStore.getState();
        s.setLiveCctv(cctv ?? []);
        s.setLiveScenes(scenes ?? []);
        s.markFeedUpdated("cctv");
        s.markFeedUpdated("scenes");
        s.setFeedHealth("cctv", "ok");
        s.setFeedHealth("scenes", "ok");
        s.setOpsSourceHealth("cctv", {
          status: "live",
          lastSuccessAt: Date.now(),
          errorCode: null,
          nextRetryAt: null,
        });
        s.setOpsSourceHealth("scenes", {
          status: "live",
          lastSuccessAt: Date.now(),
          errorCode: null,
          nextRetryAt: null,
        });
        logTaskSuccess(
          "static",
          "ops:dashboard-static",
          startedAt,
          (cctv?.length ?? 0) + (scenes?.length ?? 0),
          false,
          "live",
          attempt
        );
      } catch (error) {
        if (isAbortError(error)) return;
        const s = useSIGINTStore.getState();
        s.setFeedHealth("cctv", s.liveData.cctv.length ? "stale" : "error");
        s.setFeedHealth("scenes", s.liveData.scenes.length ? "stale" : "error");
        s.setOpsSourceHealth("cctv", {
          status: s.liveData.cctv.length ? "degraded" : "unavailable",
          lastSuccessAt: s.liveData.lastUpdated.cctv,
          errorCode: error instanceof Error ? error.message : "static_fetch_failed",
          nextRetryAt: Date.now() + 5 * 60_000,
        });
        s.setOpsSourceHealth("scenes", {
          status: s.liveData.scenes.length ? "degraded" : "unavailable",
          lastSuccessAt: s.liveData.lastUpdated.scenes,
          errorCode: error instanceof Error ? error.message : "static_fetch_failed",
          nextRetryAt: Date.now() + 5 * 60_000,
        });
        s.pushFeedLog({
          source: "STATIC",
          level: "warn",
          message: error instanceof Error ? error.message : "Static sources failed",
        });
        logIngestEvent({
          source: "static",
          taskKey: "ops:dashboard-static",
          phase: "error",
          durationMs: Date.now() - startedAt,
          retryCount: attempt,
          errorCode: error instanceof Error ? error.message : "static_sources_failed",
        });
      }
    };

    const pollGdacs = async (signal: AbortSignal, attempt: number) => {
      const startedAt = Date.now();
      applyStatus("gdacs", "loading");
      logIngestEvent({
        source: "gdacs",
        taskKey: "ops:dashboard-gdacs",
        phase: "start",
        retryCount: attempt,
      });

      const cached = await readPersistentFeedCache<DisasterAlert[]>(GDACS_CACHE_KEY);
      const now = Date.now();
      if (cached.entry && cached.entry.expiresAt > now) {
        const s = useSIGINTStore.getState();
        if (s.liveData.disasters.length === 0) {
          s.setLiveDisasters(cached.entry.payload);
          updateSourceHealth("gdacs", {
            status: "cached",
            lastSuccessAt: cached.entry.savedAt,
            errorCode: null,
            nextRetryAt: null,
          });
        }
      }

      try {
        const payload = await fetchJsonWithPolicy<GdacsRouteResponse>("/api/gdacs", {
          key: "feed:gdacs",
          signal,
          timeoutMs: 20_000,
          retries: 1,
          backoffBaseMs: 600,
          negativeTtlMs: 3_000,
        });

        const s = useSIGINTStore.getState();
        const nextItems = adaptGdacsResponse(payload, s.liveData.disasters);
        s.setLiveDisasters(nextItems);

        const ts = payload.fetchedAt || Date.now();
        updateSourceHealth("gdacs", {
          status: payload.status,
          lastSuccessAt: payload.status === "unavailable" ? s.liveData.lastUpdated.gdacs : ts,
          errorCode: payload.errorCode,
          nextRetryAt: payload.status === "unavailable" ? Date.now() + 6 * 60_000 : null,
        });
        if (payload.status !== "unavailable") {
          s.markFeedUpdated("gdacs", ts);
        }

        await writePersistentFeedCache({
          cacheKey: GDACS_CACHE_KEY,
          savedAt: ts,
          expiresAt: ts + GDACS_FRESH_TTL_MS,
          staleUntil: ts + GDACS_STALE_TTL_MS,
          payload: nextItems,
          etag: payload.etag,
          lastModified: payload.lastModified,
          itemCount: nextItems.length,
        });

        s.pushFeedLog({
          source: "GDACS",
          level: payload.status === "degraded" ? "warn" : "info",
          message: `Disaster alerts ${nextItems.length} (${payload.status})`,
        });
        logTaskSuccess(
          "gdacs",
          "ops:dashboard-gdacs",
          startedAt,
          nextItems.length,
          payload.status === "cached",
          payload.status,
          attempt
        );
      } catch (error) {
        if (isAbortError(error)) return;
        const s = useSIGINTStore.getState();
        const stale = cached.entry && cached.entry.staleUntil > Date.now() ? cached.entry : null;

        if (stale) {
          s.setLiveDisasters(stale.payload);
          updateSourceHealth("gdacs", {
            status: "degraded",
            lastSuccessAt: stale.savedAt,
            errorCode: error instanceof Error ? error.message : "gdacs_fetch_failed",
            nextRetryAt: Date.now() + 6 * 60_000,
          });
          s.pushFeedLog({
            source: "GDACS",
            level: "warn",
            message: "Using stale GDACS cache due to upstream failure",
          });
          logTaskSuccess(
            "gdacs",
            "ops:dashboard-gdacs",
            startedAt,
            stale.payload.length,
            true,
            "degraded",
            attempt
          );
          return;
        }

        updateSourceHealth("gdacs", {
          status: "unavailable",
          lastSuccessAt: s.liveData.lastUpdated.gdacs,
          errorCode: error instanceof Error ? error.message : "gdacs_fetch_failed",
          nextRetryAt: Date.now() + 6 * 60_000,
        });
        logIngestEvent({
          source: "gdacs",
          taskKey: "ops:dashboard-gdacs",
          phase: "error",
          durationMs: Date.now() - startedAt,
          retryCount: attempt,
          errorCode: error instanceof Error ? error.message : "gdacs_feed_failed",
        });
      }
    };

    const pollSpaceWeather = async (signal: AbortSignal, attempt: number) => {
      const startedAt = Date.now();
      applyStatus("spaceWeather", "loading");
      logIngestEvent({
        source: "spaceWeather",
        taskKey: "ops:dashboard-space-weather",
        phase: "start",
        retryCount: attempt,
      });

      const cached = await readPersistentFeedCache<SpaceWeatherAlert[]>(SWPC_CACHE_KEY);
      const now = Date.now();
      if (cached.entry && cached.entry.expiresAt > now) {
        const s = useSIGINTStore.getState();
        if (s.liveData.spaceWeather.length === 0) {
          s.setLiveSpaceWeather(cached.entry.payload);
          updateSourceHealth("spaceWeather", {
            status: "cached",
            lastSuccessAt: cached.entry.savedAt,
            errorCode: null,
            nextRetryAt: null,
          });
        }
      }

      try {
        const payload = await fetchJsonWithPolicy<SpaceWeatherRouteResponse>("/api/space-weather", {
          key: "feed:space-weather",
          signal,
          timeoutMs: 20_000,
          retries: 1,
          backoffBaseMs: 500,
          negativeTtlMs: 2_000,
        });
        const s = useSIGINTStore.getState();
        const nextItems = adaptSpaceWeatherResponse(payload, s.liveData.spaceWeather);
        s.setLiveSpaceWeather(nextItems);

        const ts = payload.fetchedAt || Date.now();
        updateSourceHealth("spaceWeather", {
          status: payload.status,
          lastSuccessAt:
            payload.status === "unavailable" ? s.liveData.lastUpdated.spaceWeather : ts,
          errorCode: payload.errorCode,
          nextRetryAt: payload.status === "unavailable" ? Date.now() + 2 * 60_000 : null,
        });
        if (payload.status !== "unavailable") {
          s.markFeedUpdated("spaceWeather", ts);
        }

        await writePersistentFeedCache({
          cacheKey: SWPC_CACHE_KEY,
          savedAt: ts,
          expiresAt: ts + SWPC_FRESH_TTL_MS,
          staleUntil: ts + SWPC_STALE_TTL_MS,
          payload: nextItems,
          etag: payload.etag,
          lastModified: payload.lastModified,
          itemCount: nextItems.length,
        });

        s.pushFeedLog({
          source: "SWPC",
          level: payload.status === "degraded" ? "warn" : "info",
          message: `Space weather alerts ${nextItems.length} (${payload.status})`,
        });
        logTaskSuccess(
          "spaceWeather",
          "ops:dashboard-space-weather",
          startedAt,
          nextItems.length,
          payload.status === "cached",
          payload.status,
          attempt
        );
      } catch (error) {
        if (isAbortError(error)) return;
        const s = useSIGINTStore.getState();
        const stale = cached.entry && cached.entry.staleUntil > Date.now() ? cached.entry : null;

        if (stale) {
          s.setLiveSpaceWeather(stale.payload);
          updateSourceHealth("spaceWeather", {
            status: "degraded",
            lastSuccessAt: stale.savedAt,
            errorCode: error instanceof Error ? error.message : "space_weather_fetch_failed",
            nextRetryAt: Date.now() + 2 * 60_000,
          });
          s.pushFeedLog({
            source: "SWPC",
            level: "warn",
            message: "Using stale SWPC cache due to upstream failure",
          });
          logTaskSuccess(
            "spaceWeather",
            "ops:dashboard-space-weather",
            startedAt,
            stale.payload.length,
            true,
            "degraded",
            attempt
          );
          return;
        }

        updateSourceHealth("spaceWeather", {
          status: "unavailable",
          lastSuccessAt: s.liveData.lastUpdated.spaceWeather,
          errorCode: error instanceof Error ? error.message : "space_weather_fetch_failed",
          nextRetryAt: Date.now() + 2 * 60_000,
        });
        logIngestEvent({
          source: "spaceWeather",
          taskKey: "ops:dashboard-space-weather",
          phase: "error",
          durationMs: Date.now() - startedAt,
          retryCount: attempt,
          errorCode: error instanceof Error ? error.message : "space_weather_feed_failed",
        });
      }
    };

    // Defer OPS feed registration by 10s to let news/RSS fetch first.
    // On Windows, concurrent HTTPS connections at startup saturate TCP
    // and cause mass timeouts. Staggering gives news feeds TCP priority.
    const OPS_STARTUP_DELAY_MS = 10_000;
    let unregister: Array<() => void> = [];
    const delayTimer = setTimeout(() => {
    unregister = [
      globalRefreshRuntime.register({
        pool: "ops",
        task: {
          key: "ops:dashboard-flights",
          intervalMs: 12_000,
          jitterPct: 0.12,
          hiddenIntervalMultiplier: 2.4,
          timeoutMs: 60_000,
          run: async ({ signal, attempt }) => pollFlights(signal, attempt),
        },
      }),
      globalRefreshRuntime.register({
        pool: "ops",
        task: {
          key: "ops:dashboard-earthquakes",
          intervalMs: 60_000,
          jitterPct: 0.15,
          hiddenIntervalMultiplier: 2.8,
          timeoutMs: 18_000,
          run: async ({ signal, attempt }) => pollEarthquakes(signal, attempt),
        },
      }),
      globalRefreshRuntime.register({
        pool: "ops",
        task: {
          key: "ops:dashboard-satellites",
          intervalMs: 5 * 60_000,
          jitterPct: 0.1,
          hiddenIntervalMultiplier: 3.2,
          timeoutMs: 25_000,
          run: async ({ signal, attempt }) => pollSatellites(signal, attempt),
        },
      }),
      globalRefreshRuntime.register({
        pool: "ops",
        task: {
          key: "ops:dashboard-static",
          intervalMs: 5 * 60_000,
          jitterPct: 0.08,
          hiddenIntervalMultiplier: 4,
          timeoutMs: 20_000,
          run: async ({ signal, attempt }) => pollStaticSources(signal, attempt),
        },
      }),
      globalRefreshRuntime.register({
        pool: "ops",
        task: {
          key: "ops:dashboard-gdacs",
          intervalMs: 6 * 60_000,
          jitterPct: 0.1,
          hiddenIntervalMultiplier: 2.5,
          timeoutMs: 25_000,
          run: async ({ signal, attempt }) => pollGdacs(signal, attempt),
        },
      }),
      globalRefreshRuntime.register({
        pool: "ops",
        task: {
          key: "ops:dashboard-space-weather",
          intervalMs: 2 * 60_000,
          jitterPct: 0.1,
          hiddenIntervalMultiplier: 2.5,
          timeoutMs: 25_000,
          run: async ({ signal, attempt }) => pollSpaceWeather(signal, attempt),
        },
      }),
      globalRefreshRuntime.register({
        pool: "ops",
        task: {
          key: "ops:dashboard-trend",
          intervalMs: 15_000,
          runOnStart: false,
          jitterPct: 0.03,
          hiddenIntervalMultiplier: 1.2,
          timeoutMs: 5_000,
          run: () => {
            useSIGINTStore.getState().appendTrendSnapshot();
          },
        },
      }),
    ];

    const store = useSIGINTStore.getState();
    if (store.liveData.feedLog.length === 0) {
      store.pushFeedLog({
        source: "SYSTEM",
        level: "info",
        message: "Dashboard feed subsystem online",
      });
    }
    }, OPS_STARTUP_DELAY_MS);

    return () => {
      clearTimeout(delayTimer);
      unregister.forEach((dispose) => dispose());
    };
  }, []);

  useEffect(() => {
    if (!refreshTick) return;
    const keys = [
      "ops:dashboard-flights",
      "ops:dashboard-earthquakes",
      "ops:dashboard-satellites",
      "ops:dashboard-static",
      "ops:dashboard-gdacs",
      "ops:dashboard-space-weather",
    ];
    keys.forEach((key) => globalRefreshRuntime.trigger(key));
  }, [refreshTick]);
}
