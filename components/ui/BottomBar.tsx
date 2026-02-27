export function BottomBar() {
  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-3 rounded-xl border border-slate-700/70 bg-slate-950/70 px-4 py-2 text-[10px]">
      <span>Style Presets: Normal / CRT / NVG / FLIR</span>
      <span className="text-amber-300">Location: Tokyo • Shibuya Crossing</span>
    </div>
  );
}
