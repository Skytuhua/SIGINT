import type { Flight, AirspaceAnomalyZone, DisappearedFlight } from "../providers/types";

// Grid and buffer constants
const ANOMALY_CELL_DEG = 2.0;
const MAX_SNAPSHOTS = 150;
const MIN_BASELINE_SNAPSHOTS = 3;

// Anomaly thresholds
const VOID_THRESHOLD_RATIO = 0.5;
const MIN_BASELINE_COUNT = 2;
const MAX_ANOMALY_ZONES = 30;
const MIL_PROXIMITY_DEG = 6.0;

// Ghost marker TTL
export const GHOST_MAX_AGE_MS = 2 * 60_000;

function cellKey(lat: number, lon: number): string {
  const cLat = Math.round(lat / ANOMALY_CELL_DEG) * ANOMALY_CELL_DEG;
  const cLon = Math.round(lon / ANOMALY_CELL_DEG) * ANOMALY_CELL_DEG;
  return `${cLat},${cLon}`;
}

function parseCellKey(key: string): { lat: number; lon: number } {
  const [lat, lon] = key.split(",").map(Number);
  return { lat, lon };
}

function binFlightsIntoCells(flights: Flight[]): Map<string, number> {
  const cells = new Map<string, number>();
  for (const f of flights) {
    if (f.onGround) continue;
    if ((f.altM ?? 0) < 1_000) continue;
    const key = cellKey(f.lat, f.lon);
    cells.set(key, (cells.get(key) ?? 0) + 1);
  }
  return cells;
}

/**
 * Rolling baseline tracker for airspace traffic density.
 * Maintains a circular buffer of civilian traffic snapshots to compute
 * per-cell average occupancy over ~30 minutes.
 */
export class AirspaceBaselineTracker {
  private snapshots: Map<string, number>[] = [];
  private writeIdx = 0;
  private count = 0;

  pushSnapshot(allFlights: Flight[], military: Flight[]): void {
    // Build set of military ICAOs for exclusion
    const milIcaos = new Set(military.map((f) => f.icao));
    // Bin only civilian flights
    const civilian = allFlights.filter((f) => !f.isMilitary && !milIcaos.has(f.icao));
    const cells = binFlightsIntoCells(civilian);

    if (this.count < MAX_SNAPSHOTS) {
      this.snapshots.push(cells);
      this.count++;
    } else {
      this.snapshots[this.writeIdx] = cells;
    }
    this.writeIdx = (this.writeIdx + 1) % MAX_SNAPSHOTS;
  }

  getBaseline(): Map<string, number> {
    const totals = new Map<string, { sum: number; n: number }>();
    const len = Math.min(this.count, this.snapshots.length);
    for (let i = 0; i < len; i++) {
      const snap = this.snapshots[i];
      snap.forEach((count, key) => {
        const entry = totals.get(key);
        if (entry) {
          entry.sum += count;
          entry.n++;
        } else {
          totals.set(key, { sum: count, n: 1 });
        }
      });
    }
    const baseline = new Map<string, number>();
    totals.forEach(({ sum, n }, key) => {
      baseline.set(key, sum / n);
    });
    return baseline;
  }

  hasEnoughData(): boolean {
    return this.count >= MIN_BASELINE_SNAPSHOTS;
  }

  /** Reset all stored snapshots (e.g. on layer disable). */
  reset(): void {
    this.snapshots = [];
    this.writeIdx = 0;
    this.count = 0;
  }
}

/**
 * Compare current civilian traffic against the rolling baseline.
 * Returns zones where traffic dropped below the threshold,
 * annotated with nearby military aircraft count.
 */
export function computeAirspaceAnomalies(
  baseline: Map<string, number>,
  currentFlights: Flight[],
  currentMilitary: Flight[]
): AirspaceAnomalyZone[] {
  const currentCells = binFlightsIntoCells(
    currentFlights.filter((f) => !f.isMilitary)
  );

  const zones: AirspaceAnomalyZone[] = [];

  baseline.forEach((avg, key) => {
    if (avg < MIN_BASELINE_COUNT) return;

    const current = currentCells.get(key) ?? 0;
    const ratio = current / avg;
    if (ratio >= VOID_THRESHOLD_RATIO) return;

    const { lat, lon } = parseCellKey(key);
    const deviationRatio = 1 - ratio;

    let severity: AirspaceAnomalyZone["severity"];
    if (deviationRatio >= 0.9) severity = "critical";
    else if (deviationRatio >= 0.7) severity = "high";
    else if (deviationRatio >= 0.5) severity = "medium";
    else severity = "low";

    // Count military aircraft within proximity
    let nearbyMilitary = 0;
    for (const mil of currentMilitary) {
      const dLat = Math.abs(mil.lat - lat);
      const dLon = Math.abs(mil.lon - lon);
      if (dLat <= MIL_PROXIMITY_DEG && dLon <= MIL_PROXIMITY_DEG) {
        nearbyMilitary++;
      }
    }

    zones.push({
      lat,
      lon,
      baselineAvg: Math.round(avg * 10) / 10,
      currentCount: current,
      deviationRatio: Math.round(deviationRatio * 100) / 100,
      severity,
      nearbyMilitary,
    });
  });

  // Return top zones by severity (highest deviation first), capped
  zones.sort((a, b) => b.deviationRatio - a.deviationRatio);
  return zones.slice(0, MAX_ANOMALY_ZONES);
}

/**
 * Detect military flights that were present in the previous snapshot
 * but are missing from the current one.
 */
export function detectDisappearedFlights(
  previousMap: Map<string, Flight>,
  currentMilitary: Flight[],
  now: number
): DisappearedFlight[] {
  const currentIcaos = new Set(currentMilitary.map((f) => f.icao));
  const disappeared: DisappearedFlight[] = [];

  previousMap.forEach((prev, icao) => {
    if (currentIcaos.has(icao)) return;
    disappeared.push({
      icao,
      callsign: prev.callsign ?? null,
      lastLat: prev.lat,
      lastLon: prev.lon,
      lastAltM: prev.altM ?? 0,
      lastHeading: prev.heading ?? 0,
      lastSpeedMs: prev.speedMs ?? 0,
      isMilitary: true,
      disappearedAt: now,
      aircraftType: prev.aircraftType,
      aircraftTypeDescription: prev.aircraftTypeDescription,
    });
  });

  return disappeared;
}

/** Remove ghosts older than maxAgeMs. */
export function pruneGhosts(
  ghosts: DisappearedFlight[],
  now: number,
  maxAgeMs: number = GHOST_MAX_AGE_MS
): DisappearedFlight[] {
  return ghosts.filter((g) => now - g.disappearedAt < maxAgeMs);
}
