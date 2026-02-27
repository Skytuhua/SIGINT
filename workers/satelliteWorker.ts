/// <reference lib="webworker" />
self.onmessage = (event) => {
  const { records } = event.data as { records: Array<{ noradId: string; name: string; lat: number; lon: number; altKm: number }> };
  const out = records.slice(0, 200).map((r) => ({ ...r, velocityKmS: 0, isGeo: false, orbitPathPositions: [] }));
  postMessage(out);
};
