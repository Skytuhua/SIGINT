import { LeftPanel } from "@/components/ui/LeftPanel";
import { RightPanel } from "@/components/ui/RightPanel";
import { BottomBar } from "@/components/ui/BottomBar";
import { WorldViewGlobe } from "@/lib/cesium/WorldViewGlobe";
import { WorldViewStoreProvider } from "@/lib/state/store";
import { KeyboardLandmarks } from "@/components/ui/KeyboardLandmarks";
import { PerfOverlay } from "@/components/ui/PerfOverlay";
import { HudClock } from "@/components/ui/HudClock";

export default function Home() {
  return (
    <WorldViewStoreProvider>
      <KeyboardLandmarks />
      <main className="relative flex min-h-screen items-center justify-between gap-4 p-4">
        <LeftPanel />
        <section className="scope-shell relative h-[86vh] flex-1 min-w-[500px] rounded-[999px] border border-slate-700 bg-black">
          <WorldViewGlobe />
          <div className="absolute left-4 top-4 z-20 text-[10px] text-cyan-200">REC <HudClock /></div>
          <div className="absolute right-4 top-4 z-20 text-[10px] text-amber-200">ORB: 0042 PASS: NOMINAL</div>
          <BottomBar />
          <PerfOverlay />
        </section>
        <RightPanel />
      </main>
    </WorldViewStoreProvider>
  );
}
