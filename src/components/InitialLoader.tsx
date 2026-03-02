"use client";

import { useEffect } from "react";
import { preloadCesium } from "../lib/cesium/viewer";
import { preloadLeaflet } from "../lib/maps/preload";

export default function InitialLoader() {
  useEffect(() => {
    let cancelled = false;

    const runPreload = async () => {
      try {
        await Promise.allSettled([
          preloadCesium(),
          preloadLeaflet(),
          (async () => {
            try {
              await Promise.allSettled([
                fetch("/data/scenes.json", { cache: "force-cache" }),
                fetch("/data/ne_110m_admin_0_countries.geojson", { cache: "force-cache" }),
              ]);
            } catch {
              // Static asset warmup is best-effort only.
            }
          })(),
        ]);
      } catch {
        // Best-effort preload only; failures are handled by map components.
      }
      if (cancelled) {
        return;
      }
    };

    void runPreload();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0b131b",
        color: "#d7e2ee",
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace',
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: 3 }}>
        WORLDVIEW CONSOLE
      </div>
      <div style={{ opacity: 0.6, fontSize: 11, letterSpacing: 1 }}>
        INITIALIZING DASHBOARD...
      </div>
    </div>
  );
}

