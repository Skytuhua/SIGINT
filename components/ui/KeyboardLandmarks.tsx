"use client";

import { useEffect } from "react";
import scenes from "@/data/scenes.json";
import { useWorldViewStore } from "@/lib/state/store";

const keyMap = ["q", "w", "e", "r", "t"];

export function KeyboardLandmarks() {
  const { jumpLandmark } = useWorldViewStore();

  useEffect(() => {
    const total = scenes[0]?.landmarks?.length ?? 0;
    const onKeydown = (event: KeyboardEvent) => {
      const idx = keyMap.indexOf(event.key.toLowerCase());
      if (idx >= 0 && idx < total) {
        jumpLandmark(idx);
      }
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [jumpLandmark]);

  return null;
}
