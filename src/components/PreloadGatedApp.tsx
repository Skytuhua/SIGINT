"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import InitialLoader from "./InitialLoader";
import { startPreload } from "../lib/preload/index";

// Start downloading these bundles immediately when this module is evaluated,
// so they are ready (or nearly ready) by the time the user sees the app.
const WorldViewApp = dynamic(() => import("./WorldViewApp"), {
  ssr: false,
  loading: () => null,
});

// Kick off all preload tasks AND pre-warm heavy sub-bundles at module eval time
// (before any React component mounts), so everything races in parallel.
if (typeof window !== "undefined") {
  startPreload();
  void import("./news/MapLibreNewsMap");
  void import("./news/NewsWorkspace");
}

export default function PreloadGatedApp() {
  const [ready, setReady] = useState(false);

  return (
    <>
      {!ready && <InitialLoader onDone={() => setReady(true)} />}
      {ready && <WorldViewApp />}
    </>
  );
}
