export interface DataProvider<T> {
  name: string;
  enabledByDefault: boolean;
  refreshIntervalMs: number;
  fetch: () => Promise<T[]>;
}

export type Satellite = { noradId: string; name: string; lat: number; lon: number; altKm: number; velocityKmS: number; isGeo: boolean; orbitPathPositions: [number, number, number][] };
export type Flight = { icao24: string; callsign: string | null; lat: number; lon: number; altitudeM: number | null; velocityMS: number | null; headingDeg: number | null; onGround: boolean };
export type Earthquake = { id: string; magnitude: number; time: number; lat: number; lon: number; depthKm: number; place: string };
