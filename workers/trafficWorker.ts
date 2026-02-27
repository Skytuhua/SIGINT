/// <reference lib="webworker" />
self.onmessage = (event) => {
  const { roads, maxAgents } = event.data as { roads: Array<{ geometry: Array<{ lat: number; lon: number }> }>; maxAgents: number };
  const agents = roads.slice(0, maxAgents).map((road, idx) => {
    const points = road.geometry;
    const p = points[idx % points.length] ?? points[0];
    return { id: `VEH-${String(idx).padStart(4, "0")}`, lat: p.lat, lon: p.lon };
  });
  postMessage(agents);
};
