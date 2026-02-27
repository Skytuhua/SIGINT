"use client";
import { useWorldViewStore, type StylePreset } from "@/lib/state/store";

export function RightPanel() {
  const { stylePreset, setStylePreset, detectMode, setDetectMode } = useWorldViewStore();

  return (
    <aside className="w-80 rounded-2xl border border-slate-700/80 bg-slate-950/70 p-4 text-xs backdrop-blur">
      <h2 className="mb-3 text-cyan-200">HUD Controls</h2>
      <div className="space-y-2">
        <label className="flex justify-between"><span>Move</span><span>Orbit</span></label>
        <label className="flex justify-between"><span>Bloom</span><input type="checkbox" defaultChecked /></label>
        <label className="flex justify-between"><span>Sharpen</span><input type="range" min={0} max={2} step={0.1} defaultValue={0.6} /></label>
        <label className="flex justify-between"><span>Layout</span><select className="bg-slate-900"><option>Tactical</option></select></label>

        <label className="flex justify-between">
          <span>Detect</span>
          <select className="bg-slate-900" value={detectMode} onChange={(e) => setDetectMode(e.target.value as "sparse" | "full") }>
            <option value="sparse">Sparse</option>
            <option value="full">Full</option>
          </select>
        </label>

        <label className="flex justify-between"><span>Style Preset</span>
          <select className="bg-slate-900" value={stylePreset} onChange={(e) => setStylePreset(e.target.value as StylePreset)}>
            <option>Normal</option><option>CRT</option><option>NVG</option><option>FLIR</option>
          </select>
        </label>
      </div>
    </aside>
  );
}
