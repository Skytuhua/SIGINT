// satellite.worker.ts 閳?runs in a Worker thread (no DOM, no React, no window)
import * as satellite from 'satellite.js';

interface TLEEntry {
  noradId: string;
  name: string;
  tle1: string;
  tle2: string;
}

interface SatRecord {
  noradId: string;
  name: string;
  satrec: satellite.SatRec;
  inclinationDeg: number;
}

type WorkerInMessage =
  | { type: 'UPDATE_TLES'; tles: TLEEntry[] }
  | { type: 'COMPUTE_ORBIT'; noradId: string };

let satRecords: SatRecord[] = [];
let tickHandle: ReturnType<typeof setTimeout> | null = null;

// 閳光偓閳光偓閳光偓 Propagation 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓

function propagateAll(date: Date) {
  const gmst = satellite.gstime(date);
  const results = [];

  for (const sat of satRecords) {
    try {
      const posVel = satellite.propagate(sat.satrec, date);
      // propagate() returns { position: false } for propagation errors
      if (!posVel.position || posVel.position === true) continue;

      const pos = posVel.position as satellite.EciVec3<number>;
      const geo = satellite.eciToGeodetic(pos, gmst);

      const latDeg = satellite.degreesLat(geo.latitude);
      const lonDeg = satellite.degreesLong(geo.longitude);
      const altKm = geo.height;

      if (!isFinite(latDeg) || !isFinite(lonDeg) || altKm < 0) continue;

      let velocityKmS = 0;
      if (posVel.velocity && posVel.velocity !== true) {
        const v = posVel.velocity as satellite.EciVec3<number>;
        velocityKmS = Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
      }

      results.push({
        noradId: sat.noradId,
        name: sat.name,
        lat: latDeg,
        lon: lonDeg,
        altKm,
        velocityKmS,
        inclinationDeg: sat.inclinationDeg,
        isGeo: altKm > 35_000 && altKm < 37_000,
      });
    } catch {
      // Skip bad satellites silently
    }
  }
  return results;
}

function propagateAndPost() {
  if (satRecords.length === 0) return;
  const positions = propagateAll(new Date());
  self.postMessage({ type: 'POSITIONS', positions });
  // Use setTimeout (not setInterval) to prevent pileup
  tickHandle = setTimeout(propagateAndPost, 3000);
}

// 閳光偓閳光偓閳光偓 Orbit path 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓

function computeOrbitPath(noradId: string): [number, number, number][] {
  const sat = satRecords.find((s) => s.noradId === noradId);
  if (!sat) return [];

  // satrec.no is mean motion in rad/min; period = 2锜?no minutes
  const periodMin = (2 * Math.PI) / sat.satrec.no;
  const stepMin = periodMin / 90;

  const path: [number, number, number][] = [];
  const now = new Date();

  for (let i = 0; i <= 90; i++) {
    const t = new Date(now.getTime() + i * stepMin * 60 * 1000);
    const gmst = satellite.gstime(t);
    try {
      const pv = satellite.propagate(sat.satrec, t);
      if (!pv.position || pv.position === true) continue;
      const geo = satellite.eciToGeodetic(pv.position as satellite.EciVec3<number>, gmst);
      path.push([
        satellite.degreesLong(geo.longitude),
        satellite.degreesLat(geo.latitude),
        geo.height * 1000, // km 閳?meters for Cesium
      ]);
    } catch {
      // Skip bad propagation steps
    }
  }
  return path;
}

// 閳光偓閳光偓閳光偓 Message handler 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓

self.addEventListener('message', (event: MessageEvent<WorkerInMessage>) => {
  const { type } = event.data;

  if (type === 'UPDATE_TLES') {
    // Stop any running tick
    if (tickHandle !== null) {
      clearTimeout(tickHandle);
      tickHandle = null;
    }

    // Parse and validate TLEs
    satRecords = [];
    for (const tle of event.data.tles) {
      try {
        const satrec = satellite.twoline2satrec(tle.tle1, tle.tle2);
        if (satrec.error !== 0) continue;
        satRecords.push({
          noradId: tle.noradId,
          name: tle.name,
          satrec,
          inclinationDeg: (satrec.inclo * 180) / Math.PI,
        });
      } catch {
        // Skip malformed TLEs
      }
    }

    self.postMessage({ type: 'TLE_LOADED', count: satRecords.length });
    // Start propagation loop
    propagateAndPost();
  }

  if (type === 'COMPUTE_ORBIT') {
    const path = computeOrbitPath(event.data.noradId);
    self.postMessage({ type: 'ORBIT_PATH', noradId: event.data.noradId, path });
  }
});
