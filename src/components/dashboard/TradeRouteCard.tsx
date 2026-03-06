"use client";

import { useMemo, useEffect, useState, useCallback } from "react";
import { useWorldViewStore } from "../../store";
import { TRADE_ROUTE_GRAPH, NODE_MAP } from "../../lib/cesium/tradeRoutes/data";
import { getRouteGeometry } from "../../lib/cesium/tradeRoutes/geometry";
import { CATEGORY_COLORS, CATEGORY_LABELS } from "../../lib/cesium/tradeRoutes/types";
import type { DisruptionSignal } from "../../lib/cesium/tradeRoutes/types";

const IMPORTANCE_BARS = ["▏", "▎", "▍", "▌", "█"];

export default function TradeRouteCard() {
  const selectedRouteId = useWorldViewStore((s) => s.tradeRouteSelection.selectedRouteId);
  const selectedNodeId = useWorldViewStore((s) => s.tradeRouteSelection.selectedNodeId);
  const disruptionSignals = useWorldViewStore((s) => s.tradeRouteSelection.disruptionSignals);
  const setSelection = useWorldViewStore((s) => s.setTradeRouteSelection);
  const setDisruptions = useWorldViewStore((s) => s.setTradeRouteDisruptions);
  const layerEnabled = useWorldViewStore((s) => s.layers.tradeRoutes);

  const route = useMemo(
    () => TRADE_ROUTE_GRAPH.routes.find((r) => r.id === selectedRouteId) ?? null,
    [selectedRouteId]
  );

  const selectedNode = useMemo(
    () => (selectedNodeId ? NODE_MAP.get(selectedNodeId) ?? null : null),
    [selectedNodeId]
  );

  const geometry = useMemo(
    () => (route ? getRouteGeometry(route, NODE_MAP) : null),
    [route]
  );

  const pathChain = useMemo(() => {
    if (!route) return [];
    return route.waypoints
      .map((wpId) => NODE_MAP.get(wpId))
      .filter((n) => n && n.type !== "waypoint")
      .map((n) => n!.name);
  }, [route]);

  const keyNodes = useMemo(() => {
    if (!route) return [];
    return route.keyChokepoints
      .map((id) => NODE_MAP.get(id))
      .filter(Boolean)
      .map((n) => n!);
  }, [route]);

  // Fetch disruption signals when route changes
  const [loadingDisruptions, setLoadingDisruptions] = useState(false);
  const fetchDisruptions = useCallback(async (chokepoints: string[]) => {
    if (chokepoints.length === 0) return;
    setLoadingDisruptions(true);
    try {
      const names = chokepoints
        .map((id) => NODE_MAP.get(id)?.name ?? id)
        .join(",");
      const res = await fetch(`/api/news/layers/trade-routes-disruptions?chokepoints=${encodeURIComponent(names)}`);
      if (res.ok) {
        const data = await res.json() as DisruptionSignal[];
        setDisruptions(data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingDisruptions(false);
    }
  }, [setDisruptions]);

  useEffect(() => {
    if (route && route.keyChokepoints.length > 0) {
      fetchDisruptions(route.keyChokepoints);
    } else {
      setDisruptions([]);
    }
  }, [route, fetchDisruptions, setDisruptions]);

  if (!layerEnabled || (!route && !selectedNode)) return null;

  const close = () => setSelection({ selectedRouteId: null, selectedNodeId: null });

  const catColor = route ? CATEGORY_COLORS[route.category] : "#4fc3f7";
  const catLabel = route ? CATEGORY_LABELS[route.category] : "";

  return (
    <div className="wv-trade-route-card">
      {/* Header */}
      <div className="wv-trc-header">
        <span className="wv-trc-title">{route?.name ?? selectedNode?.name ?? "Trade Route"}</span>
        <button className="wv-trc-close" onClick={close} title="Close">×</button>
      </div>

      {route && (
        <>
          {/* Category + Importance */}
          <div className="wv-trc-row">
            <span className="wv-trc-label">CATEGORY</span>
            <span style={{ color: catColor }}>{catLabel.toUpperCase()}</span>
            <span className="wv-trc-sep">|</span>
            <span className="wv-trc-label">IMPORTANCE</span>
            <span style={{ color: catColor, letterSpacing: 2 }}>
              {IMPORTANCE_BARS.slice(0, route.importance).join("")}
              <span style={{ opacity: 0.4 }}> {route.importance}/5</span>
            </span>
          </div>

          {/* Path chain */}
          <div className="wv-trc-row wv-trc-path">
            <span className="wv-trc-label">PATH</span>
            <span>{pathChain.join(" → ")}</span>
          </div>

          {/* Why it matters */}
          <div className="wv-trc-row">
            <span className="wv-trc-label">WHY IT MATTERS</span>
            <span className="wv-trc-value">{route.whyItMatters}</span>
          </div>

          {/* Key nodes */}
          {keyNodes.length > 0 && (
            <div className="wv-trc-row">
              <span className="wv-trc-label">KEY CHOKEPOINTS</span>
              <span className="wv-trc-value">
                {keyNodes.map((n, i) => (
                  <span key={n.id}>
                    <button
                      className="wv-trc-node-link"
                      onClick={() => setSelection({ selectedNodeId: n.id })}
                    >
                      {n.name}
                    </button>
                    {i < keyNodes.length - 1 ? ", " : ""}
                  </span>
                ))}
              </span>
            </div>
          )}

          {/* Segment length */}
          {geometry && (
            <div className="wv-trc-row">
              <span className="wv-trc-label">ROUTE LENGTH</span>
              <span className="wv-trc-value">{Math.round(geometry.lengthKm).toLocaleString()} km</span>
            </div>
          )}

          {/* Source trace */}
          <div className="wv-trc-row">
            <span className="wv-trc-label">SOURCE TRACE</span>
            <span className="wv-trc-links">
              {route.sourceTrace.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="wv-trc-link">
                  {url.includes("wikidata") ? `WD:${url.split("/").pop()}` : url.split("/").pop()}
                </a>
              ))}
            </span>
          </div>

          {/* Disruption signals */}
          {(disruptionSignals.length > 0 || loadingDisruptions) && (
            <div className="wv-trc-disruptions">
              <span className="wv-trc-label">RECENT DISRUPTION SIGNALS</span>
              {loadingDisruptions && <span className="wv-trc-loading">Loading...</span>}
              {disruptionSignals.map((sig) => (
                <div key={sig.chokepoint} className="wv-trc-disruption-group">
                  <span className="wv-trc-disruption-choke">{sig.chokepoint}</span>
                  {sig.headlines.slice(0, 3).map((h, i) => (
                    <a key={i} href={h.url} target="_blank" rel="noopener noreferrer" className="wv-trc-disruption-headline">
                      {h.title}
                    </a>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Selected node detail (when clicking a specific node) */}
      {selectedNode && (
        <div className="wv-trc-node-detail">
          <div className="wv-trc-row">
            <span className="wv-trc-label">NODE TYPE</span>
            <span className="wv-trc-value">{selectedNode.type.toUpperCase()}</span>
          </div>
          <div className="wv-trc-row">
            <span className="wv-trc-label">COORDINATES</span>
            <span className="wv-trc-value">
              {selectedNode.lat.toFixed(4)}°, {selectedNode.lon.toFixed(4)}°
            </span>
          </div>
          {selectedNode.country && (
            <div className="wv-trc-row">
              <span className="wv-trc-label">COUNTRY</span>
              <span className="wv-trc-value">{selectedNode.country}</span>
            </div>
          )}
          {selectedNode.wikidataId && (
            <div className="wv-trc-row">
              <span className="wv-trc-label">WIKIDATA</span>
              <a
                href={`https://www.wikidata.org/wiki/${selectedNode.wikidataId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="wv-trc-link"
              >
                {selectedNode.wikidataId}
              </a>
            </div>
          )}

          {/* Summary */}
          {selectedNode.summary && (
            <div className="wv-trc-node-summary">{selectedNode.summary}</div>
          )}

          {/* Hub-specific fields */}
          {selectedNode.type === "hub" && (
            <>
              {selectedNode.throughput && (
                <div className="wv-trc-row">
                  <span className="wv-trc-label">THROUGHPUT</span>
                  <span className="wv-trc-value">{selectedNode.throughput}</span>
                </div>
              )}
              {selectedNode.globalRank && (
                <div className="wv-trc-row">
                  <span className="wv-trc-label">GLOBAL RANK</span>
                  <span className="wv-trc-value" style={{ color: "#4fc3f7" }}>{selectedNode.globalRank}</span>
                </div>
              )}
              {selectedNode.topExports && selectedNode.topExports.length > 0 && (
                <div className="wv-trc-row">
                  <span className="wv-trc-label">TOP EXPORTS</span>
                  <span className="wv-trc-commodities">
                    {selectedNode.topExports.map((c) => (
                      <span key={c} className="wv-trc-commodity wv-trc-commodity--export">{c}</span>
                    ))}
                  </span>
                </div>
              )}
              {selectedNode.topImports && selectedNode.topImports.length > 0 && (
                <div className="wv-trc-row">
                  <span className="wv-trc-label">TOP IMPORTS</span>
                  <span className="wv-trc-commodities">
                    {selectedNode.topImports.map((c) => (
                      <span key={c} className="wv-trc-commodity wv-trc-commodity--import">{c}</span>
                    ))}
                  </span>
                </div>
              )}
            </>
          )}

          {/* Chokepoint-specific fields */}
          {selectedNode.type === "chokepoint" && (
            <>
              {selectedNode.dailyVessels !== undefined && selectedNode.dailyVessels > 0 && (
                <div className="wv-trc-row">
                  <span className="wv-trc-label">DAILY VESSELS</span>
                  <span className="wv-trc-value">{selectedNode.dailyVessels.toLocaleString()} ships/day</span>
                </div>
              )}
              {selectedNode.tradeSharePct && (
                <div className="wv-trc-row">
                  <span className="wv-trc-label">TRADE SHARE</span>
                  <span className="wv-trc-value" style={{ color: "#ffab40" }}>{selectedNode.tradeSharePct}</span>
                </div>
              )}
              {selectedNode.widthKm !== undefined && selectedNode.widthKm > 0 && (
                <div className="wv-trc-row">
                  <span className="wv-trc-label">MIN WIDTH</span>
                  <span className="wv-trc-value">{selectedNode.widthKm} km</span>
                </div>
              )}
              {selectedNode.controlledBy && (
                <div className="wv-trc-row">
                  <span className="wv-trc-label">CONTROLLED BY</span>
                  <span className="wv-trc-value">{selectedNode.controlledBy}</span>
                </div>
              )}
              {selectedNode.primaryCommodities && selectedNode.primaryCommodities.length > 0 && (
                <div className="wv-trc-row">
                  <span className="wv-trc-label">PRIMARY CARGO</span>
                  <span className="wv-trc-commodities">
                    {selectedNode.primaryCommodities.map((c) => (
                      <span key={c} className="wv-trc-commodity wv-trc-commodity--neutral">{c}</span>
                    ))}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Last updated */}
      <div className="wv-trc-footer">
        <span className="wv-trc-label">LAST UPDATED</span>
        <span className="wv-trc-value">{new Date().toISOString().slice(0, 19).replace("T", " ")} UTC</span>
      </div>
    </div>
  );
}
