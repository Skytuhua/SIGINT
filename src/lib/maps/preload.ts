export async function preloadLeaflet(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    await import("leaflet");
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("[maps] Leaflet preload failed", error);
    }
  }
}

