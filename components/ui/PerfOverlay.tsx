"use client";

import { useEffect, useState } from "react";

declare global {
  interface Window {
    __worldviewPerf?: { sats: number; flights: number; military: number; quakes: number; roads: number };
  }
}

const fallback = { sats: 0, flights: 0, military: 0, quakes: 0, roads: 0 };

export function PerfOverlay() {
  const [perf, setPerf] = useState(fallback);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const queryShow = new URLSearchParams(window.location.search).get("debug") === "1";
    setShow(queryShow);

    const t = setInterval(() => {
      setPerf(window.__worldviewPerf ?? fallback);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  if (!show) return null;

  return (
    <div className="absolute bottom-4 right-4 z-30 rounded border border-cyan-800/70 bg-slate-950/85 p-2 text-[10px] text-cyan-200">
      <div>Perf (debug=1)</div>
      <div>Sats: {perf.sats}</div>
      <div>Flights: {perf.flights}</div>
      <div>Military: {perf.military}</div>
      <div>Quakes: {perf.quakes}</div>
      <div>Roads: {perf.roads}</div>
    </div>
  );
}
