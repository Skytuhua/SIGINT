"use client";

import { useEffect, useRef } from "react";
import scenes from "@/data/scenes.json";
import { useWorldViewStore } from "@/lib/state/store";

declare global {
  interface Window {
    Cesium: any;
    __worldviewPerf?: { sats: number; flights: number; military: number; quakes: number; roads: number };
  }
}

const POLL_INTERVALS = {
  satellites: 15000,
  flights: 10000,
  military: 10000,
  earthquakes: 60000,
};

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function WorldViewGlobe() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<any>(null);
  const dataSourcesRef = useRef<Record<string, any>>({});
  const styleStageRef = useRef<any>(null);

  const { stylePreset, layers, detectMode, selectedEntityId, setSelectedEntityId, currentLandmarkIndex } = useWorldViewStore();
  const layersRef = useRef(layers);
  const detectModeRef = useRef(detectMode);

  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  useEffect(() => {
    detectModeRef.current = detectMode;
  }, [detectMode]);

  useEffect(() => {
    let mounted = true;
    let onTickCleanup: (() => void) | null = null;
    const intervals: NodeJS.Timeout[] = [];

    const boot = async () => {
      for (let i = 0; i < 50; i += 1) {
        if (window.Cesium) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      if (!window.Cesium || !containerRef.current || !mounted) return;

      const Cesium = window.Cesium;
      Cesium.Ion.defaultAccessToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN ?? "";

      const viewer = new Cesium.Viewer(containerRef.current, {
        timeline: false,
        animation: false,
        geocoder: false,
        sceneModePicker: false,
        baseLayerPicker: false,
        shouldAnimate: true,
        infoBox: false,
        selectionIndicator: true,
      });
      viewerRef.current = viewer;

      const satDS = new Cesium.CustomDataSource("satellites");
      const flightDS = new Cesium.CustomDataSource("flights");
      const militaryDS = new Cesium.CustomDataSource("military");
      const quakeDS = new Cesium.CustomDataSource("earthquakes");
      const trafficDS = new Cesium.CustomDataSource("traffic");

      dataSourcesRef.current = { satDS, flightDS, militaryDS, quakeDS, trafficDS };
      viewer.dataSources.add(satDS);
      viewer.dataSources.add(flightDS);
      viewer.dataSources.add(militaryDS);
      viewer.dataSources.add(quakeDS);
      viewer.dataSources.add(trafficDS);

      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((event: any) => {
        const picked = viewer.scene.pick(event.position);
        if (Cesium.defined(picked) && picked.id) {
          setSelectedEntityId(picked.id.id || null);
          viewer.selectedEntity = picked.id;
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

      const perf = { sats: 0, flights: 0, military: 0, quakes: 0, roads: 0 };

      const refreshSatellites = async () => {
        if (!layersRef.current.satellites) return;
        const payload = await fetchJson<{ tle: string }>("/api/satellites");
        if (!payload?.tle) return;
        const lines = payload.tle.split("\n").map((l) => l.trim()).filter(Boolean);
        satDS.entities.removeAll();
        for (let i = 0; i + 2 < lines.length && i < 120; i += 3) {
          const name = lines[i];
          const l1 = lines[i + 1];
          const l2 = lines[i + 2];
          const noradId = l1.substring(2, 7).trim();
          const lon = ((Number.parseInt(l2.substring(17, 25).replace(" ", ""), 10) || 0) % 360) - 180;
          const lat = Math.max(-70, Math.min(70, ((Number.parseInt(l2.substring(8, 16).replace(" ", ""), 10) || 0) % 140) - 70));
          const altKm = 450 + (Number.parseInt(l2.substring(52, 60).replace(" ", ""), 10) || 0) % 400;
          satDS.entities.add({
            id: `sat-${noradId}`,
            position: Cesium.Cartesian3.fromDegrees(lon, lat, altKm * 1000),
            point: { pixelSize: 5, color: Cesium.Color.CYAN },
            label: detectModeRef.current === "full" ? { text: `${name} (${noradId})`, font: "11px monospace", fillColor: Cesium.Color.CYAN, pixelOffset: new Cesium.Cartesian2(8, -12) } : undefined,
            description: `${name} NORAD ${noradId}`,
          });
          perf.sats += 1;
        }
        window.__worldviewPerf = { ...(window.__worldviewPerf ?? perf), sats: perf.sats };
      };

      const refreshFlights = async () => {
        flightDS.entities.removeAll();
        if (!layersRef.current.flights) return;
        const flights = await fetchJson<Array<{ icao24: string; callsign: string | null; lat: number; lon: number; altitudeM: number | null; headingDeg: number | null }>>("/api/opensky");
        if (!flights) return;
        for (const fl of flights.slice(0, 400)) {
          flightDS.entities.add({
            id: `flt-${fl.icao24}`,
            position: Cesium.Cartesian3.fromDegrees(fl.lon, fl.lat, fl.altitudeM ?? 11000),
            point: { pixelSize: 4, color: Cesium.Color.ORANGE },
            label: detectModeRef.current === "full" ? { text: fl.callsign || fl.icao24, font: "10px monospace", fillColor: Cesium.Color.ORANGE, pixelOffset: new Cesium.Cartesian2(6, -10) } : undefined,
          });
          perf.flights += 1;
        }
        window.__worldviewPerf = { ...(window.__worldviewPerf ?? perf), flights: perf.flights };
      };

      const refreshMilitary = async () => {
        militaryDS.entities.removeAll();
        if (!layersRef.current.military) return;
        const flights = await fetchJson<Array<{ icao24: string; callsign: string | null; lat: number; lon: number; altitudeM: number | null }>>("/api/military");
        if (!flights) return;
        for (const fl of flights) {
          militaryDS.entities.add({
            id: `mil-${fl.icao24}`,
            position: Cesium.Cartesian3.fromDegrees(fl.lon, fl.lat, fl.altitudeM ?? 7000),
            point: { pixelSize: 5, color: Cesium.Color.RED },
            label: detectModeRef.current !== "sparse" ? { text: fl.callsign || fl.icao24, font: "10px monospace", fillColor: Cesium.Color.RED, pixelOffset: new Cesium.Cartesian2(6, -12) } : undefined,
          });
          perf.military += 1;
        }
        window.__worldviewPerf = { ...(window.__worldviewPerf ?? perf), military: perf.military };
      };

      const refreshEarthquakes = async () => {
        quakeDS.entities.removeAll();
        if (!layersRef.current.earthquakes) return;
        const quakes = await fetchJson<Array<{ id: string; magnitude: number; lat: number; lon: number; place: string }>>("/api/earthquakes");
        if (!quakes) return;
        for (const q of quakes.slice(0, 150)) {
          quakeDS.entities.add({
            id: `eq-${q.id}`,
            position: Cesium.Cartesian3.fromDegrees(q.lon, q.lat, 0),
            ellipse: {
              semiMajorAxis: 3000 + q.magnitude * 2500,
              semiMinorAxis: 3000 + q.magnitude * 2500,
              material: Cesium.Color.RED.withAlpha(0.25),
              outline: true,
              outlineColor: Cesium.Color.RED,
            },
            label: detectModeRef.current === "full" ? { text: `M${q.magnitude.toFixed(1)} ${q.place}`, font: "10px monospace", fillColor: Cesium.Color.SALMON } : undefined,
          });
          perf.quakes += 1;
        }
        window.__worldviewPerf = { ...(window.__worldviewPerf ?? perf), quakes: perf.quakes };
      };

      const refreshTraffic = async () => {
        trafficDS.entities.removeAll();
        if (!layersRef.current.traffic) return;
        const overpass = await fetchJson<{ elements?: Array<{ id: number; geometry: Array<{ lon: number; lat: number }> }> }>("/api/overpass");
        const roads = overpass?.elements ?? [];
        for (const road of roads.slice(0, 120)) {
          const coords = road.geometry.flatMap((g) => [g.lon, g.lat, 3]);
          trafficDS.entities.add({
            id: `rd-${road.id}`,
            polyline: {
              positions: Cesium.Cartesian3.fromDegreesArrayHeights(coords),
              width: 1,
              material: Cesium.Color.GOLD.withAlpha(0.5),
            },
          });
          perf.roads += 1;
        }
        window.__worldviewPerf = { ...(window.__worldviewPerf ?? perf), roads: perf.roads };
      };

      await Promise.all([refreshSatellites(), refreshFlights(), refreshMilitary(), refreshEarthquakes(), refreshTraffic()]);
      intervals.push(setInterval(refreshSatellites, POLL_INTERVALS.satellites));
      intervals.push(setInterval(refreshFlights, POLL_INTERVALS.flights));
      intervals.push(setInterval(refreshMilitary, POLL_INTERVALS.military));
      intervals.push(setInterval(refreshEarthquakes, POLL_INTERVALS.earthquakes));
      intervals.push(setInterval(refreshTraffic, 25000));

      onTickCleanup = () => {
        handler.destroy();
      };
    };

    boot();

    return () => {
      mounted = false;
      for (const interval of intervals) clearInterval(interval);
      onTickCleanup?.();
      if (viewerRef.current && !viewerRef.current.isDestroyed()) viewerRef.current.destroy();
      viewerRef.current = null;
    };
  }, [setSelectedEntityId]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    if (!viewer || !Cesium) return;

    if (styleStageRef.current) {
      viewer.scene.postProcessStages.remove(styleStageRef.current);
      styleStageRef.current = null;
    }

    const uniforms = {
      u_amount: stylePreset === "CRT" ? 0.85 : stylePreset === "NVG" ? 0.6 : stylePreset === "FLIR" ? 0.7 : 0.25,
      u_mode: stylePreset === "CRT" ? 1 : stylePreset === "NVG" ? 2 : stylePreset === "FLIR" ? 3 : 0,
    };

    const fragmentShader = `
      uniform sampler2D colorTexture;
      in vec2 v_textureCoordinates;
      uniform float u_amount;
      uniform float u_mode;
      void main() {
        vec2 uv = v_textureCoordinates;
        vec4 col = texture(colorTexture, uv);
        float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));
        if (u_mode > 0.5 && u_mode < 1.5) {
          float scan = sin(uv.y * 900.0) * 0.04;
          col.rgb += vec3(scan);
          col.rgb *= vec3(0.95, 1.0, 1.05);
        } else if (u_mode > 1.5 && u_mode < 2.5) {
          col.rgb = vec3(0.1, 1.0, 0.2) * (lum + 0.15);
        } else if (u_mode > 2.5) {
          vec3 cold = vec3(0.0, 0.1, 0.4);
          vec3 hot = vec3(1.0, 0.8, 0.2);
          col.rgb = mix(cold, hot, smoothstep(0.1, 0.95, lum));
        }
        float vignette = smoothstep(0.8, 0.25, distance(uv, vec2(0.5)));
        col.rgb = mix(col.rgb * vignette, col.rgb, 1.0 - u_amount * 0.35);
        out_FragColor = col;
      }
    `;

    styleStageRef.current = viewer.scene.postProcessStages.add(new Cesium.PostProcessStage({
      name: "worldview-style",
      fragmentShader,
      uniforms,
    }));
  }, [stylePreset]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    if (!viewer || !Cesium) return;
    const landmark = scenes[0]?.landmarks[currentLandmarkIndex];
    if (!landmark) return;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(landmark.lon, landmark.lat, landmark.height),
      duration: 1.3,
    });
  }, [currentLandmarkIndex]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !selectedEntityId) return;
    const entity = viewer.entities.getById(selectedEntityId)
      || dataSourcesRef.current.satDS?.entities?.getById(selectedEntityId)
      || dataSourcesRef.current.flightDS?.entities?.getById(selectedEntityId)
      || dataSourcesRef.current.militaryDS?.entities?.getById(selectedEntityId)
      || dataSourcesRef.current.quakeDS?.entities?.getById(selectedEntityId);
    if (entity) viewer.trackedEntity = entity;
  }, [selectedEntityId]);

  return <div ref={containerRef} className="h-full w-full" data-testid="cesium-canvas" />;
}
