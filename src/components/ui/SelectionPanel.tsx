"use client";

import { useState, useEffect } from "react";
import { useWorldViewStore } from "../../store";
import type { PropagatedSat, Flight, Earthquake, CctvCamera } from "../../lib/providers/types";
import type { NormalizedNewsItem } from "../../lib/news/types";

const panel: React.CSSProperties = {
  position: "absolute",
  bottom: 56,
  left: "50%",
  transform: "translateX(-50%)",
  minWidth: 360,
  maxWidth: 560,
  background: "rgba(4, 10, 18, 0.88)",
  border: "1px solid rgba(79, 195, 247, 0.28)",
  borderRadius: 14,
  padding: "12px 14px",
  fontFamily:
    'var(--font-tech-mono), ui-monospace, Menlo, Monaco, Consolas, "Courier New", monospace',
  fontSize: 12,
  color: "#c8dff0",
  backdropFilter: "blur(10px)",
  zIndex: 15,
  pointerEvents: "auto",
};

const label: React.CSSProperties = {
  color: "#5f8aa8",
  fontSize: 10,
  letterSpacing: 0.8,
  textTransform: "uppercase",
};

const value: React.CSSProperties = {
  color: "#e0f0ff",
  fontWeight: 600,
};

function Row({ l, v }: { l: string; v: string | number | null | undefined }) {
  if (v == null || v === "") return null;
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 3 }}>
      <span style={label}>{l}</span>
      <span style={value}>{String(v)}</span>
    </div>
  );
}

function SatPanel({ data }: { data: PropagatedSat }) {
  const setTrackingId = useWorldViewStore((s) => s.setTrackingId);
  const trackingId = useWorldViewStore((s) => s.selection.trackingId);
  const isTracking = trackingId === data.noradId;

  return (
    <>
      <div style={{ color: "#4fc3f7", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
        SAT / {data.name}
      </div>
      <Row l="NORAD ID" v={data.noradId} />
      <Row l="LAT" v={`${data.lat.toFixed(4)} deg`} />
      <Row l="LON" v={`${data.lon.toFixed(4)} deg`} />
      <Row l="ALT" v={`${data.altKm.toFixed(1)} km`} />
      {data.velocityKmS !== undefined && (
        <Row l="VELOCITY" v={`${data.velocityKmS.toFixed(2)} km/s`} />
      )}
      {data.inclinationDeg !== undefined && (
        <Row l="INCL" v={`${data.inclinationDeg.toFixed(2)} deg`} />
      )}
      <Row l="ORBIT" v={data.isGeo ? "GEO" : data.altKm > 35_000 ? "HEO" : data.altKm > 2000 ? "MEO" : "LEO"} />
      <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
        <ActionBtn
          onClick={() => setTrackingId(isTracking ? null : data.noradId)}
          active={isTracking}
        >
          {isTracking ? "UNTRACK" : "TRACK"}
        </ActionBtn>
      </div>
    </>
  );
}

function FlightPanel({ data }: { data: Flight }) {
  const msToKts = (ms: number | null) => (ms != null ? `${(ms * 1.944).toFixed(0)} kts` : "--");
  const mToFt = (m: number | null) => (m != null ? `${(m * 3.281).toFixed(0)} ft` : "--");
  const setTrackedFlightId = useWorldViewStore((s) => s.setTrackedFlightId);
  const trackedFlightId = useWorldViewStore((s) => s.selection.trackedFlightId);
  const isTracking = trackedFlightId === data.icao;

  return (
    <>
      <div
        style={{
          color: data.isMilitary ? "#ff7043" : "#4fc3f7",
          fontSize: 13,
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        {data.isMilitary ? "MIL / " : "ACFT / "}
        {data.callsign || data.icao}
      </div>
      <Row l="ICAO" v={data.icao} />
      <Row l="CALLSIGN" v={data.callsign} />
      <Row l="ALT" v={mToFt(data.altM)} />
      <Row l="SPEED" v={msToKts(data.speedMs)} />
      <Row l="HEADING" v={data.heading != null ? `${data.heading.toFixed(0)} deg` : null} />
      <Row l="VRATE" v={data.vRate != null ? `${data.vRate.toFixed(1)} m/s` : null} />
      <Row l="COUNTRY" v={data.country} />
      <Row l="ON GROUND" v={data.onGround ? "YES" : "NO"} />
      {data.isMilitary && (
        <div
          style={{
            marginTop: 6,
            padding: "3px 8px",
            background: "rgba(255, 112, 67, 0.15)",
            border: "1px solid rgba(255, 112, 67, 0.3)",
            borderRadius: 4,
            fontSize: 10,
            color: "#ff7043",
          }}
        >
          {data.isMock ? "MILITARY BROADCAST (MOCK DATA)" : "MILITARY BROADCAST (LIVE ADS-B)"}
        </div>
      )}
      <div style={{ marginTop: 8 }}>
        <ActionBtn
          onClick={() => setTrackedFlightId(isTracking ? null : data.icao)}
          active={isTracking}
        >
          {isTracking ? "UNTRACK" : "TRACK"}
        </ActionBtn>
      </div>
    </>
  );
}

function QuakeNewsSection({ lat, lon, place }: { lat: number; lon: number; place: string }) {
  const [articles, setArticles] = useState<NormalizedNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setArticles([]);

    const placeName = place.replace(/^.* of /, "").trim();
    const query = `earthquake ${placeName} near:${lat.toFixed(2)},${lon.toFixed(2)},300`;
    const params = new URLSearchParams({ q: query, limit: "8", mode: "geo" });

    fetch(`/api/news/search?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setArticles(data.items ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [lat, lon, place]);

  return (
    <div style={{ marginTop: 10, borderTop: "1px solid rgba(79, 195, 247, 0.15)", paddingTop: 8 }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          cursor: "pointer", userSelect: "none", marginBottom: 6,
        }}
      >
        <span style={{ color: "#4fc3f7", fontSize: 10, letterSpacing: 0.8, fontWeight: 700 }}>
          NEARBY NEWS
        </span>
        <span style={{ color: "#5f8aa8", fontSize: 9 }}>
          {expanded ? "▼" : "▶"} {loading ? "..." : `${articles.length} found`}
        </span>
      </div>
      {expanded && (
        <div style={{ maxHeight: 220, overflowY: "auto", paddingRight: 4 }}>
          {loading && (
            <div style={{ color: "#5f8aa8", fontSize: 10, padding: "4px 0" }}>
              Searching for related news...
            </div>
          )}
          {!loading && articles.length === 0 && (
            <div style={{ color: "#5f8aa8", fontSize: 10, padding: "4px 0" }}>
              No related news found nearby.
            </div>
          )}
          {articles.map((a) => (
            <a
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block",
                padding: "5px 6px",
                marginBottom: 3,
                background: "rgba(79, 195, 247, 0.06)",
                border: "1px solid rgba(79, 195, 247, 0.12)",
                borderRadius: 5,
                textDecoration: "none",
                color: "#c8dff0",
                fontSize: 10,
                lineHeight: 1.35,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 2, color: "#e0f0ff" }}>
                {a.headline}
              </div>
              <div style={{ display: "flex", gap: 8, color: "#5f8aa8", fontSize: 9 }}>
                <span>{a.source}</span>
                <span>{new Date(a.publishedAt).toISOString().slice(0, 16).replace("T", " ")}</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function QuakePanel({ data }: { data: Earthquake }) {
  const date = new Date(data.time).toISOString().replace("T", " ").slice(0, 19);
  const magColor =
    data.mag < 3 ? "#ffeb3b" : data.mag < 5 ? "#ff9800" : "#f44336";

  return (
    <>
      <div style={{ color: magColor, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
        SEISMIC / M{data.mag.toFixed(1)}
      </div>
      <Row l="PLACE" v={data.place} />
      <Row l="MAGNITUDE" v={data.mag.toFixed(2)} />
      <Row l="DEPTH" v={`${data.depthKm.toFixed(1)} km`} />
      <Row l="TIME" v={date + " UTC"} />
      <Row l="LAT" v={`${data.lat.toFixed(4)} deg`} />
      <Row l="LON" v={`${data.lon.toFixed(4)} deg`} />
      <Row l="TYPE" v={data.type} />
      {data.url && (
        <div style={{ marginTop: 8 }}>
          <a
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#4fc3f7", fontSize: 11 }}
          >
            USGS LINK
          </a>
        </div>
      )}
      <QuakeNewsSection lat={data.lat} lon={data.lon} place={data.place} />
    </>
  );
}

function CctvPanelContent({ data }: { data: CctvCamera }) {
  const openCctvFloating = useWorldViewStore((s) => s.openCctvFloating);
  return (
    <>
      <div style={{ color: "#00e5ff", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
        CCTV / {data.name}
      </div>
      <Row l="CITY" v={data.city} />
      <Row l="STATE" v={data.state ?? "n/a"} />
      <Row l="LAT" v={`${data.lat.toFixed(5)} deg`} />
      <Row l="LON" v={`${data.lon.toFixed(5)} deg`} />
      <Row l="FORMAT" v={data.streamFormat ?? "JPEG"} />
      <Row l="REFRESH" v={`${data.refreshSeconds ?? 60}s`} />
      <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => openCctvFloating(data)}
          style={{
            padding: "4px 10px",
            background: "rgba(0, 229, 255, 0.12)",
            border: "1px solid rgba(0, 229, 255, 0.3)",
            color: "#00e5ff",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.05em",
          }}
        >
          VIEW FEED
        </button>
        {data.snapshotUrl && (
          <a
            href={data.snapshotUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "4px 10px",
              color: "#4fc3f7",
              fontSize: 11,
              textDecoration: "none",
              border: "1px solid rgba(79, 195, 247, 0.2)",
              borderRadius: 4,
            }}
          >
            OPEN LINK
          </a>
        )}
      </div>
    </>
  );
}

function ActionBtn({
  onClick,
  children,
  active = false,
}: {
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "4px 10px",
        background: active ? "rgba(79, 195, 247, 0.2)" : "transparent",
        border: `1px solid ${active ? "rgba(79, 195, 247, 0.6)" : "rgba(79, 195, 247, 0.3)"}`,
        borderRadius: 4,
        color: active ? "#4fc3f7" : "#7ab8d4",
        fontSize: 10,
        letterSpacing: 0.8,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}

export default function SelectionPanel() {
  const selectedEntity = useWorldViewStore((s) => s.selection.selectedEntity);
  const selectEntity = useWorldViewStore((s) => s.selectEntity);
  const pinEntity = useWorldViewStore((s) => s.pinEntity);
  const setTrackedFlightId = useWorldViewStore((s) => s.setTrackedFlightId);

  if (!selectedEntity) return null;

  const renderContent = () => {
    switch (selectedEntity.type) {
      case "satellite":
        return <SatPanel data={selectedEntity.data as PropagatedSat} />;
      case "flight":
        return <FlightPanel data={selectedEntity.data as Flight} />;
      case "earthquake":
        return <QuakePanel data={selectedEntity.data as Earthquake} />;
      case "cctv":
        return <CctvPanelContent data={selectedEntity.data as CctvCamera} />;
      default:
        return <div style={{ color: "#7a98b0" }}>Unknown entity type</div>;
    }
  };

  return (
    <div style={panel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
        <div style={{ flex: 1 }}>{renderContent()}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginLeft: 12 }}>
          <ActionBtn onClick={() => pinEntity(selectedEntity)}>PIN</ActionBtn>
          <ActionBtn onClick={() => { selectEntity(null); setTrackedFlightId(null); }}>X</ActionBtn>
        </div>
      </div>
    </div>
  );
}
