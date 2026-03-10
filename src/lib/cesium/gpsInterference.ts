/**
 * GPS/GNSS Interference Inference Engine
 *
 * Infers electronic-warfare interference zones by reading ADS-B navigation
 * quality metadata from many aircraft, scoring degradation across multiple
 * indicators, spatially aggregating into grid cells, and temporally smoothing
 * with an exponential moving average so zones intensify, expand, or fade
 * over minutes rather than flickering per poll cycle.
 *
 * Pure computation — no Cesium dependency.
 */
import type { Flight, GpsJamZone } from "../providers/types";

// ── Grid ────────────────────────────────────────────────────────────────────
const CELL_DEG = 2.0;
const MAX_SNAPSHOTS = 150; // ~30 min at 12s polls
const MIN_BASELINE_SNAPSHOTS = 10; // ~2 min warm-up for thinning baseline
const MIN_RENDER_SNAPSHOTS = 3;    // ~36s before first zone display

// ── Per-aircraft scoring weights (sum = 1.0) ────────────────────────────────
const W_NACP = 0.40;
const W_SIL = 0.20;
const W_RC = 0.15;
const W_NACV = 0.10;
const W_NIC_BARO = 0.05;
const W_STALE = 0.10;

// ── Cell thresholds ─────────────────────────────────────────────────────────
const MIN_AIRCRAFT_PER_CELL = 4;
const DEGRADED_RATIO_THRESHOLD = 0.30;
const THINNING_RATIO = 0.5;

// ── Track noise ─────────────────────────────────────────────────────────────
const NOISE_HISTORY_LENGTH = 5;
const TRACK_PRUNE_AGE_MS = 60_000;

// ── Temporal smoothing ──────────────────────────────────────────────────────
const EMA_ALPHA = 0.3;
const TREND_LOOKBACK = 5; // snapshots (~60s)
const TREND_THRESHOLD = 0.05;
const CELL_PRUNE_AGE_MS = 120_000;

// ── Symptom bitmask constants ───────────────────────────────────────────────
export const SYMPTOM_QUALITY = 1;
export const SYMPTOM_NOISE = 2;
export const SYMPTOM_THINNING = 4;

// ── Internal types ──────────────────────────────────────────────────────────

interface AircraftDegradationScore {
  icao: string;
  compositeScore: number;
  isDegraded: boolean;
}

interface CellSnapshot {
  totalAircraft: number;
  degradedCount: number;
  avgCompositeScore: number;
  noisyCount: number;
}

interface CellTemporalState {
  emaScore: number;
  emaDegradedRatio: number;
  baselineTotal: number; // average total aircraft from early snapshots
  peakScore: number;
  scoreHistory: number[]; // last TREND_LOOKBACK emaScores
  firstSeenMs: number;
  lastUpdatedMs: number;
  // Latest raw snapshot values (for zone output)
  lastTotal: number;
  lastDegraded: number;
  lastNoisy: number;
}

interface TrackPoint {
  lat: number;
  lon: number;
  ts: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function cellKey(lat: number, lon: number): string {
  const cLat = Math.round(lat / CELL_DEG) * CELL_DEG;
  const cLon = Math.round(lon / CELL_DEG) * CELL_DEG;
  return `${cLat},${cLon}`;
}

function parseCellKey(key: string): { lat: number; lon: number } {
  const [lat, lon] = key.split(",").map(Number);
  return { lat, lon };
}

// ── Per-aircraft composite scoring ──────────────────────────────────────────

/**
 * Score a single aircraft's ADS-B quality indicators.
 * Returns 0 (perfect navigation) to 1 (fully degraded).
 */
export function computeAircraftScore(flight: Flight): AircraftDegradationScore {
  // NACp: 0-11 (higher = better). Missing = conservatively high.
  const nacpVal = parseInt(flight.nacp ?? "-1", 10);
  const nacpScore =
    isNaN(nacpVal) || nacpVal < 0 ? 0.8 : Math.max(0, 1 - nacpVal / 11);

  // SIL: 0-3 (higher = better). Missing = moderate.
  const silVal = parseInt(flight.sil ?? "-1", 10);
  const silScore =
    isNaN(silVal) || silVal < 0 ? 0.5 : Math.max(0, 1 - silVal / 3);

  // Radius of Containment: 0m (best) to >= 2000m (worst).
  const rcVal = flight.rcMeters ?? -1;
  const rcScore = rcVal < 0 ? 0.5 : Math.min(1, rcVal / 2000);

  // NACv: 0-4 (higher = better).
  const nacvVal = parseInt(flight.nacv ?? "-1", 10);
  const nacvScore =
    isNaN(nacvVal) || nacvVal < 0 ? 0.3 : Math.max(0, 1 - nacvVal / 4);

  // NIC Baro: 1 = good, 0 = failed cross-check.
  const nicBaroVal = parseInt(flight.nicBaro ?? "-1", 10);
  const nicBaroScore =
    isNaN(nicBaroVal) || nicBaroVal < 0 ? 0.3 : nicBaroVal === 0 ? 1.0 : 0.0;

  // Staleness: seconds since last position report.
  const maxStale = Math.max(flight.lastPosSec ?? 0, flight.lastSeenSec ?? 0);
  const stalenessScore = Math.min(1, maxStale / 60);

  const composite =
    W_NACP * nacpScore +
    W_SIL * silScore +
    W_RC * rcScore +
    W_NACV * nacvScore +
    W_NIC_BARO * nicBaroScore +
    W_STALE * stalenessScore;

  return {
    icao: flight.icao,
    compositeScore: Math.round(composite * 1000) / 1000,
    isDegraded: composite > 0.5,
  };
}

// ── Track noise ─────────────────────────────────────────────────────────────

/**
 * Compute bearing-change noise from a position history.
 * Returns 0 (smooth track) to 1 (chaotic / erratic).
 */
function computeTrackNoise(history: TrackPoint[]): number {
  if (history.length < 3) return 0;

  const bearings: number[] = [];
  for (let i = 1; i < history.length; i++) {
    const dLon = history[i].lon - history[i - 1].lon;
    const dLat = history[i].lat - history[i - 1].lat;
    bearings.push(Math.atan2(dLon, dLat));
  }

  const deltas: number[] = [];
  for (let i = 1; i < bearings.length; i++) {
    let delta = bearings[i] - bearings[i - 1];
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    deltas.push(Math.abs(delta));
  }

  if (deltas.length === 0) return 0;

  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const variance =
    deltas.reduce((a, d) => a + (d - mean) ** 2, 0) / deltas.length;
  const stdDev = Math.sqrt(variance);

  // PI/4 rad std dev ≈ fully noisy
  return Math.min(1, stdDev / (Math.PI / 4));
}

// ── Tracker class ───────────────────────────────────────────────────────────

export class GpsInterferenceTracker {
  private snapshotCount = 0;

  // Per-cell temporal state
  private cellStates = new Map<string, CellTemporalState>();

  // Per-aircraft track history for noise detection
  private trackHistory = new Map<string, TrackPoint[]>();

  // Baseline accumulator (first MIN_BASELINE_SNAPSHOTS)
  private baselineAccum = new Map<string, { sum: number; n: number }>();
  private baselineReady = false;

  // ── Public API ──────────────────────────────────────────────────────────

  /** Ingest a new batch of flights. Call once per poll cycle (~12s). */
  pushSnapshot(flights: Flight[]): void {
    const now = Date.now();
    this.snapshotCount++;

    // Filter: airborne, above 3000m (ignore approach / low-altitude)
    const airborne = flights.filter(
      (f) => !f.onGround && (f.altM ?? 0) >= 3_000
    );

    // Score each aircraft
    const scores = new Map<string, AircraftDegradationScore>();
    for (const f of airborne) {
      scores.set(f.icao, computeAircraftScore(f));
    }

    // Update track history + compute noise per aircraft
    const noiseScores = new Map<string, number>();
    for (const f of airborne) {
      let history = this.trackHistory.get(f.icao);
      if (!history) {
        history = [];
        this.trackHistory.set(f.icao, history);
      }
      history.push({ lat: f.lat, lon: f.lon, ts: now });
      if (history.length > NOISE_HISTORY_LENGTH) history.shift();
      noiseScores.set(f.icao, computeTrackNoise(history));
    }

    // Prune stale aircraft from track history
    const staleIcaos: string[] = [];
    this.trackHistory.forEach((hist, icao) => {
      if (hist.length > 0 && now - hist[hist.length - 1].ts > TRACK_PRUNE_AGE_MS) {
        staleIcaos.push(icao);
      }
    });
    for (const icao of staleIcaos) this.trackHistory.delete(icao);

    // Bin into cells
    const cellData = new Map<
      string,
      {
        total: number;
        degraded: number;
        scoreSum: number;
        noisy: number;
      }
    >();

    for (const f of airborne) {
      const key = cellKey(f.lat, f.lon);
      let cell = cellData.get(key);
      if (!cell) {
        cell = { total: 0, degraded: 0, scoreSum: 0, noisy: 0 };
        cellData.set(key, cell);
      }
      cell.total++;

      const score = scores.get(f.icao);
      if (score) {
        cell.scoreSum += score.compositeScore;
        if (score.isDegraded) cell.degraded++;
      }

      const noise = noiseScores.get(f.icao) ?? 0;
      if (noise > 0.4) cell.noisy++;
    }

    // Build cell snapshots
    const snapshots = new Map<string, CellSnapshot>();
    cellData.forEach((cell, key) => {
      snapshots.set(key, {
        totalAircraft: cell.total,
        degradedCount: cell.degraded,
        avgCompositeScore: cell.total > 0 ? cell.scoreSum / cell.total : 0,
        noisyCount: cell.noisy,
      });
    });

    // Update baseline accumulator during warm-up
    if (this.snapshotCount <= MIN_BASELINE_SNAPSHOTS) {
      snapshots.forEach((snap, key) => {
        const acc = this.baselineAccum.get(key);
        if (acc) {
          acc.sum += snap.totalAircraft;
          acc.n++;
        } else {
          this.baselineAccum.set(key, { sum: snap.totalAircraft, n: 1 });
        }
      });
      if (this.snapshotCount === MIN_BASELINE_SNAPSHOTS) {
        this.baselineReady = true;
      }
    }

    // Update per-cell temporal state with EMA
    snapshots.forEach((snap, key) => {
      const existing = this.cellStates.get(key);
      const currentScore = snap.avgCompositeScore;
      const currentRatio =
        snap.totalAircraft > 0 ? snap.degradedCount / snap.totalAircraft : 0;

      if (existing) {
        existing.emaScore =
          EMA_ALPHA * currentScore + (1 - EMA_ALPHA) * existing.emaScore;
        existing.emaDegradedRatio =
          EMA_ALPHA * currentRatio + (1 - EMA_ALPHA) * existing.emaDegradedRatio;
        existing.peakScore = Math.max(existing.peakScore, existing.emaScore);
        existing.lastUpdatedMs = now;
        existing.lastTotal = snap.totalAircraft;
        existing.lastDegraded = snap.degradedCount;
        existing.lastNoisy = snap.noisyCount;

        // Maintain score history for trend detection
        existing.scoreHistory.push(existing.emaScore);
        if (existing.scoreHistory.length > TREND_LOOKBACK + 1) {
          existing.scoreHistory.shift();
        }
      } else {
        this.cellStates.set(key, {
          emaScore: currentScore,
          emaDegradedRatio: currentRatio,
          baselineTotal: this.getBaselineForCell(key),
          peakScore: currentScore,
          scoreHistory: [currentScore],
          firstSeenMs: now,
          lastUpdatedMs: now,
          lastTotal: snap.totalAircraft,
          lastDegraded: snap.degradedCount,
          lastNoisy: snap.noisyCount,
        });
      }
    });

    // Prune stale cells not updated recently
    const staleCells: string[] = [];
    this.cellStates.forEach((state, key) => {
      if (now - state.lastUpdatedMs > CELL_PRUNE_AGE_MS) {
        staleCells.push(key);
      }
    });
    for (const key of staleCells) this.cellStates.delete(key);
  }

  /** Compute current GPS interference zones from temporal state.
   *  Optionally accepts military flights to annotate zones with nearby military count. */
  computeZones(military?: Flight[]): GpsJamZone[] {
    const now = Date.now();
    const zones: GpsJamZone[] = [];

    this.cellStates.forEach((state, key) => {
      // Must meet minimum ratio or score threshold
      if (
        state.emaDegradedRatio < DEGRADED_RATIO_THRESHOLD &&
        state.emaScore < 0.35
      ) {
        return;
      }

      const { lat, lon } = parseCellKey(key);

      // Get current snapshot data for this cell (from latest EMA)
      const degradedRatio = state.emaDegradedRatio;

      // Compute symptom flags
      let symptomFlags = 0;

      // Symptom 1: Quality degradation
      if (state.emaDegradedRatio >= DEGRADED_RATIO_THRESHOLD) {
        symptomFlags |= SYMPTOM_QUALITY;
      }

      // Symptom 2: Track noise — 20%+ of aircraft in cell have erratic tracks
      if (state.lastTotal > 0 && state.lastNoisy / state.lastTotal >= 0.2) {
        symptomFlags |= SYMPTOM_NOISE;
      }

      // Symptom 3: Report thinning (only after baseline established)
      let thinningRatio: number | undefined;
      if (this.baselineReady && state.baselineTotal > MIN_AIRCRAFT_PER_CELL) {
        thinningRatio = state.lastTotal / state.baselineTotal;
        if (thinningRatio < THINNING_RATIO) {
          symptomFlags |= SYMPTOM_THINNING;
        }
      }

      // Determine severity from composite EMA score
      let severity: GpsJamZone["severity"];
      if (state.emaScore >= 0.75) severity = "critical";
      else if (state.emaScore >= 0.55) severity = "high";
      else if (state.emaScore >= 0.35) severity = "medium";
      else severity = "low";

      // Boost severity if multiple symptoms active
      const symptomCount = popcount(symptomFlags);
      if (symptomCount >= 3 && severity !== "critical" && severity !== "high") {
        severity = "high";
      } else if (symptomCount >= 2 && severity === "low") {
        severity = "medium";
      }

      // Determine trend from score history
      let trend: GpsJamZone["trend"] = "stable";
      if (state.scoreHistory.length > TREND_LOOKBACK) {
        const oldScore = state.scoreHistory[0];
        const delta = state.emaScore - oldScore;
        if (delta > TREND_THRESHOLD) trend = "rising";
        else if (delta < -TREND_THRESHOLD) trend = "falling";
      }

      const durationMs = now - state.firstSeenMs;

      // Count military aircraft within 6-degree proximity
      let nearbyMilitary = 0;
      if (military) {
        for (const mil of military) {
          if (Math.abs(mil.lat - lat) <= 6.0 && Math.abs(mil.lon - lon) <= 6.0) {
            nearbyMilitary++;
          }
        }
      }

      zones.push({
        lat,
        lon,
        degradedRatio,
        count: state.lastTotal,
        degradedCount: state.lastDegraded,
        compositeScore: Math.round(state.emaScore * 1000) / 1000,
        severity,
        trend,
        symptomFlags,
        thinningRatio,
        trackNoiseCount: state.lastNoisy,
        durationMs,
        peakScore: Math.round(state.peakScore * 1000) / 1000,
        nearbyMilitary,
      });
    });

    return zones;
  }

  /** Check if enough data has accumulated for meaningful zones. */
  hasEnoughData(): boolean {
    return this.snapshotCount >= MIN_RENDER_SNAPSHOTS;
  }

  /** Reset all state (e.g., on layer disable). */
  reset(): void {
    this.snapshotCount = 0;
    this.cellStates.clear();
    this.trackHistory.clear();
    this.baselineAccum.clear();
    this.baselineReady = false;
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private getBaselineForCell(key: string): number {
    const acc = this.baselineAccum.get(key);
    if (!acc || acc.n === 0) return 0;
    return acc.sum / acc.n;
  }
}

// ── Utility ─────────────────────────────────────────────────────────────────

function popcount(n: number): number {
  let count = 0;
  while (n) {
    count += n & 1;
    n >>= 1;
  }
  return count;
}
