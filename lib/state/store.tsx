"use client";
import { createContext, useContext, useMemo, useState } from "react";
import scenes from "@/data/scenes.json";

export type StylePreset = "Normal" | "CRT" | "NVG" | "FLIR";

type Layers = {
  satellites: boolean;
  flights: boolean;
  military: boolean;
  earthquakes: boolean;
  traffic: boolean;
  cctv: boolean;
};

type Store = {
  layers: Layers;
  stylePreset: StylePreset;
  detectMode: "sparse" | "full";
  selectedEntityId: string | null;
  currentLandmarkIndex: number;
  toggleLayer: (k: keyof Layers) => void;
  setStylePreset: (s: StylePreset) => void;
  setDetectMode: (m: "sparse" | "full") => void;
  setSelectedEntityId: (id: string | null) => void;
  jumpLandmark: (idx: number) => void;
};

const Ctx = createContext<Store | null>(null);

export function WorldViewStoreProvider({ children }: { children: React.ReactNode }) {
  const [layers, setLayers] = useState<Layers>({ satellites: true, flights: true, military: false, earthquakes: true, traffic: true, cctv: true });
  const [stylePreset, setStylePreset] = useState<StylePreset>("Normal");
  const [detectMode, setDetectMode] = useState<"sparse" | "full">("sparse");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [currentLandmarkIndex, setCurrentLandmarkIndex] = useState(0);

  const value = useMemo(
    () => ({
      layers,
      stylePreset,
      detectMode,
      selectedEntityId,
      currentLandmarkIndex,
      toggleLayer: (k: keyof Layers) => setLayers((l) => ({ ...l, [k]: !l[k] })),
      setStylePreset,
      setDetectMode,
      setSelectedEntityId,
      jumpLandmark: (idx: number) => {
        const max = scenes[0]?.landmarks?.length ?? 1;
        setCurrentLandmarkIndex(Math.max(0, Math.min(max - 1, idx)));
      },
    }),
    [layers, stylePreset, detectMode, selectedEntityId, currentLandmarkIndex],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorldViewStore() {
  const store = useContext(Ctx);
  if (!store) {
    throw new Error("Missing WorldViewStoreProvider");
  }
  return store;
}
