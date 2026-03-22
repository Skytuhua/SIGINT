"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useSIGINTStore } from "../../store";
import { useIsMobile } from "../../hooks/useIsMobile";
import DraggableDashboardGrid from "./DraggableDashboardGrid";
import Panel from "./panel/Panel";
import PanelBody from "./panel/PanelBody";
import PanelControls from "./panel/PanelControls";
import PanelFooter from "./panel/PanelFooter";
import PanelHeader from "./panel/PanelHeader";
import DataTable from "./table/DataTable";
import Sparkline from "./charts/Sparkline";
import LiveCctvPanel from "./LiveCctvPanel";
import MarketsPanel from "./MarketsPanel";
import PhoneOverlayShell from "../ui/PhoneOverlayShell";
import { formatNumber, formatUtc } from "../../lib/dashboard/format";
import {
  selectFeedItems,
  selectFlightRows,
  selectKpiTiles,
  selectQuakeRows,
  selectSatelliteRows,
  type FlightTableRow,
  type QuakeTableRow,
  type SatelliteRow,
} from "../../lib/dashboard/selectors";

interface DashboardWorkspaceProps {
  embedded?: boolean;
}

type MobileOverlayId =
  | "flight-table"
  | "quake-table"
  | "sat-list"
  | "feed"
  | "space-weather"
  | "threat-board"
  | "source-health"
  | null;

const MOBILE_PREVIEW_LIMITS = {
  "flight-table": 12,
  "quake-table": 12,
  "sat-list": 12,
  "feed": 8,
  "space-weather": 8,
  "threat-board": 8,
  "source-health": 8,
} as const;

export default function DashboardWorkspace({ embedded = false }: DashboardWorkspaceProps) {
  const liveData = useSIGINTStore((s) => s.liveData);
  const health = useSIGINTStore((s) => s.liveData.health);
  const sourceHealth = useSIGINTStore((s) => s.liveData.sourceHealth);
  const lastUpdated = useSIGINTStore((s) => s.liveData.lastUpdated);
  const panelVisibility = useSIGINTStore((s) => s.dashboard.panelVisibility);
  const panelLocks = useSIGINTStore((s) => s.dashboard.panelLocks);
  const setPanelVisibility = useSIGINTStore((s) => s.setPanelVisibility);
  const setPanelLock = useSIGINTStore((s) => s.setPanelLock);
  const bumpRefreshTick = useSIGINTStore((s) => s.bumpRefreshTick);
  const openInspector = useSIGINTStore((s) => s.openInspector);
  const pinEntity = useSIGINTStore((s) => s.pinEntity);
  const resetPanelLayouts = useSIGINTStore((s) => s.resetPanelLayouts);
  const isMobile = useIsMobile();
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [mobileOverlayId, setMobileOverlayId] = useState<MobileOverlayId>(null);
  const [mobileOverlayQuery, setMobileOverlayQuery] = useState("");
  const viewMenuRef = useRef<HTMLDivElement | null>(null);

  const kpis = useMemo(() => selectKpiTiles(liveData), [liveData]);
  const flightRows = useMemo(() => selectFlightRows(liveData), [liveData]);
  const quakeRows = useMemo(() => selectQuakeRows(liveData), [liveData]);
  const satRows = useMemo(() => selectSatelliteRows(liveData), [liveData]);
  const feedItems = useMemo(() => selectFeedItems(liveData), [liveData]);
  const spaceWeatherItems = useMemo(
    () =>
      [...(liveData.spaceWeather ?? [])]
        .sort((a, b) => b.issueDatetime - a.issueDatetime)
        .slice(0, 40),
    [liveData.spaceWeather]
  );

  const threatItems = useMemo(() => {
    const items: Array<{ id: string; source: string; title: string; ts: number; level: "error" | "warn" }> = [];
    for (const eq of liveData.earthquakes ?? []) {
      if (eq.mag >= 5.0) {
        items.push({
          id: `eq-${eq.id}`, source: "USGS",
          title: `M${eq.mag.toFixed(1)} — ${eq.place}`, ts: eq.time, level: "error",
        });
      }
    }
    for (const d of liveData.disasters ?? []) {
      if (d.alertLevel === "Orange" || d.alertLevel === "Red") {
        items.push({
          id: `dis-${d.id}`, source: "GDACS",
          title: d.title, ts: d.updatedAt ?? Date.now(), level: d.alertLevel === "Red" ? "error" : "warn",
        });
      }
    }
    for (const sw of liveData.spaceWeather ?? []) {
      if (sw.level === "ALERT" || sw.level === "WARNING") {
        items.push({
          id: `sw-${sw.id}`, source: "SWPC",
          title: sw.title, ts: sw.issueDatetime, level: sw.level === "ALERT" ? "error" : "warn",
        });
      }
    }
    return items.sort((a, b) => b.ts - a.ts).slice(0, 120);
  }, [liveData.earthquakes, liveData.disasters, liveData.spaceWeather]);

  useEffect(() => {
    setMobileOverlayQuery("");
  }, [mobileOverlayId]);

  const overlayFlightRows = useMemo(() => {
    const query = mobileOverlayQuery.trim().toLowerCase();
    if (!query) return flightRows;
    return flightRows.filter((row) =>
      `${row.callsign} ${row.type} ${row.country} ${row.speed} ${row.heading} ${row.alt}`.toLowerCase().includes(query)
    );
  }, [flightRows, mobileOverlayQuery]);

  const overlayQuakeRows = useMemo(() => {
    const query = mobileOverlayQuery.trim().toLowerCase();
    if (!query) return quakeRows;
    return quakeRows.filter((row) =>
      `${row.place} ${row.mag} ${row.depthKm} ${formatUtc(row.ts)}`.toLowerCase().includes(query)
    );
  }, [quakeRows, mobileOverlayQuery]);

  const overlaySatRows = useMemo(() => {
    const query = mobileOverlayQuery.trim().toLowerCase();
    if (!query) return satRows;
    return satRows.filter((row) =>
      `${row.name} ${row.noradId} ${row.orbitClass} ${row.country} ${row.liveAltitudeKm ?? ""}`.toLowerCase().includes(query)
    );
  }, [satRows, mobileOverlayQuery]);

  const flightColumns = useMemo<ColumnDef<FlightTableRow>[]>(
    () => [
      {
        id: "callsign",
        header: "CALLSIGN",
        accessorKey: "callsign",
        size: 126,
      },
      {
        id: "type",
        header: "AIRCRAFT TYPE",
        accessorKey: "type",
        size: 120,
      },
      {
        id: "country",
        header: "COUNTRY",
        accessorKey: "country",
        size: 126,
      },
      {
        id: "speed",
        header: "SPEED",
        accessorKey: "speed",
        size: 90,
        meta: {
          numeric: true,
          align: "right",
          deltaAccessor: (row: FlightTableRow) => row.delta,
        },
      },
      {
        id: "heading",
        header: "HEADING",
        accessorKey: "heading",
        size: 86,
        meta: {
          numeric: true,
          align: "right",
        },
      },
      {
        id: "alt",
        header: "ALTITUDE",
        accessorKey: "alt",
        size: 110,
        meta: {
          numeric: true,
          align: "right",
          heatAccessor: (row: FlightTableRow) => row.heat,
          heatRange: [0, 1],
        },
      },
    ],
    []
  );

  const quakeColumns = useMemo<ColumnDef<QuakeTableRow>[]>(
    () => [
      {
        id: "place",
        header: "LOCATION",
        accessorKey: "place",
        size: 250,
      },
      {
        id: "mag",
        header: "MAGNITUDE",
        accessorKey: "mag",
        size: 108,
        meta: {
          numeric: true,
          align: "right",
          heatAccessor: (row: QuakeTableRow) => row.mag,
          heatRange: [0, 8],
          deltaAccessor: (row: QuakeTableRow) => row.delta,
        },
      },
      {
        id: "depth",
        header: "DEPTH (KM)",
        accessorFn: (row) => formatNumber(row.depthKm, 1),
        size: 108,
        meta: {
          numeric: true,
          align: "right",
        },
      },
      {
        id: "time",
        header: "UPDATED (UTC)",
        accessorFn: (row) => formatUtc(row.ts),
        size: 148,
      },
    ],
    []
  );

  const satColumns = useMemo<ColumnDef<SatelliteRow>[]>(
    () => [
      {
        id: "name",
        header: "OBJECT NAME",
        accessorKey: "name",
        size: 220,
      },
      {
        id: "noradId",
        header: "NORAD ID",
        accessorKey: "noradId",
        size: 92,
      },
      {
        id: "orbitClass",
        header: "ORBIT CLASS",
        accessorKey: "orbitClass",
        size: 114,
      },
      {
        id: "country",
        header: "COUNTRY",
        accessorKey: "country",
        size: 126,
      },
      {
        id: "liveAltitudeKm",
        header: "LIVE ALTITUDE (KM)",
        accessorFn: (row) =>
          typeof row.liveAltitudeKm === "number" ? formatNumber(row.liveAltitudeKm, 1) : "--",
        size: 140,
        meta: {
          numeric: true,
          align: "right",
          deltaAccessor: (row: SatelliteRow) => row.delta,
          heatAccessor: (row: SatelliteRow) => row.referenceAltitudeKm,
          heatRange: [0, 36000],
        },
      },
    ],
    []
  );

  const anyLoading = Object.values(health).some((state) => state === "loading");
  const sourceHealthValues = Object.values(sourceHealth ?? {});
  const degradedCount = sourceHealthValues.filter((state) => state.status === "degraded").length;
  const unavailableCount = sourceHealthValues.filter((state) => state.status === "unavailable").length;
  const opsFeedHealth: "ok" | "loading" | "stale" | "error" =
    unavailableCount > 0 ? "error" : degradedCount > 0 ? "stale" : anyLoading ? "loading" : "ok";
  const opsFeedMessage =
    unavailableCount > 0
      ? `${unavailableCount} source${unavailableCount === 1 ? "" : "s"} unavailable.`
      : degradedCount > 0
      ? `${degradedCount} source${degradedCount === 1 ? "" : "s"} degraded (stale fallback active).`
      : "Newest events are shown first.";

  const panelCatalog = [
    { id: "kpi", label: "System Snapshot" },
    { id: "flight-table", label: "Air Traffic Matrix" },
    { id: "quake-table", label: "Seismic Heat Table" },
    { id: "sat-list", label: "Satellite List" },
    { id: "feed", label: "Ops Feed" },
    { id: "cctv-live", label: "Live Webcams" },
    { id: "space-weather", label: "Space Weather" },
    { id: "threat-board", label: "Threat Board" },
    { id: "source-health", label: "Data Sources" },
  ] as const;

  const lockHeaderProps = (panelId: string) => ({
    locked: panelLocks[panelId] === true,
    onToggleLock: () => setPanelLock(panelId, !(panelLocks[panelId] === true)),
  });

  const panelNodes = [
    {
      id: "kpi",
      node: (
        <Panel panelId="kpi">
          <PanelHeader
            title="SYSTEM SNAPSHOT"
            subtitle="At-a-glance counts for active feeds and entities."
            {...lockHeaderProps("kpi")}
            controls={
              <PanelControls
                onRefresh={bumpRefreshTick}
                loading={anyLoading}
                refreshText="REFRESH METRICS"
                refreshLoadingText="UPDATING"
              />
            }
          />
          <PanelBody>
            <div className="si-kpi-strip">
              {kpis.map((tile) => (
                <article key={tile.id} className="si-kpi-strip-item" title={`${tile.label}: ${tile.value}`}>
                  <div className="si-kpi-strip-main">
                    <span className="si-kpi-label">{tile.label}</span>
                    <span className="si-kpi-value">{tile.value}</span>
                    <span className={`si-kpi-delta ${tile.delta >= 0 ? "is-up" : "is-down"}`}>
                      {tile.delta >= 0 ? "UP" : "DOWN"} {Math.abs(tile.delta).toFixed(1)}%
                    </span>
                  </div>
                  <Sparkline values={tile.trend} width="100%" height={12} />
                </article>
              ))}
            </div>
          </PanelBody>
          <PanelFooter
            source="All feeds"
            updatedAt={Date.now()}
            health={anyLoading ? "loading" : "ok"}
            message="Snapshot refreshes automatically while feeds stream."
          />
        </Panel>
      ),
    },
    {
      id: "flight-table",
      node: (
        <Panel panelId="flight-table">
          <PanelHeader
            title="AIR TRAFFIC MATRIX"
            subtitle="Live flights with speed, altitude, heading, and region context."
            {...lockHeaderProps("flight-table")}
            controls={
              <PanelControls
                onRefresh={bumpRefreshTick}
                loading={health.opensky === "loading" || health.military === "loading"}
                refreshText="REFRESH FLIGHTS"
                refreshLoadingText="UPDATING"
              />
            }
          />
          <PanelBody noPadding>
            {isMobile ? (
              <div className="si-ops-mobile-list" role="list">
                {flightRows.length ? (
                  flightRows.slice(0, MOBILE_PREVIEW_LIMITS["flight-table"]).map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className="si-ops-mobile-row"
                      onClick={() => openInspector(row.entity)}
                      role="listitem"
                    >
                      <span className="si-ops-mobile-row-title">{row.callsign}</span>
                      <span className="si-ops-mobile-row-subtitle">{row.type} / {row.country} / {row.speed} / HDG {row.heading} / {row.alt}</span>
                    </button>
                  ))
                ) : (
                  <div className="si-ops-mobile-empty">No live flight rows available</div>
                )}
                {flightRows.length > MOBILE_PREVIEW_LIMITS["flight-table"] ? (
                  <button
                    type="button"
                    className="si-phone-overlay-action"
                    style={{ width: "100%", minHeight: 44 }}
                    onClick={() => setMobileOverlayId("flight-table")}
                  >
                    Open Full List
                  </button>
                ) : null}
              </div>
            ) : (
              <DataTable
                tableId="flight-table"
                data={flightRows}
                columns={flightColumns}
                bodyHeight="100%"
                stickyFirstColumn
                getRowId={(row) => row.id}
                onRowClick={(row) => openInspector(row.entity)}
                rowActionColumnIndex={0}
                onRowPin={(row) => pinEntity(row.entity)}
                onRowOpenDetail={(row) => openInspector(row.entity, true)}
                searchPlaceholder="Search callsign, country, type, speed, heading"
                searchHelpText="Global search across all flight columns."
                enableColumnFilters
                emptyMessage="No live flight rows available"
              />
            )}
          </PanelBody>
          <PanelFooter
            source="OpenSky + ADS-B"
            updatedAt={lastUpdated.opensky}
            health={health.opensky}
            message="Click a callsign to open details in the Inspector."
          />
        </Panel>
      ),
    },
    {
      id: "quake-table",
      node: (
        <Panel panelId="quake-table">
          <PanelHeader
            title="SEISMIC HEAT TABLE"
            subtitle="Recent earthquakes sorted by strongest magnitude first."
            {...lockHeaderProps("quake-table")}
            controls={
              <PanelControls
                onRefresh={bumpRefreshTick}
                loading={health.earthquakes === "loading"}
                refreshText="REFRESH EARTHQUAKES"
                refreshLoadingText="UPDATING"
              />
            }
          />
          <PanelBody noPadding>
            {isMobile ? (
              <div className="si-ops-mobile-list" role="list">
                {quakeRows.length ? (
                  quakeRows.slice(0, MOBILE_PREVIEW_LIMITS["quake-table"]).map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className="si-ops-mobile-row"
                      onClick={() => openInspector(row.entity)}
                      role="listitem"
                    >
                      <span className="si-ops-mobile-row-title">{row.place}</span>
                      <span className="si-ops-mobile-row-subtitle">M{row.mag.toFixed(1)} / {formatNumber(row.depthKm, 1)} km / {formatUtc(row.ts)}</span>
                    </button>
                  ))
                ) : (
                  <div className="si-ops-mobile-empty">No recent seismic activity</div>
                )}
                {quakeRows.length > MOBILE_PREVIEW_LIMITS["quake-table"] ? (
                  <button
                    type="button"
                    className="si-phone-overlay-action"
                    style={{ width: "100%", minHeight: 44 }}
                    onClick={() => setMobileOverlayId("quake-table")}
                  >
                    Open Full List
                  </button>
                ) : null}
              </div>
            ) : (
              <DataTable
                tableId="quake-table"
                data={quakeRows}
                columns={quakeColumns}
                bodyHeight="100%"
                stickyFirstColumn
                getRowId={(row) => row.id}
                onRowClick={(row) => openInspector(row.entity)}
                rowActionColumnIndex={0}
                onRowOpenDetail={(row) => openInspector(row.entity, true)}
                searchPlaceholder="Search location, magnitude, depth, or timestamp"
                searchHelpText="Global search across all earthquake columns."
                enableColumnFilters
                emptyMessage="No recent seismic activity"
              />
            )}
          </PanelBody>
          <PanelFooter
            source="USGS"
            updatedAt={lastUpdated.earthquakes}
            health={health.earthquakes}
            message="Magnitude and depth values are displayed in fixed units."
          />
        </Panel>
      ),
    },
    {
      id: "sat-list",
      node: (
        <Panel panelId="sat-list">
          <PanelHeader
            title="SATELLITE LIST"
            subtitle="Catalog-wide index with orbit class and live altitude when available."
            {...lockHeaderProps("sat-list")}
            controls={
              <PanelControls
                onRefresh={bumpRefreshTick}
                loading={health.satellites === "loading"}
                refreshText="REFRESH SATELLITES"
                refreshLoadingText="UPDATING"
              />
            }
          />
          <PanelBody noPadding>
            {isMobile ? (
              <div className="si-ops-mobile-list" role="list">
                {satRows.length ? (
                  satRows.slice(0, MOBILE_PREVIEW_LIMITS["sat-list"]).map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className="si-ops-mobile-row"
                      onClick={() => openInspector(row.entity)}
                      role="listitem"
                    >
                      <span className="si-ops-mobile-row-title">{row.name}</span>
                      <span className="si-ops-mobile-row-subtitle">
                        {row.orbitClass} / {row.country} / NORAD {row.noradId} / {typeof row.liveAltitudeKm === "number"
                          ? `${formatNumber(row.liveAltitudeKm, 1)} km`
                          : "Catalog altitude"}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="si-ops-mobile-empty">No satellite catalog rows yet</div>
                )}
                {satRows.length > MOBILE_PREVIEW_LIMITS["sat-list"] ? (
                  <button
                    type="button"
                    className="si-phone-overlay-action"
                    style={{ width: "100%", minHeight: 44 }}
                    onClick={() => setMobileOverlayId("sat-list")}
                  >
                    Open Full List
                  </button>
                ) : null}
              </div>
            ) : (
              <DataTable
                tableId="sat-list"
                data={satRows}
                columns={satColumns}
                bodyHeight="100%"
                stickyFirstColumn
                getRowId={(row) => row.id}
                onRowClick={(row) => openInspector(row.entity)}
                rowActionColumnIndex={0}
                onRowOpenDetail={(row) => openInspector(row.entity, true)}
                searchPlaceholder="Search object name, NORAD ID, country, orbit class"
                searchHelpText="Catalog rows are merged with live propagated altitude when present."
                enableColumnFilters
                emptyMessage="No satellite catalog rows yet"
              />
            )}
          </PanelBody>
          <PanelFooter
            source="CelesTrak"
            updatedAt={lastUpdated.satellites}
            health={health.satellites}
            message="Catalog view is capped and virtualized for speed."
          />
        </Panel>
      ),
    },
    {
      id: "feed",
      node: (
        <Panel panelId="feed">
          <PanelHeader
            title="OPS FEED"
            subtitle="Latest ingestion and system messages in timestamp order."
            {...lockHeaderProps("feed")}
            controls={<PanelControls onRefresh={bumpRefreshTick} refreshText="REFRESH EVENTS" />}
          />
          <PanelBody>
            <div
              className="si-feed-list"
              role="log"
              aria-label="Operations feed"
            >
              {feedItems.slice(0, isMobile ? MOBILE_PREVIEW_LIMITS["feed"] : 120).map((item) => (
                <div key={item.id} className={`si-feed-item is-${item.level}`}>
                  <span>{new Date(item.ts).toISOString().slice(11, 19)}</span>
                  <strong>{item.source}</strong>
                  <span title={item.message}>{item.message}</span>
                </div>
              ))}
            </div>
            {isMobile && feedItems.length > MOBILE_PREVIEW_LIMITS["feed"] ? (
              <button
                type="button"
                className="si-phone-overlay-action"
                style={{ width: "100%", minHeight: 44, marginTop: 8 }}
                onClick={() => setMobileOverlayId("feed")}
              >
                Open Full List
              </button>
            ) : null}
          </PanelBody>
          <PanelFooter
            source="Internal event stream"
            updatedAt={Date.now()}
            health={opsFeedHealth}
            message={opsFeedMessage}
          />
        </Panel>
      ),
    },
    {
      id: "cctv-live",
      node: (
        <LiveCctvPanel
          panelId="cctv-live"
          cameras={liveData.cctv}
          lockHeaderProps={lockHeaderProps("cctv-live")}
          onRefresh={bumpRefreshTick}
          loading={health.cctv === "loading"}
        />
      ),
    },
    {
      id: "space-weather",
      node: (
        <Panel panelId="space-weather">
          <PanelHeader
            title="SPACE WEATHER"
            subtitle="Latest NOAA SWPC bulletins and operational levels."
            {...lockHeaderProps("space-weather")}
            controls={
              <PanelControls
                onRefresh={bumpRefreshTick}
                loading={health.spaceWeather === "loading"}
                refreshText="REFRESH SWPC"
                refreshLoadingText="UPDATING"
              />
            }
          />
          <PanelBody>
            <div className="si-feed-list" role="log" aria-label="Space weather feed">
              {spaceWeatherItems.length ? (
                spaceWeatherItems.slice(0, isMobile ? MOBILE_PREVIEW_LIMITS["space-weather"] : 40).map((item) => (
                  <div
                    key={item.id}
                    className={`si-feed-item ${
                      item.level === "ALERT" ? "is-error" : item.level === "WARNING" ? "is-warn" : "is-info"
                    }`}
                  >
                    <span>{new Date(item.issueDatetime).toISOString().slice(11, 19)}</span>
                    <strong>{item.level}</strong>
                    <span title={item.title}>{item.title}</span>
                  </div>
                ))
              ) : (
                <div className="si-feed-item is-warn">
                  <span>--:--:--</span>
                  <strong>INFO</strong>
                  <span>No SWPC alerts received yet.</span>
                </div>
              )}
            </div>
            {isMobile && spaceWeatherItems.length > MOBILE_PREVIEW_LIMITS["space-weather"] ? (
              <button
                type="button"
                className="si-phone-overlay-action"
                style={{ width: "100%", minHeight: 44, marginTop: 8 }}
                onClick={() => setMobileOverlayId("space-weather")}
              >
                Open Full List
              </button>
            ) : null}
          </PanelBody>
          <PanelFooter
            source="NOAA SWPC"
            updatedAt={lastUpdated.spaceWeather}
            health={health.spaceWeather}
            message="Levels: ALERT / WARNING / WATCH / INFO."
          />
        </Panel>
      ),
    },
    {
      id: "markets",
      node: (
        <Panel panelId="markets">
          <MarketsPanel />
        </Panel>
      ),
    },
    {
      id: "threat-board",
      node: (
        <Panel panelId="threat-board">
          <PanelHeader
            title="THREAT BOARD"
            subtitle="Unified high-severity alerts from all data feeds."
            {...lockHeaderProps("threat-board")}
            controls={<PanelControls onRefresh={bumpRefreshTick} refreshText="REFRESH" />}
          />
          <PanelBody>
            <div className="si-feed-list" role="log" aria-label="Threat board">
              {threatItems.length ? (
                threatItems.slice(0, isMobile ? MOBILE_PREVIEW_LIMITS["threat-board"] : 120).map((item) => (
                  <div key={item.id} className={`si-feed-item is-${item.level}`}>
                    <span>{new Date(item.ts).toISOString().slice(11, 19)}</span>
                    <strong>{item.source}</strong>
                    <span title={item.title}>{item.title}</span>
                  </div>
                ))
              ) : (
                <div className="si-feed-item is-info">
                  <span>--:--:--</span>
                  <strong>INFO</strong>
                  <span>No high-severity alerts active.</span>
                </div>
              )}
            </div>
            {isMobile && threatItems.length > MOBILE_PREVIEW_LIMITS["threat-board"] ? (
              <button
                type="button"
                className="si-phone-overlay-action"
                style={{ width: "100%", minHeight: 44, marginTop: 8 }}
                onClick={() => setMobileOverlayId("threat-board")}
              >
                Open Full List
              </button>
            ) : null}
          </PanelBody>
          <PanelFooter
            source="USGS + GDACS + SWPC"
            updatedAt={Date.now()}
            health={threatItems.some((t) => t.level === "error") ? "stale" : "ok"}
            message={`${threatItems.length} active high-severity alert${threatItems.length === 1 ? "" : "s"}.`}
          />
        </Panel>
      ),
    },
    {
      id: "source-health",
      node: (
        <Panel panelId="source-health">
          <PanelHeader
            title="DATA SOURCES"
            subtitle="Health status of all operational data feeds."
            {...lockHeaderProps("source-health")}
            controls={<PanelControls onRefresh={bumpRefreshTick} refreshText="REFRESH" />}
          />
          <PanelBody>
            <div className="si-feed-list" role="log" aria-label="Data sources health">
              {Object.entries(sourceHealth ?? {}).length ? (
                Object.entries(sourceHealth ?? {}).slice(0, isMobile ? MOBILE_PREVIEW_LIMITS["source-health"] : undefined).map(([name, state]) => {
                  const statusColor =
                    state.status === "live" ? "#69f0ae"
                    : state.status === "cached" ? "#4fc3f7"
                    : state.status === "degraded" ? "#ffc107"
                    : "#ff5252";
                  const level =
                    state.status === "unavailable" ? "error"
                    : state.status === "degraded" ? "warn"
                    : "info";
                  return (
                    <div key={name} className={`si-feed-item is-${level}`}>
                      <span style={{ color: statusColor, fontWeight: 700 }}>{"\u25CF"}</span>
                      <strong>{name.toUpperCase()}</strong>
                      <span>
                        {state.status.toUpperCase()}
                        {state.lastSuccessAt
                          ? ` — last ok ${new Date(state.lastSuccessAt).toISOString().slice(11, 19)}`
                          : ""}
                        {state.errorCode ? ` [${state.errorCode}]` : ""}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="si-feed-item is-info">
                  <span>--:--:--</span>
                  <strong>INFO</strong>
                  <span>No source health data available yet.</span>
                </div>
              )}
            </div>
            {isMobile && Object.entries(sourceHealth ?? {}).length > MOBILE_PREVIEW_LIMITS["source-health"] ? (
              <button
                type="button"
                className="si-phone-overlay-action"
                style={{ width: "100%", minHeight: 44, marginTop: 8 }}
                onClick={() => setMobileOverlayId("source-health")}
              >
                Open Full List
              </button>
            ) : null}
          </PanelBody>
          <PanelFooter
            source="SYSTEM"
            updatedAt={Date.now()}
            health={
              Object.values(sourceHealth ?? {}).some((s) => s.status === "unavailable")
                ? "error"
                : Object.values(sourceHealth ?? {}).some((s) => s.status === "degraded")
                ? "stale"
                : "ok"
            }
            message="Shows real-time status of each external data feed."
          />
        </Panel>
      ),
    },
  ].filter((panel) => panelVisibility[panel.id] !== false);

  useEffect(() => {
    if (!showViewMenu) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (viewMenuRef.current?.contains(target)) return;
      setShowViewMenu(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowViewMenu(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showViewMenu]);

  const mobileOverlayTitle =
    mobileOverlayId === "flight-table"
      ? "Air Traffic Matrix"
      : mobileOverlayId === "quake-table"
        ? "Seismic Heat Table"
        : mobileOverlayId === "sat-list"
          ? "Satellite List"
          : mobileOverlayId === "feed"
            ? "Ops Feed"
            : mobileOverlayId === "space-weather"
              ? "Space Weather"
              : mobileOverlayId === "threat-board"
                ? "Threat Board"
                : mobileOverlayId === "source-health"
                  ? "Data Sources"
                  : "";

  const mobileOverlayBody = mobileOverlayId === "flight-table" ? (
    <div style={{ display: "grid", gap: 10 }}>
      <input
        type="text"
        value={mobileOverlayQuery}
        onChange={(event) => setMobileOverlayQuery(event.target.value)}
        placeholder="Search callsign, type, country, speed..."
        style={{
          width: "100%",
          minHeight: 44,
          padding: "0 12px",
          fontSize: 12,
          background: "#0d1521",
          color: "#ddd",
          border: "1px solid #243246",
        }}
      />
      <div className="si-ops-mobile-list" role="list">
        {overlayFlightRows.length ? (
          overlayFlightRows.map((row) => (
            <button
              key={row.id}
              type="button"
              className="si-ops-mobile-row"
              onClick={() => {
                openInspector(row.entity);
                setMobileOverlayId(null);
              }}
              role="listitem"
            >
              <span className="si-ops-mobile-row-title">{row.callsign}</span>
              <span className="si-ops-mobile-row-subtitle">{row.type} / {row.country} / {row.speed} / HDG {row.heading} / {row.alt}</span>
            </button>
          ))
        ) : (
          <div className="si-ops-mobile-empty">No live flight rows available</div>
        )}
      </div>
    </div>
  ) : mobileOverlayId === "quake-table" ? (
    <div style={{ display: "grid", gap: 10 }}>
      <input
        type="text"
        value={mobileOverlayQuery}
        onChange={(event) => setMobileOverlayQuery(event.target.value)}
        placeholder="Search location, magnitude, depth..."
        style={{
          width: "100%",
          minHeight: 44,
          padding: "0 12px",
          fontSize: 12,
          background: "#0d1521",
          color: "#ddd",
          border: "1px solid #243246",
        }}
      />
      <div className="si-ops-mobile-list" role="list">
        {overlayQuakeRows.length ? (
          overlayQuakeRows.map((row) => (
            <button
              key={row.id}
              type="button"
              className="si-ops-mobile-row"
              onClick={() => {
                openInspector(row.entity);
                setMobileOverlayId(null);
              }}
              role="listitem"
            >
              <span className="si-ops-mobile-row-title">{row.place}</span>
              <span className="si-ops-mobile-row-subtitle">M{row.mag.toFixed(1)} / {formatNumber(row.depthKm, 1)} km / {formatUtc(row.ts)}</span>
            </button>
          ))
        ) : (
          <div className="si-ops-mobile-empty">No recent seismic activity</div>
        )}
      </div>
    </div>
  ) : mobileOverlayId === "sat-list" ? (
    <div style={{ display: "grid", gap: 10 }}>
      <input
        type="text"
        value={mobileOverlayQuery}
        onChange={(event) => setMobileOverlayQuery(event.target.value)}
        placeholder="Search object name, NORAD, country..."
        style={{
          width: "100%",
          minHeight: 44,
          padding: "0 12px",
          fontSize: 12,
          background: "#0d1521",
          color: "#ddd",
          border: "1px solid #243246",
        }}
      />
      <div className="si-ops-mobile-list" role="list">
        {overlaySatRows.length ? (
          overlaySatRows.map((row) => (
            <button
              key={row.id}
              type="button"
              className="si-ops-mobile-row"
              onClick={() => {
                openInspector(row.entity);
                setMobileOverlayId(null);
              }}
              role="listitem"
            >
              <span className="si-ops-mobile-row-title">{row.name}</span>
              <span className="si-ops-mobile-row-subtitle">
                {row.orbitClass} / {row.country} / NORAD {row.noradId} / {typeof row.liveAltitudeKm === "number"
                  ? `${formatNumber(row.liveAltitudeKm, 1)} km`
                  : "Catalog altitude"}
              </span>
            </button>
          ))
        ) : (
          <div className="si-ops-mobile-empty">No satellite catalog rows yet</div>
        )}
      </div>
    </div>
  ) : mobileOverlayId === "feed" ? (
    <div className="si-feed-list" role="log" aria-label="Operations feed">
      {feedItems.map((item) => (
        <div key={item.id} className={`si-feed-item is-${item.level}`}>
          <span>{new Date(item.ts).toISOString().slice(11, 19)}</span>
          <strong>{item.source}</strong>
          <span title={item.message}>{item.message}</span>
        </div>
      ))}
    </div>
  ) : mobileOverlayId === "space-weather" ? (
    <div className="si-feed-list" role="log" aria-label="Space weather feed">
      {spaceWeatherItems.length ? (
        spaceWeatherItems.map((item) => (
          <div
            key={item.id}
            className={`si-feed-item ${
              item.level === "ALERT" ? "is-error" : item.level === "WARNING" ? "is-warn" : "is-info"
            }`}
          >
            <span>{new Date(item.issueDatetime).toISOString().slice(11, 19)}</span>
            <strong>{item.level}</strong>
            <span title={item.title}>{item.title}</span>
          </div>
        ))
      ) : (
        <div className="si-feed-item is-warn">
          <span>--:--:--</span>
          <strong>INFO</strong>
          <span>No SWPC alerts received yet.</span>
        </div>
      )}
    </div>
  ) : mobileOverlayId === "threat-board" ? (
    <div className="si-feed-list" role="log" aria-label="Threat board">
      {threatItems.length ? (
        threatItems.map((item) => (
          <div key={item.id} className={`si-feed-item is-${item.level}`}>
            <span>{new Date(item.ts).toISOString().slice(11, 19)}</span>
            <strong>{item.source}</strong>
            <span title={item.title}>{item.title}</span>
          </div>
        ))
      ) : (
        <div className="si-feed-item is-info">
          <span>--:--:--</span>
          <strong>INFO</strong>
          <span>No high-severity alerts active.</span>
        </div>
      )}
    </div>
  ) : mobileOverlayId === "source-health" ? (
    <div className="si-feed-list" role="log" aria-label="Data sources health">
      {Object.entries(sourceHealth ?? {}).length ? (
        Object.entries(sourceHealth ?? {}).map(([name, state]) => {
          const statusColor =
            state.status === "live"
              ? "#69f0ae"
              : state.status === "cached"
                ? "#4fc3f7"
                : state.status === "degraded"
                  ? "#ffc107"
                  : "#ff5252";
          const level =
            state.status === "unavailable"
              ? "error"
              : state.status === "degraded"
                ? "warn"
                : "info";
          return (
            <div key={name} className={`si-feed-item is-${level}`}>
              <span style={{ color: statusColor, fontWeight: 700 }}>{"\u25CF"}</span>
              <strong>{name.toUpperCase()}</strong>
              <span>
                {state.status.toUpperCase()}
                {state.lastSuccessAt ? ` - last ok ${new Date(state.lastSuccessAt).toISOString().slice(11, 19)}` : ""}
                {state.errorCode ? ` [${state.errorCode}]` : ""}
              </span>
            </div>
          );
        })
      ) : (
        <div className="si-feed-item is-info">
          <span>--:--:--</span>
          <strong>INFO</strong>
          <span>No source health data available yet.</span>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className={`si-dashboard-workspace ${embedded ? "is-embedded" : ""}`.trim()}>
      {!isMobile ? (
        <div className="si-dashboard-toolbar">
          <div className="si-toolbar-status">DASHBOARD MODE / ULTRA WORKSTATION GRID / FREEFORM WINDOW MOVE</div>
          <div className="si-toolbar-actions">
            <div className="si-view-menu-wrap" ref={viewMenuRef}>
              <button
                type="button"
                className={`si-inline-action ${showViewMenu ? "is-active" : ""}`}
                onClick={() => setShowViewMenu((open) => !open)}
                aria-expanded={showViewMenu}
              >
                VIEW WINDOWS
              </button>
              {showViewMenu ? (
                <div className="si-view-menu" role="menu" aria-label="Toggle dashboard windows">
                  {panelCatalog.map((panel) => (
                    <label key={panel.id} className="si-view-menu-item">
                      <input
                        type="checkbox"
                        checked={panelVisibility[panel.id] !== false}
                        onChange={(event) => setPanelVisibility(panel.id, event.target.checked)}
                      />
                      <span>{panel.label}</span>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
            <button type="button" className="si-inline-action" onClick={resetPanelLayouts}>
              RESET LAYOUT
            </button>
          </div>
        </div>
      ) : null}
      {panelNodes.length ? (
        <DraggableDashboardGrid panels={panelNodes} />
      ) : (
        <div className="si-dashboard-empty">No windows enabled. Open VIEW WINDOWS to add panels.</div>
      )}
      {isMobile && mobileOverlayId ? (
        <PhoneOverlayShell title={mobileOverlayTitle} onClose={() => setMobileOverlayId(null)}>
          {mobileOverlayBody}
        </PhoneOverlayShell>
      ) : null}
    </div>
  );
}
