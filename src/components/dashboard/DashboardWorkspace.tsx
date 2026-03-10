"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useWorldViewStore } from "../../store";
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

export default function DashboardWorkspace({ embedded = false }: DashboardWorkspaceProps) {
  const liveData = useWorldViewStore((s) => s.liveData);
  const health = useWorldViewStore((s) => s.liveData.health);
  const sourceHealth = useWorldViewStore((s) => s.liveData.sourceHealth);
  const lastUpdated = useWorldViewStore((s) => s.liveData.lastUpdated);
  const panelVisibility = useWorldViewStore((s) => s.dashboard.panelVisibility);
  const panelLocks = useWorldViewStore((s) => s.dashboard.panelLocks);
  const setPanelVisibility = useWorldViewStore((s) => s.setPanelVisibility);
  const setPanelLock = useWorldViewStore((s) => s.setPanelLock);
  const bumpRefreshTick = useWorldViewStore((s) => s.bumpRefreshTick);
  const openInspector = useWorldViewStore((s) => s.openInspector);
  const pinEntity = useWorldViewStore((s) => s.pinEntity);
  const resetPanelLayouts = useWorldViewStore((s) => s.resetPanelLayouts);
  const [showViewMenu, setShowViewMenu] = useState(false);
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
            <div className="wv-kpi-strip">
              {kpis.map((tile) => (
                <article key={tile.id} className="wv-kpi-strip-item" title={`${tile.label}: ${tile.value}`}>
                  <div className="wv-kpi-strip-main">
                    <span className="wv-kpi-label">{tile.label}</span>
                    <span className="wv-kpi-value">{tile.value}</span>
                    <span className={`wv-kpi-delta ${tile.delta >= 0 ? "is-up" : "is-down"}`}>
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
              className="wv-feed-list"
              role="log"
              aria-label="Operations feed"
            >
              {feedItems.slice(0, 120).map((item) => (
                <div key={item.id} className={`wv-feed-item is-${item.level}`}>
                  <span>{new Date(item.ts).toISOString().slice(11, 19)}</span>
                  <strong>{item.source}</strong>
                  <span title={item.message}>{item.message}</span>
                </div>
              ))}
            </div>
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
            <div className="wv-feed-list" role="log" aria-label="Space weather feed">
              {spaceWeatherItems.length ? (
                spaceWeatherItems.map((item) => (
                  <div
                    key={item.id}
                    className={`wv-feed-item ${
                      item.level === "ALERT" ? "is-error" : item.level === "WARNING" ? "is-warn" : "is-info"
                    }`}
                  >
                    <span>{new Date(item.issueDatetime).toISOString().slice(11, 19)}</span>
                    <strong>{item.level}</strong>
                    <span title={item.title}>{item.title}</span>
                  </div>
                ))
              ) : (
                <div className="wv-feed-item is-warn">
                  <span>--:--:--</span>
                  <strong>INFO</strong>
                  <span>No SWPC alerts received yet.</span>
                </div>
              )}
            </div>
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

  return (
    <div className={`wv-dashboard-workspace ${embedded ? "is-embedded" : ""}`.trim()}>
      <div className="wv-dashboard-toolbar">
        <div className="wv-toolbar-status">DASHBOARD MODE / ULTRA WORKSTATION GRID / FREEFORM WINDOW MOVE</div>
        <div className="wv-toolbar-actions">
          <div className="wv-view-menu-wrap" ref={viewMenuRef}>
            <button
              type="button"
              className={`wv-inline-action ${showViewMenu ? "is-active" : ""}`}
              onClick={() => setShowViewMenu((open) => !open)}
              aria-expanded={showViewMenu}
            >
              VIEW WINDOWS
            </button>
            {showViewMenu ? (
              <div className="wv-view-menu" role="menu" aria-label="Toggle dashboard windows">
                {panelCatalog.map((panel) => (
                  <label key={panel.id} className="wv-view-menu-item">
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
          <button type="button" className="wv-inline-action" onClick={resetPanelLayouts}>
            RESET LAYOUT
          </button>
        </div>
      </div>
      {panelNodes.length ? (
        <DraggableDashboardGrid panels={panelNodes} />
      ) : (
        <div className="wv-dashboard-empty">No windows enabled. Open VIEW WINDOWS to add panels.</div>
      )}
    </div>
  );
}
