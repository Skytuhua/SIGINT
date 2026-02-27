"use client";

import { useEffect, useState } from "react";

export function HudClock() {
  const [iso, setIso] = useState<string>(new Date().toISOString());

  useEffect(() => {
    const timer = setInterval(() => {
      setIso(new Date().toISOString());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return <>{iso}</>;
}
