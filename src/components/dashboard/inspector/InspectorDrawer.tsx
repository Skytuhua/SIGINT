"use client";

import { useMemo } from "react";
import { useSIGINTStore } from "../../../store";
import { featureFlags } from "../../../config/featureFlags";
import { useIsMobile } from "../../../hooks/useIsMobile";
import PanelTabs from "../panel/PanelTabs";
import Toggle from "../controls/Toggle";
import { formatUtc } from "../../../lib/dashboard/format";
import type { CctvCamera, Flight } from "../../../lib/providers/types";
import { inferFlightCountry, inferSatelliteCountry } from "../../../lib/geo/country";
import CctvFeedView from "./CctvFeedView";

const tabs = [
  { value: "summary", label: "SUMMARY" },
  { value: "history", label: "HISTORY" },
  { value: "related", label: "RELATED" },
  { value: "notes", label: "NOTES" },
] as const;

interface SummaryRow {
  key: string;
  value: string;
  section?: boolean;
}

const KTS_PER_MS = 1.943844;
const FT_PER_M = 3.28084;
const FPM_PER_MS = 196.8504;

function fmt(value: unknown, suffix = "", digits = 1): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${value.toFixed(digits)}${suffix}`;
  }
  if (typeof value === "string" && value.trim()) return value.trim();
  return "n/a";
}

function fmtCoord(lat?: number | null, lon?: number | null): string {
  if (typeof lat !== "number" || typeof lon !== "number") return "n/a";
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "n/a";
  return `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
}

function fmtList(value?: string[]): string {
  if (!value?.length) return "n/a";
  return value.join(", ");
}

function orbitClassFromAltitude(altKm?: number | null): string {
  if (typeof altKm !== "number" || !Number.isFinite(altKm)) return "Unknown";
  if (altKm < 2_000) return "LEO";
  if (altKm < 35_000) return "MEO";
  return "GEO";
}

function orbitClassFromName(name: string): string {
  const upper = name.toUpperCase();
  if (
    upper.includes("STARLINK") ||
    upper.includes("ONEWEB") ||
    upper.includes("IRIDIUM") ||
    upper.includes("ISS") ||
    upper.includes("NOAA") ||
    upper.includes("COSMOS")
  ) {
    return "LEO";
  }
  if (
    upper.includes("GPS") ||
    upper.includes("GALILEO") ||
    upper.includes("GLONASS") ||
    upper.includes("BEIDOU")
  ) {
    return "MEO";
  }
  if (
    upper.includes("SES") ||
    upper.includes("INTELSAT") ||
    upper.includes("INMARSAT") ||
    upper.includes("EUTELSAT") ||
    upper.includes("ASTRA") ||
    upper.includes("GEO")
  ) {
    return "GEO";
  }
  return "Unknown";
}

/** Infer satellite use/purpose from name (TLE/catalog data typically has no explicit purpose field). */
function inferSatellitePurpose(name: string): string {
  const upper = name.toUpperCase();
  if (upper.includes("STARLINK") || upper.includes("ONEWEB") || upper.includes("Kuiper")) return "Communications (LEO broadband)";
  if (upper.includes("IRIDIUM")) return "Communications (LEO voice/data)";
  if (upper.includes("GPS") || upper.includes("GALILEO") || upper.includes("GLONASS") || upper.includes("BEIDOU") || upper.includes("QZSS")) return "Navigation (GNSS)";
  if (upper.includes("ISS") || upper.includes("TIANHE") || upper.includes("TIANGONG")) return "Space station";
  if (upper.includes("HST") || upper.includes("HUBBLE") || upper.includes("JAMES WEBB") || upper.includes("JWST")) return "Science (space telescope)";
  if (upper.includes("NOAA") || upper.includes("GOES") || upper.includes("METEOSAT") || upper.includes("HIMAWARI") || upper.includes("FENGYUN")) return "Earth observation / Weather";
  if (upper.includes("LANDSAT") || upper.includes("SENTINEL") || upper.includes("TERRA") || upper.includes("AQUA") || upper.includes("MODIS")) return "Earth observation / Imaging";
  if (upper.includes("SES") || upper.includes("INTELSAT") || upper.includes("INMARSAT") || upper.includes("EUTELSAT") || upper.includes("ASTRA") || upper.includes("AMOS") || upper.includes("SES-")) return "Communications (GEO)";
  if (upper.includes("COSMOS") || upper.includes("USA-") || upper.includes("NROL-") || upper.includes("KH-") || upper.includes("LACROSSE")) return "Military / Reconnaissance";
  if (upper.includes("X-37") || upper.includes("SPACEPLANE")) return "Military / Experimental";
  if (upper.includes("DRAGON") || upper.includes("CYGNUS") || upper.includes("PROGRESS") || upper.includes("HTV")) return "Cargo / Resupply";
  return "Unknown";
}

function parseTleEpoch(tle1?: string): string {
  if (!tle1 || tle1.length < 32) return "n/a";
  const yearToken = Number.parseInt(tle1.slice(18, 20), 10);
  const dayToken = Number.parseFloat(tle1.slice(20, 32));
  if (!Number.isFinite(yearToken) || !Number.isFinite(dayToken)) return "n/a";

  const fullYear = yearToken < 57 ? 2000 + yearToken : 1900 + yearToken;
  const dayWhole = Math.floor(dayToken);
  const dayFraction = dayToken - dayWhole;
  const seconds = Math.round(dayFraction * 86400);
  const epoch = Date.UTC(fullYear, 0, 1, 0, 0, 0);
  const ts = epoch + (dayWhole - 1) * 86_400_000 + seconds * 1_000;
  return Number.isFinite(ts) ? formatUtc(ts) : "n/a";
}

function parseTleInclination(tle2?: string): number | null {
  if (!tle2) return null;
  const parts = tle2.trim().split(/\s+/);
  const incl = Number.parseFloat(parts[2] ?? "");
  return Number.isFinite(incl) ? incl : null;
}

function parseTleMeanMotion(tle2?: string): number | null {
  if (!tle2) return null;
  const parts = tle2.trim().split(/\s+/);
  const mm = Number.parseFloat(parts[7] ?? "");
  return Number.isFinite(mm) ? mm : null;
}

function estimatedPeriodMinutes(meanMotionRevPerDay: number | null): number | null {
  if (typeof meanMotionRevPerDay !== "number" || meanMotionRevPerDay <= 0) return null;
  return 1440 / meanMotionRevPerDay;
}

function flightSummaryRows(flight: Flight, id: string): SummaryRow[] {
  const country = inferFlightCountry({
    country: flight.country,
    icao: flight.icao,
    lat: flight.lat,
    lon: flight.lon,
  });

  const groundspeedKt =
    typeof flight.speedMs === "number" ? flight.speedMs * KTS_PER_MS : undefined;
  const baroAltFt =
    typeof flight.baroAltFt === "number"
      ? flight.baroAltFt
      : typeof flight.altM === "number"
        ? flight.altM * FT_PER_M
        : undefined;
  const geomAltFt =
    typeof flight.geomAltFt === "number"
      ? flight.geomAltFt
      : typeof flight.altM === "number"
        ? flight.altM * FT_PER_M
        : undefined;
  const vertRateFpm =
    typeof flight.vertRateFpm === "number"
      ? flight.vertRateFpm
      : typeof flight.vRate === "number"
        ? flight.vRate * FPM_PER_MS
        : undefined;
  const trackDeg =
    typeof flight.trackDeg === "number"
      ? flight.trackDeg
      : typeof flight.heading === "number"
        ? flight.heading
        : undefined;

  return [
    { key: "IDENTITY", value: "Flight identity and source details.", section: true },
    { key: "Callsign", value: flight.callsign ?? "n/a" },
    { key: "Registration", value: flight.registration ?? "n/a" },
    { key: "Country", value: country },
    { key: "ICAO", value: id },
    { key: "Type", value: flight.aircraftType ?? "n/a" },
    { key: "Type Description", value: flight.aircraftTypeDescription ?? "n/a" },
    { key: "Squawk", value: flight.squawk != null ? String(flight.squawk) : "n/a" },
    { key: "Route", value: flight.route ?? "n/a" },
    { key: "DB Flags", value: flight.dbFlags ?? "n/a" },
    { key: "Source", value: flight.source ?? (flight.isMilitary ? "Military ADS-B" : "ADS-B") },

    { key: "SPATIAL", value: "Current kinematics and position.", section: true },
    { key: "Groundspeed", value: fmt(groundspeedKt, " kt", 0) },
    { key: "Barometric Altitude", value: fmt(baroAltFt, " ft", 0) },
    { key: "WGS84 Altitude", value: fmt(geomAltFt, " ft", 0) },
    { key: "Vertical Rate", value: fmt(vertRateFpm, " ft/min", 0) },
    { key: "Track", value: fmt(trackDeg, "°", 1) },
    { key: "Position", value: fmtCoord(flight.lat, flight.lon) },
    { key: "On Ground", value: flight.onGround ? "yes" : "no" },

    { key: "SIGNAL", value: "Signal quality and recency.", section: true },
    { key: "RSSI", value: fmt(flight.rssi, "", 1) },
    { key: "Message Rate", value: fmt(flight.messageRate, " /s", 1) },
    { key: "Receivers", value: fmt(flight.receivers, "", 0) },
    { key: "Last Position", value: fmt(flight.lastPosSec, " s", 1) },
    { key: "Last Seen", value: fmt(flight.lastSeenSec, " s", 1) },

    { key: "FMS + WEATHER", value: "Selected settings and ambient data.", section: true },
    { key: "Selected Altitude", value: fmt(flight.selectedAltitudeFt, " ft", 0) },
    { key: "Selected Heading", value: fmt(flight.selectedHeadingDeg, "°", 1) },
    { key: "Wind Speed", value: fmt(flight.windSpeedKt, " kt", 0) },
    { key: "Wind Direction (from)", value: fmt(flight.windDirectionFromDeg, "°", 0) },
    { key: "TAT / OAT", value: `${fmt(flight.tatC, " °C", 1)} / ${fmt(flight.oatC, " °C", 1)}` },

    { key: "NAV + ACCURACY", value: "Navigation, category, and accuracy indicators.", section: true },
    { key: "Nav Modes", value: fmtList(flight.navModes) },
    { key: "ADS-B Version", value: flight.adsbVersion ?? "n/a" },
    { key: "Category", value: flight.category ?? "n/a" },
    { key: "NACP", value: flight.nacp ?? "n/a" },
    { key: "SIL", value: flight.sil ?? "n/a" },
    { key: "NACV", value: flight.nacv ?? "n/a" },
    { key: "NICBARO", value: flight.nicBaro ?? "n/a" },
    { key: "RC", value: fmt(flight.rcMeters, " m", 0) },
  ];
}

export default function InspectorDrawer() {
  const isMobile = useIsMobile();
  const inspector = useSIGINTStore((s) => s.dashboard.inspector);
  const setInspectorTab = useSIGINTStore((s) => s.setInspectorTab);
  const setInspectorPinned = useSIGINTStore((s) => s.setInspectorPinned);
  const setInspectorSplitView = useSIGINTStore((s) => s.setInspectorSplitView);
  const clearSelectionContext = useSIGINTStore((s) => s.clearSelectionContext);
  const setInspectorNote = useSIGINTStore((s) => s.setInspectorNote);
  const satUpdatedAt = useSIGINTStore((s) => s.liveData.lastUpdated.satellites);

  const entity = inspector.entity;

  const entityId = entity?.id ?? "";
  const noteValue = inspector.notes[entityId] ?? "";

  const summaryRows = useMemo<SummaryRow[]>(() => {
    if (!entity) return [];
    if (entity.type === "flight") {
      return flightSummaryRows(entity.data as Flight, entity.id);
    }
    if (entity.type === "satellite") {
      const sat = entity.data as Record<string, unknown>;
      const name = typeof sat.name === "string" ? sat.name : entity.id;
      const tle1 = typeof sat.tle1 === "string" ? sat.tle1 : undefined;
      const tle2 = typeof sat.tle2 === "string" ? sat.tle2 : undefined;
      const country =
        typeof sat.country === "string" && sat.country.trim()
          ? sat.country
          : inferSatelliteCountry(name);
      const altKm =
        typeof sat.altKm === "number" && Number.isFinite(sat.altKm)
          ? sat.altKm
          : null;
      const velocityKmS =
        typeof sat.velocityKmS === "number" && Number.isFinite(sat.velocityKmS)
          ? sat.velocityKmS
          : null;
      const sourceModeRaw =
        typeof sat.sourceMode === "string" && sat.sourceMode.trim()
          ? sat.sourceMode
          : null;
      const sourceMode =
        sourceModeRaw ??
        (altKm != null && tle1 && tle2
          ? "live+catalog"
          : altKm != null
            ? "live"
            : "catalog");
      const orbitClass =
        (typeof sat.isGeo === "boolean" && sat.isGeo) || (typeof altKm === "number" && altKm > 35_000)
          ? "GEO"
          : orbitClassFromAltitude(altKm) !== "Unknown"
            ? orbitClassFromAltitude(altKm)
            : orbitClassFromName(name);
      const inclination =
        typeof sat.inclinationDeg === "number" && Number.isFinite(sat.inclinationDeg)
          ? sat.inclinationDeg
          : parseTleInclination(tle2);
      const meanMotion = parseTleMeanMotion(tle2);
      const periodMinutes = estimatedPeriodMinutes(meanMotion);
      const tleEpoch = parseTleEpoch(tle1);
      const liveUpdated = satUpdatedAt ? formatUtc(satUpdatedAt) : formatUtc(Date.now());

      const purpose = inferSatellitePurpose(name);

      return [
        { key: "IDENTITY", value: "Satellite identity and data source coverage.", section: true },
        { key: "Object Name", value: name },
        { key: "NORAD ID", value: entity.id },
        { key: "Country", value: country },
        { key: "Use", value: purpose },
        { key: "Source Mode", value: sourceMode.toUpperCase() },

        { key: "ORBIT", value: "Estimated orbit class and derived motion values.", section: true },
        { key: "Orbit Class", value: orbitClass },
        { key: "GEO Flag", value: orbitClass === "GEO" ? "yes" : "no" },
        { key: "Inclination", value: fmt(inclination, "°", 2) },
        { key: "Mean Motion", value: fmt(meanMotion, " rev/day", 5) },
        { key: "Estimated Period", value: fmt(periodMinutes, " min", 1) },

        { key: "TELEMETRY", value: "Latest propagated position and kinematics.", section: true },
        { key: "Latitude / Longitude", value: fmtCoord(sat.lat as number, sat.lon as number) },
        { key: "Live Altitude", value: fmt(altKm, " km", 1) },
        { key: "Velocity", value: fmt(velocityKmS, " km/s", 3) },
        { key: "Last Updated", value: liveUpdated },

        { key: "TLE METADATA", value: "Catalog orbital element data (when available).", section: true },
        { key: "TLE Epoch", value: tleEpoch },
        { key: "TLE Line 1", value: tle1 ?? "n/a" },
        { key: "TLE Line 2", value: tle2 ?? "n/a" },
      ];
    }

    if (entity.type === "cctv") {
      const cam = entity.data as CctvCamera;
      return [
        { key: "CAMERA", value: "CCTV camera identity and location.", section: true },
        { key: "Name", value: cam.name ?? entity.id },
        { key: "City", value: cam.city ?? "n/a" },
        { key: "State", value: cam.state ?? "n/a" },
        { key: "Direction", value: cam.direction ?? "n/a" },
        { key: "Position", value: fmtCoord(cam.lat, cam.lon) },
        { key: "FEED", value: "Stream details and refresh interval.", section: true },
        { key: "Format", value: cam.streamFormat ?? "JPEG" },
        { key: "Refresh", value: `${cam.refreshSeconds ?? 60}s` },
      ];
    }

    const rows: SummaryRow[] = [
      { key: "TYPE", value: entity.type.toUpperCase() },
      { key: "ID", value: entity.id },
      { key: "UPDATED", value: formatUtc(Date.now()) },
    ];
    const raw = entity.data as Record<string, unknown>;
    for (const [key, value] of Object.entries(raw).slice(0, 20)) {
      if (value == null || typeof value === "object") continue;
      rows.push({ key: key.replace(/_/g, " ").toUpperCase(), value: String(value) });
    }
    return rows;
  }, [entity, satUpdatedAt]);

  const cctvCamera = entity?.type === "cctv" ? (entity.data as CctvCamera) : null;
  const openCctvFloating = useSIGINTStore((s) => s.openCctvFloating);
  const markCctvBroken = useSIGINTStore((s) => s.markCctvBroken);

  return (
    <aside
      className={`si-inspector ${inspector.open ? "is-open" : ""} ${inspector.splitView ? "is-split" : ""}`}
      aria-label="Inspector drawer"
    >
      <div className="si-inspector-header">
        <div>
          <div className="si-inspector-title">INSPECTOR</div>
          <div className="si-inspector-subtitle">{entity ? `${entity.type.toUpperCase()} / ${entity.id}` : "No selection"}</div>
        </div>
        <div className="si-inspector-actions">
          <Toggle checked={inspector.pinned} onChange={setInspectorPinned} label="Pin" />
          {featureFlags.enableInspectorSplitView && !isMobile ? (
            <Toggle checked={inspector.splitView} onChange={setInspectorSplitView} label="Split" />
          ) : null}
          <button type="button" className="si-inline-action" onClick={clearSelectionContext}>
            CLOSE
          </button>
        </div>
      </div>

      <PanelTabs
        value={inspector.tab}
        options={tabs as unknown as Array<{ value: typeof inspector.tab; label: string }>}
        onChange={(next) => setInspectorTab(next)}
      />

      <div className="si-inspector-body">
        {inspector.tab === "summary" && (
          <>
            <div className="si-inspector-grid">
              {summaryRows.map((row) => (
                <div key={`${row.key}-${row.value}`} className={`si-inspector-row ${row.section ? "is-section" : ""}`}>
                  <span>{row.key}</span>
                  <span title={row.value}>{row.value}</span>
                </div>
              ))}
            </div>
            {cctvCamera && (
              <div style={{ padding: "8px 12px" }}>
                <CctvFeedView
                  camera={cctvCamera}
                  compact
                  onSnapshotError={markCctvBroken}
                  onStreamError={markCctvBroken}
                />
                {!isMobile ? (
                  <button
                    type="button"
                    className="si-inline-action"
                    style={{
                      marginTop: 8,
                      width: "100%",
                      padding: "5px 0",
                      background: "rgba(0, 229, 255, 0.12)",
                      border: "1px solid rgba(0, 229, 255, 0.3)",
                      color: "#00e5ff",
                      borderRadius: 4,
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.05em",
                    }}
                    onClick={() => openCctvFloating(cctvCamera)}
                  >
                    POP OUT
                  </button>
                ) : null}
              </div>
            )}
          </>
        )}

        {inspector.tab === "history" && (
          <div className="si-inspector-list">
            <div>Tracking history trail: {entity ? "Available in globe layer" : "--"}</div>
            <div>Flight path state: {entity?.type === "flight" ? "Linked" : "Idle"}</div>
          </div>
        )}

        {inspector.tab === "related" && (
          <div className="si-inspector-list">
            <div>Related entities are resolved by layer and geographic proximity.</div>
            <div>Use row hover actions to pin/open additional context.</div>
          </div>
        )}

        {inspector.tab === "notes" && (
          <label className="si-inspector-notes">
            <span>Analyst Notes</span>
            <textarea
              value={noteValue}
              onChange={(event) => {
                if (!entityId) return;
                setInspectorNote(entityId, event.target.value);
              }}
              placeholder="Enter compact annotation"
            />
          </label>
        )}
      </div>
    </aside>
  );
}


