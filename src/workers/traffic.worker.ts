// traffic.worker.ts 閳?runs in a Worker thread (no DOM, no React)

interface RoadSegment {
  id: string;
  type: string;
  coords: [number, number][]; // [lon, lat] pairs
}

interface VehicleAgent {
  id: string;
  lat: number;
  lon: number;
  headingDeg: number;
  speedKmH: number;
  roadIdx: number;
  segIdx: number;
  progress: number; // 0..1 along current segment
  roadType: string;
}

type WorkerInMessage =
  | { type: 'SET_ROADS'; roads: RoadSegment[] }
  | { type: 'STOP' };

const MAX_AGENTS = 400;
let roads: RoadSegment[] = [];
let agents: VehicleAgent[] = [];
let running = false;
let lastTick = Date.now();
let tickHandle: ReturnType<typeof setTimeout> | null = null;
let agentCounter = 0;

// 閳光偓閳光偓閳光偓 Math helpers 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const x =
    sinDLat * sinDLat +
    Math.cos((a[1] * Math.PI) / 180) *
      Math.cos((b[1] * Math.PI) / 180) *
      sinDLon * sinDLon;
  return R * 2 * Math.asin(Math.sqrt(Math.max(0, x)));
}

function bearingDeg(a: [number, number], b: [number, number]): number {
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

function speedForType(type: string): number {
  switch (type) {
    case 'motorway': return 95 + Math.random() * 25;
    case 'trunk':    return 75 + Math.random() * 20;
    case 'primary':  return 45 + Math.random() * 20;
    default:         return 25 + Math.random() * 20;
  }
}

// 閳光偓閳光偓閳光偓 Agent lifecycle 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓

function spawnAgent(): VehicleAgent {
  const roadIdx = Math.floor(Math.random() * roads.length);
  const road = roads[roadIdx];
  const segIdx = Math.floor(Math.random() * Math.max(1, road.coords.length - 1));
  const [lon, lat] = road.coords[segIdx];
  return {
    id: `v${agentCounter++}`,
    lat,
    lon,
    headingDeg: 0,
    speedKmH: speedForType(road.type),
    roadIdx,
    segIdx,
    progress: Math.random(),
    roadType: road.type,
  };
}

function respawn(agent: VehicleAgent): void {
  const fresh = spawnAgent();
  Object.assign(agent, fresh);
}

// 閳光偓閳光偓閳光偓 Tick loop 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓

function tick() {
  if (!running || roads.length === 0) return;

  const now = Date.now();
  const dtHours = (now - lastTick) / 3_600_000;
  lastTick = now;

  for (const agent of agents) {
    const road = roads[agent.roadIdx];
    if (!road || road.coords.length < 2) {
      respawn(agent);
      continue;
    }

    const segA = road.coords[agent.segIdx];
    const segB = road.coords[agent.segIdx + 1];

    if (!segB) {
      respawn(agent);
      continue;
    }

    const segLenKm = haversineKm(segA, segB);
    const distKm = agent.speedKmH * dtHours;
    agent.progress += segLenKm > 0.001 ? distKm / segLenKm : 1;

    while (agent.progress >= 1) {
      agent.progress -= 1;
      agent.segIdx++;
      if (agent.segIdx >= road.coords.length - 1) {
        respawn(agent);
        break;
      }
    }

    // Update position along current segment
    const newSegA = road.coords[agent.segIdx];
    const newSegB = road.coords[agent.segIdx + 1];
    if (!newSegA || !newSegB) {
      respawn(agent);
      continue;
    }

    const t = agent.progress;
    agent.lon = newSegA[0] + (newSegB[0] - newSegA[0]) * t;
    agent.lat = newSegA[1] + (newSegB[1] - newSegA[1]) * t;
    agent.headingDeg = bearingDeg(newSegA, newSegB);
  }

  self.postMessage({
    type: 'VEHICLES',
    vehicles: agents.map((a) => ({
      id: a.id,
      lat: a.lat,
      lon: a.lon,
      headingDeg: a.headingDeg,
      speedKmH: a.speedKmH,
      roadType: a.roadType,
    })),
  });

  tickHandle = setTimeout(tick, 200); // 5 fps
}

// 閳光偓閳光偓閳光偓 Message handler 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓

self.addEventListener('message', (event: MessageEvent<WorkerInMessage>) => {
  const { type } = event.data;

  if (type === 'SET_ROADS') {
    running = false;
    if (tickHandle !== null) {
      clearTimeout(tickHandle);
      tickHandle = null;
    }

    roads = event.data.roads;
    agents = [];

    if (roads.length === 0) return;

    // Spawn agents
    const count = Math.min(MAX_AGENTS, roads.length * 3);
    for (let i = 0; i < count; i++) {
      agents.push(spawnAgent());
    }

    running = true;
    lastTick = Date.now();
    self.postMessage({ type: 'READY', agentCount: agents.length });
    tick();
  }

  if (type === 'STOP') {
    running = false;
    if (tickHandle !== null) {
      clearTimeout(tickHandle);
      tickHandle = null;
    }
  }
});
