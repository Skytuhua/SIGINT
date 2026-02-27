"use client";
import cctvSources from "@/data/cctv_sources.json";
import scenes from "@/data/scenes.json";
import { useWorldViewStore } from "@/lib/state/store";

export function LeftPanel() {
  const { layers, toggleLayer, currentLandmarkIndex } = useWorldViewStore();
  const currentLandmark = scenes[0]?.landmarks[currentLandmarkIndex]?.name ?? "-";

  return (
    <aside className="w-80 rounded-2xl border border-slate-700/80 bg-slate-950/70 p-4 text-xs backdrop-blur">
      <h1 className="text-2xl tracking-[0.25em] text-cyan-300">WORLDVIEW</h1>
      <p className="mt-2 text-[10px] text-amber-300">TOP SECRET // PUBLIC DATA DEMO // NO PERSONAL TRACKING</p>

      <section className="mt-4">
        <h2 className="mb-2 text-cyan-200">CCTV Mesh</h2>
        <label className="flex items-center justify-between"><span>Enable CCTV</span><input type="checkbox" checked={layers.cctv} onChange={() => toggleLayer("cctv")} /></label>
        <ul className="mt-2 max-h-28 overflow-auto text-[10px] text-slate-300">
          {cctvSources.map((cam) => <li key={cam.id}>{cam.city} — {cam.name}</li>)}
        </ul>
      </section>

      <section className="mt-4">
        <h2 className="mb-2 text-cyan-200">Data Layers</h2>
        {Object.entries(layers).map(([k, v]) => (
          <label key={k} className="flex items-center justify-between py-1 capitalize"><span>{k}</span><input type="checkbox" checked={v} onChange={() => toggleLayer(k as keyof typeof layers)} /></label>
        ))}
      </section>

      <section className="mt-4">
        <h2 className="text-cyan-200">Scenes</h2>
        <p className="text-[10px] text-slate-400">Q/W/E/R/T jump landmarks.</p>
        <p className="mt-1 text-[10px] text-amber-300">Current: {currentLandmark}</p>
      </section>
    </aside>
  );
}
