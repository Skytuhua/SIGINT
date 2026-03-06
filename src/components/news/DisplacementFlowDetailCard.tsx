"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export interface DisplacementFlowDetailData {
  id: string;
  corridorName: string;
  flowType: "refugee" | "idp";
  originName: string;
  destinationName: string;
  value: number;
  valueFormatted: string;
  cause?: string | null;
  confidence: "measured" | "estimated";
  timeRangeFrom: string;
  timeRangeTo: string;
  sourceName: string;
  sourceUrl: string;
  corroboratedValue?: number | null;
  corroboratedSource?: string | null;
  lastUpdated: number | null;
}

interface Props {
  detail: DisplacementFlowDetailData;
  onClose: () => void;
}

function formatTs(ts: number | null): string {
  if (!ts || !Number.isFinite(ts)) return "n/a";
  return new Date(ts).toISOString().slice(0, 10);
}

function formatTimeRange(from: string, to: string): string {
  if (!from && !to) return "n/a";
  if (from === to || !to) return from.slice(0, 4);
  const fyear = from.slice(0, 4);
  const tyear = to.slice(0, 4);
  return fyear === tyear ? fyear : `${fyear}–${tyear}`;
}

function causeLabel(cause?: string | null): { label: string; color: string } {
  if (cause === "conflict") return { label: "Conflict / violence", color: "#f87171" };
  if (cause === "disaster") return { label: "Disaster / weather", color: "#fbbf24" };
  if (cause === "other")    return { label: "Other / undetermined", color: "#94a3b8" };
  return { label: "Not specified", color: "#64748b" };
}

export function propsToDisplacementFlowDetail(
  props: Record<string, unknown>
): DisplacementFlowDetailData {
  return {
    id: String(props.id ?? props.corridorName ?? ""),
    corridorName: String(props.corridorName ?? ""),
    flowType: props.flowType === "idp" ? "idp" : "refugee",
    originName: String(props.originName ?? ""),
    destinationName: String(props.destinationName ?? ""),
    value: Number(props.value ?? 0),
    valueFormatted: String(props.valueFormatted ?? ""),
    cause: props.cause ? String(props.cause) : null,
    confidence: props.confidence === "estimated" ? "estimated" : "measured",
    timeRangeFrom: String(props.timeRangeFrom ?? ""),
    timeRangeTo: String(props.timeRangeTo ?? ""),
    sourceName: String(props.sourceName ?? ""),
    sourceUrl: String(props.sourceUrl ?? ""),
    corroboratedValue: props.corroboratedValue ? Number(props.corroboratedValue) : null,
    corroboratedSource: props.corroboratedSource ? String(props.corroboratedSource) : null,
    lastUpdated: props.lastUpdated ? Number(props.lastUpdated) : null,
  };
}

export default function DisplacementFlowDetailCard({ detail, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  const isIdp     = detail.flowType === "idp";
  const typeColor = isIdp ? "#ffa040" : "#4da6ff";
  const typeLabel = isIdp ? "IDP" : "REFUGEE";
  const timeRange = formatTimeRange(detail.timeRangeFrom, detail.timeRangeTo);
  const cause     = causeLabel(detail.cause);
  const volStr    = detail.valueFormatted || detail.value.toLocaleString();
  const sameCountry = detail.originName === detail.destinationName;

  const card = (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9000,
        width: 360,
        background: "#0d1117",
        border: `1px solid ${typeColor}33`,
        borderLeft: `3px solid ${typeColor}`,
        borderRadius: 6,
        boxShadow: `0 4px 32px #000a, 0 0 0 1px ${typeColor}22`,
        fontFamily: "inherit",
        pointerEvents: "auto",
        overflow: "hidden",
      }}
    >
      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "8px 10px 6px",
        borderBottom: "1px solid #ffffff0d",
        background: "#ffffff05",
      }}>
        <span style={{ fontSize: 9, letterSpacing: 1.2, opacity: 0.45, fontWeight: 700, flex: 1 }}>
          DISPLACEMENT FLOW
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: 0.8,
          color: typeColor, background: `${typeColor}18`,
          border: `1px solid ${typeColor}55`,
          borderRadius: 3, padding: "2px 6px",
        }}>
          {typeLabel}
        </span>
        <span style={{
          fontSize: 9, fontWeight: 600, letterSpacing: 0.5,
          color: detail.confidence === "measured" ? "#4ade80" : "#fbbf24",
          background: detail.confidence === "measured" ? "#1a3a2a" : "#3a2a10",
          border: `1px solid ${detail.confidence === "measured" ? "#4ade8044" : "#fbbf2444"}`,
          borderRadius: 3, padding: "2px 6px",
        }}>
          {detail.confidence === "measured" ? "MEASURED" : "ESTIMATED"}
        </span>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            background: "none", border: "none", color: "#555",
            cursor: "pointer", fontSize: 15, lineHeight: 1,
            padding: "0 0 0 4px", marginLeft: 2,
          }}
        >
          ✕
        </button>
      </div>

      {/* ── Corridor visual ── */}
      <div style={{ padding: "10px 12px 8px" }}>
        {/* Flow path: Origin ──→ Destination */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 12, fontWeight: 600, marginBottom: 6,
        }}>
          <span style={{
            background: `${typeColor}22`, border: `1px solid ${typeColor}44`,
            borderRadius: 3, padding: "2px 7px", color: typeColor,
          }}>
            {detail.originName}
          </span>
          <span style={{ color: "#ffffff30", fontSize: 14, flexShrink: 0 }}>
            {sameCountry ? "⟳" : "→"}
          </span>
          <span style={{
            background: "#ffffff0a", border: "1px solid #ffffff1a",
            borderRadius: 3, padding: "2px 7px", color: "#c8dff5",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {detail.destinationName}
          </span>
        </div>

        {/* Volume — the big number */}
        <div style={{
          display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2,
        }}>
          <span style={{
            fontSize: 30, fontWeight: 800, color: typeColor, lineHeight: 1,
            letterSpacing: -1,
          }}>
            {volStr}
          </span>
          <span style={{ fontSize: 11, opacity: 0.5, fontWeight: 500 }}>persons</span>
          {detail.corroboratedValue && detail.corroboratedSource && (
            <span style={{ fontSize: 10, opacity: 0.5, marginLeft: 4 }}>
              (corr. {detail.corroboratedSource}: {Number(detail.corroboratedValue).toLocaleString()})
            </span>
          )}
        </div>
        <div style={{ fontSize: 10, opacity: 0.4 }}>Reporting period: {timeRange}</div>
      </div>

      {/* ── Cause + data quality ── */}
      <div style={{
        display: "flex", gap: 8,
        padding: "6px 12px 8px",
        borderTop: "1px solid #ffffff0d",
      }}>
        <div style={{
          flex: 1, background: "#ffffff05", borderRadius: 4,
          padding: "5px 8px",
        }}>
          <div style={{ fontSize: 9, opacity: 0.4, letterSpacing: 0.8, marginBottom: 3 }}>CAUSE</div>
          <div style={{ fontSize: 11, color: cause.color, fontWeight: 600 }}>{cause.label}</div>
        </div>
        <div style={{
          flex: 1, background: "#ffffff05", borderRadius: 4,
          padding: "5px 8px",
        }}>
          <div style={{ fontSize: 9, opacity: 0.4, letterSpacing: 0.8, marginBottom: 3 }}>LAYER</div>
          <div style={{ fontSize: 11, color: "#c8dff5", fontWeight: 500 }}>
            {isIdp ? "Internal displacement" : "Cross-border flow"}
          </div>
        </div>
      </div>

      {/* ── Methodology note (estimated only) ── */}
      {detail.confidence === "estimated" && (
        <div style={{
          padding: "5px 12px 6px",
          fontSize: 10, opacity: 0.5, lineHeight: 1.55,
          borderTop: "1px solid #ffffff0d",
          fontStyle: "italic",
        }}>
          IDMC figures are model-based estimates from government reports, media monitoring, and field
          assessments. Actual totals may differ.
        </div>
      )}

      {/* ── Data gap ── */}
      {detail.value === 0 && (
        <div style={{
          padding: "5px 12px",
          fontSize: 10, color: "#fbbf24", opacity: 0.8,
          borderTop: "1px solid #ffffff0d",
        }}>
          ⚠ No volume data available for this corridor.
        </div>
      )}

      {/* ── Source trace ── */}
      <div style={{
        padding: "6px 12px 8px",
        borderTop: "1px solid #ffffff0d",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: 10, opacity: 0.45 }}>
          {detail.sourceName}{" "}
          {detail.sourceUrl && (
            <a
              href={detail.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: typeColor, textDecoration: "none", opacity: 0.8 }}
            >
              ↗
            </a>
          )}
        </span>
        <span style={{ fontSize: 10, opacity: 0.35 }}>
          {formatTs(detail.lastUpdated)}
        </span>
      </div>
    </div>
  );

  return createPortal(card, document.body);
}
