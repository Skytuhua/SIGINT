"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";
import { useWorldViewStore } from "../../store";
import { CATEGORY_COLORS } from "../../config/newsConfig";
import type { GeoMarker } from "../../lib/news/types";
import CountryDetailModal from "./CountryDetailModal";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

/** world-atlas uses name (and numeric id); map to ISO_A2 for modal/flag */
const NAME_TO_ISO2: Record<string, string> = {
  "United States of America": "US",
  "United Kingdom of Great Britain and Northern Ireland": "GB",
  "United Kingdom": "GB",
  "Russian Federation": "RU",
  "Iran (Islamic Republic of)": "IR",
  "Viet Nam": "VN",
  "Republic of Korea": "KR",
  "Democratic People's Republic of Korea": "KP",
  "Lao People's Democratic Republic": "LA",
  "Syrian Arab Republic": "SY",
  "Brunei Darussalam": "BN",
  "Bolivia (Plurinational State of)": "BO",
  "Venezuela (Bolivarian Republic of)": "VE",
  "Taiwan, Province of China": "TW",
  "Tanzania, United Republic of": "TZ",
  "Tanzania": "TZ",
  "W. Sahara": "EH",
  Canada: "CA",
  Australia: "AU",
  Fiji: "FJ",
  Czechia: "CZ",
  "Republic of the Congo": "CG",
  "Democratic Republic of the Congo": "CD",
};

const CONTINENT_LABELS: { name: string; coordinates: [number, number] }[] = [
  { name: "NORTH AMERICA", coordinates: [-100, 48] },
  { name: "SOUTH AMERICA", coordinates: [-60, -15] },
  { name: "EUROPE", coordinates: [15, 54] },
  { name: "AFRICA", coordinates: [20, 5] },
  { name: "ASIA", coordinates: [85, 45] },
  { name: "OCEANIA", coordinates: [165, -10] },
  { name: "AUSTRALIA", coordinates: [134, -27] },
];

const THREAT_LEGEND = [
  { label: "High Alert", color: "#ff1744" },
  { label: "Elevated", color: "#ff6d00" },
  { label: "Monitoring", color: "#e040fb" },
  { label: "Base", color: "#36b37e" },
];

function markerColor(marker: GeoMarker): string {
  return CATEGORY_COLORS[marker.category] ?? "#36b37e";
}

function markerRadius(marker: GeoMarker): number {
  if (marker.count && marker.count > 10) return 6;
  if (marker.count && marker.count > 3) return 4.5;
  return 3;
}

export default function NewsWorldMap() {
  const markers = useWorldViewStore((s) => s.news.markers);
  const feedItems = useWorldViewStore((s) => s.news.feedItems);
  const selectedCountry = useWorldViewStore((s) => s.news.selectedCountry);
  const setSelectedCountry = useWorldViewStore((s) => s.setSelectedCountry);

  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number]>([10, 20]);
  const [hoveredGeo, setHoveredGeo] = useState<string | null>(null);

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(z * 1.5, 8));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(z / 1.5, 1));
  }, []);

  const handleCountryClick = useCallback(
    (geo: { id?: string; properties?: { name?: string; ISO_A2?: string; ISO_A3?: string } }) => {
      const props = geo.properties ?? {};
      const code =
        props.ISO_A2 ||
        NAME_TO_ISO2[props.name ?? ""] ||
        props.ISO_A3 ||
        props.name ||
        (typeof geo.id === "string" ? geo.id : undefined);
      if (code) setSelectedCountry(code);
    },
    [setSelectedCountry],
  );

  const countryArticleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of feedItems) {
      if (item.country) {
        counts[item.country] = (counts[item.country] || 0) + 1;
      }
    }
    return counts;
  }, [feedItems]);

  return (
    <div className="wv-news-map-container">
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{
          scale: 140,
          center: [0, 30],
        }}
        style={{ width: "100%", height: "100%", background: "#090d14" }}
      >
        <ZoomableGroup
          zoom={zoom}
          center={center}
          onMoveEnd={({ coordinates, zoom: z }) => {
            setCenter(coordinates as [number, number]);
            setZoom(z);
          }}
          minZoom={1}
          maxZoom={8}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const id = geo.rsmKey || geo.properties?.ISO_A2 || geo.id;
                const isHovered = hoveredGeo === id;
                const iso = geo.properties?.ISO_A2 || "";
                const hasNews = iso && countryArticleCounts[iso] > 0;
                return (
                  <Geography
                    key={id}
                    geography={geo}
                    onMouseEnter={() => setHoveredGeo(id)}
                    onMouseLeave={() => setHoveredGeo(null)}
                    onClick={() => handleCountryClick(geo)}
                    style={{
                      default: {
                        fill: hasNews ? "#1e2d40" : "#1a2332",
                        stroke: "#2a3a4d",
                        strokeWidth: 0.5,
                        outline: "none",
                        cursor: "pointer",
                      },
                      hover: {
                        fill: "#2a4060",
                        stroke: "#3d5a80",
                        strokeWidth: 0.7,
                        outline: "none",
                        cursor: "pointer",
                      },
                      pressed: {
                        fill: "#3a5575",
                        stroke: "#4d6e99",
                        strokeWidth: 0.7,
                        outline: "none",
                      },
                    }}
                  />
                );
              })
            }
          </Geographies>

          {CONTINENT_LABELS.map((label) => (
            <Marker key={label.name} coordinates={label.coordinates}>
              <text
                textAnchor="middle"
                style={{
                  fontFamily: "var(--wv-ui-font, monospace)",
                  fill: "rgba(255,255,255,0.18)",
                  fontSize: 10 / Math.max(zoom, 1),
                  fontWeight: 700,
                  letterSpacing: "0.15em",
                  pointerEvents: "none",
                  userSelect: "none",
                }}
              >
                {label.name}
              </text>
            </Marker>
          ))}

          {markers.map((m) => (
            <Marker key={m.id} coordinates={[m.lon, m.lat]}>
              <circle
                r={markerRadius(m) / Math.sqrt(zoom)}
                fill={markerColor(m)}
                fillOpacity={0.85}
                stroke={markerColor(m)}
                strokeWidth={0.5 / zoom}
                strokeOpacity={0.4}
                style={{ cursor: "pointer" }}
              />
            </Marker>
          ))}
        </ZoomableGroup>
      </ComposableMap>

      {/* Zoom controls */}
      <div className="wv-news-map-zoom">
        <button type="button" onClick={handleZoomIn}>+</button>
        <button type="button" onClick={handleZoomOut}>−</button>
      </div>

      {/* Legend bar */}
      <div className="wv-news-map-legend">
        <span className="wv-news-map-legend-title">LEGEND</span>
        {THREAT_LEGEND.map((item) => (
          <span key={item.label} className="wv-news-map-legend-item">
            <span
              className="wv-news-map-legend-dot"
              style={{ background: item.color }}
            />
            {item.label}
          </span>
        ))}
      </div>

      {/* Country detail modal */}
      {selectedCountry && (
        <CountryDetailModal
          countryCode={selectedCountry}
          onClose={() => setSelectedCountry(null)}
        />
      )}
    </div>
  );
}
