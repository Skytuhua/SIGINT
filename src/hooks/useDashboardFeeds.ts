"use client";

import { useEffect } from "react";
import { useWorldViewStore } from "../store";
import type { Earthquake, Flight, Satellite, Scene } from "../lib/providers/types";
import { fetchAllCctvCameras } from "../lib/cctv/sources";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`${url} returned ${res.status}`);
  }
  return (await res.json()) as T;
}

export function useDashboardFeeds() {
  const refreshTick = useWorldViewStore((s) => s.liveData.refreshTick);

  useEffect(() => {
    let cancelled = false;

    const store = useWorldViewStore.getState();

    const applyStatus = (source: string, health: "loading" | "ok" | "stale" | "error") => {
      useWorldViewStore.getState().setFeedHealth(source, health);
    };

    const pollFlights = async () => {
      applyStatus("opensky", "loading");
      applyStatus("military", "loading");
      try {
        const [opensky, military] = await Promise.all([
          fetchJson<Flight[]>("/api/opensky"),
          fetchJson<Flight[]>("/api/military"),
        ]);
        if (cancelled) return;
        const s = useWorldViewStore.getState();
        s.setLiveFlights(opensky ?? []);
        s.setLiveMilitary(military ?? []);
        s.markFeedUpdated("opensky");
        s.markFeedUpdated("military");
        s.setFeedHealth("opensky", "ok");
        s.setFeedHealth("military", "ok");
        s.pushFeedLog({
          source: "FLIGHT",
          level: "info",
          message: `Updated ${(opensky?.length ?? 0) + (military?.length ?? 0)} tracks`,
        });
      } catch (error) {
        if (cancelled) return;
        const s = useWorldViewStore.getState();
        s.setFeedHealth("opensky", "error");
        s.setFeedHealth("military", "error");
        s.pushFeedLog({
          source: "FLIGHT",
          level: "error",
          message: error instanceof Error ? error.message : "Flight feed failed",
        });
      }
    };

    const pollEarthquakes = async () => {
      applyStatus("earthquakes", "loading");
      try {
        const earthquakes = await fetchJson<Earthquake[]>("/api/earthquakes");
        if (cancelled) return;
        const s = useWorldViewStore.getState();
        s.setLiveEarthquakes(earthquakes ?? []);
        s.markFeedUpdated("earthquakes");
        s.setFeedHealth("earthquakes", "ok");
      } catch (error) {
        if (cancelled) return;
        const s = useWorldViewStore.getState();
        s.setFeedHealth("earthquakes", "error");
        s.pushFeedLog({
          source: "SEISMIC",
          level: "error",
          message: error instanceof Error ? error.message : "Seismic feed failed",
        });
      }
    };

    const pollSatellites = async () => {
      applyStatus("satellites", "loading");
      try {
        const satellites = await fetchJson<Satellite[]>("/api/satellites");
        if (cancelled) return;
        const s = useWorldViewStore.getState();
        s.setSatelliteCatalog(satellites ?? []);
        s.markFeedUpdated("satellites");
        s.setFeedHealth("satellites", "ok");
      } catch (error) {
        if (cancelled) return;
        const s = useWorldViewStore.getState();
        s.setFeedHealth("satellites", "error");
        s.pushFeedLog({
          source: "SAT",
          level: "error",
          message: error instanceof Error ? error.message : "Satellite feed failed",
        });
      }
    };

    const pollStaticSources = async () => {
      applyStatus("cctv", "loading");
      applyStatus("scenes", "loading");
      try {
        const [cctv, scenes] = await Promise.all([
          fetchAllCctvCameras(),
          fetchJson<Scene[]>("/data/scenes.json"),
        ]);
        if (cancelled) return;
        const s = useWorldViewStore.getState();
        s.setLiveCctv(cctv ?? []);
        s.setLiveScenes(scenes ?? []);
        s.markFeedUpdated("cctv");
        s.markFeedUpdated("scenes");
        s.setFeedHealth("cctv", "ok");
        s.setFeedHealth("scenes", "ok");
      } catch (error) {
        if (cancelled) return;
        const s = useWorldViewStore.getState();
        s.setFeedHealth("cctv", "error");
        s.setFeedHealth("scenes", "error");
        s.pushFeedLog({
          source: "STATIC",
          level: "warn",
          message: error instanceof Error ? error.message : "Static sources failed",
        });
      }
    };

    const runAll = async () => {
      await Promise.all([pollFlights(), pollEarthquakes(), pollSatellites(), pollStaticSources()]);
      if (!cancelled) {
        useWorldViewStore.getState().appendTrendSnapshot();
      }
    };

    void runAll();

    const idFlights = setInterval(pollFlights, 12_000);
    const idQuakes = setInterval(pollEarthquakes, 60_000);
    const idSats = setInterval(pollSatellites, 5 * 60_000);
    const idStatic = setInterval(pollStaticSources, 5 * 60_000);
    const idTrend = setInterval(
      () => useWorldViewStore.getState().appendTrendSnapshot(),
      15_000
    );

    if (store.liveData.feedLog.length === 0) {
      useWorldViewStore.getState().pushFeedLog({
        source: "SYSTEM",
        level: "info",
        message: "Dashboard feed subsystem online",
      });
    }

    return () => {
      cancelled = true;
      clearInterval(idFlights);
      clearInterval(idQuakes);
      clearInterval(idSats);
      clearInterval(idStatic);
      clearInterval(idTrend);
    };
  }, [refreshTick]);
}

