function escapeHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface IntelHotspotPopupInput {
  /** Feature properties (may include id when passed from callers). */
  [key: string]: unknown;
}

export interface IntelHotspotPopupCoords {
  lat: number;
  lon: number;
}

export interface IntelHotspotPlaceContext {
  displayName?: string;
  country?: string;
}

/**
 * Builds HTML for the Intel Hotspots popup with event-specific details
 * and optional place context from reverse geocoding.
 */
export function buildIntelHotspotPopupHtml(
  props: IntelHotspotPopupInput,
  coords: IntelHotspotPopupCoords,
  placeContext?: IntelHotspotPlaceContext
): string {
  const { lat, lon } = coords;

  const idRaw = props.id ?? "";
  const nameRaw = props.name ?? props.label ?? props.fullname ?? props.title ?? null;
  const idStr = String(idRaw);
  const nameStr = nameRaw != null ? String(nameRaw) : "Intel Hotspot";
  const isUcdp =
    idStr.toLowerCase().includes("ucdp-events") ||
    nameStr.toLowerCase().includes("ucdp-events");

  const title =
    (typeof nameStr === "string" && nameStr.trim())
      ? escapeHtml(nameStr.trim())
      : "Intel Hotspot";

  const dataSource = isUcdp
    ? "UCDP (Uppsala Conflict Data Program)"
    : "Configurable Intel Hotspots feed";

  const tsRaw = props.ts ?? props.time ?? props.timestamp ?? props.updatedAt;
  const tsMs =
    typeof tsRaw === "number"
      ? tsRaw
      : Number.isFinite(Number(tsRaw))
      ? Number(tsRaw)
      : Date.now();
  const when = new Date(tsMs);
  const timeLabel = Number.isFinite(when.getTime()) ? when.toUTCString() : "Unknown";

  const parts: string[] = [];
  parts.push(`<div><strong>${title}</strong></div>`);

  const placeDisplay = placeContext?.displayName?.trim();
  const countryFromPlace = placeContext?.country?.trim();
  const countryFromProps = (props.country ?? props.countryCode) as string | undefined;
  const country = countryFromProps?.trim() ?? countryFromPlace;

  if (placeDisplay) {
    parts.push(`<div>Place: ${escapeHtml(placeDisplay)}</div>`);
  } else if (country) {
    parts.push(`<div>Country: ${escapeHtml(country)}</div>`);
  }

  const typeVal =
    props.type ?? props.eventType ?? props.category ?? (isUcdp ? "Conflict event" : null);
  if (typeVal != null && String(typeVal).trim()) {
    parts.push(`<div>Type: ${escapeHtml(String(typeVal))}</div>`);
  }
  const desc =
    props.description ??
    (isUcdp
      ? "Conflict or armed violence event from Uppsala Conflict Data Program. Location indicates reported incident."
      : null);
  if (desc != null && String(desc).trim()) {
    parts.push(`<div>Description: ${escapeHtml(String(desc))}</div>`);
  }
  const fatalities = props.fatalities;
  if (fatalities != null && (typeof fatalities === "number" || String(fatalities).trim())) {
    parts.push(`<div>Fatalities: ${escapeHtml(String(fatalities))}</div>`);
  } else if (isUcdp) {
    parts.push(`<div>Fatalities: Not reported in this dataset</div>`);
  }
  const countVal = props.count ?? props.intensity ?? props.value;
  const count =
    typeof countVal === "number"
      ? countVal
      : Number.isFinite(Number(countVal))
      ? Number(countVal)
      : null;
  if (count != null) {
    parts.push(`<div>Intensity: ${escapeHtml(String(count))}</div>`);
  }

  parts.push(`<div>Location: ${lat.toFixed(2)}, ${lon.toFixed(2)}</div>`);
  parts.push(`<div>Updated: ${escapeHtml(timeLabel)}</div>`);
  parts.push(`<div style="font-size:0.85em;color:#888">Source: ${escapeHtml(dataSource)}</div>`);

  return `<div>${parts.join("")}</div>`;
}
