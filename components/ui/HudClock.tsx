"use client";

import { useEffect, useState } from "react";

export function HudClock() {
  const [iso, setIso] = useState<string>("--:--:--Z");

  useEffect(() => {
    const tick = () => setIso(new Date().toISOString());
    tick();

    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  return <span suppressHydrationWarning>{iso}</span>;
}
