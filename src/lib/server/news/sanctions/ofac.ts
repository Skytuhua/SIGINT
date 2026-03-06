import type { SanctionsEntity, SanctionsSourceStatus } from "./types";
import {
  stableEntityId,
  classifyEntityType,
  cleanName,
  deriveGeo,
  buildSourceTrace,
} from "./normalize";

const SDN_CSV_URL =
  "https://www.treasury.gov/ofac/downloads/sdn.csv";
const OFAC_SOURCE_URL =
  "https://www.treasury.gov/resource-center/sanctions/SDN-List/Pages/default.aspx";
const REQUEST_TIMEOUT_MS = 30_000;

interface OfacRawRow {
  uid: string;
  sdnType: string;
  name: string;
  program: string;
  title: string;
  callSign: string;
  vesselType: string;
  tonnage: string;
  grossTonnage: string;
  vesselFlag: string;
  vesselOwner: string;
  remarks: string;
}

function parseOfacCsv(text: string): OfacRawRow[] {
  const lines = text.split("\n");
  const rows: OfacRawRow[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cols = splitCsvLine(trimmed);
    if (cols.length < 12) continue;
    rows.push({
      uid: cols[0].trim(),
      name: cols[1].trim(),
      sdnType: cols[2].trim(),
      program: cols[3].trim(),
      title: cols[4].trim(),
      callSign: cols[5].trim(),
      vesselType: cols[6].trim(),
      tonnage: cols[7].trim(),
      grossTonnage: cols[8].trim(),
      vesselFlag: cols[9].trim(),
      vesselOwner: cols[10].trim(),
      remarks: cols[11]?.trim() ?? "",
    });
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const cols: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      cols.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cols.push(current);
  return cols;
}

function extractCountryFromRemarks(remarks: string): string | null {
  const match = remarks.match(
    /(?:Nationality|Country)[:\s]+([A-Z]{2})/i
  );
  return match ? match[1].toUpperCase() : null;
}

function extractIdFromRemarks(remarks: string, key: string): string | null {
  const re = new RegExp(`${key}\\s*[:=]?\\s*([A-Za-z0-9-]+)`, "i");
  const m = remarks.match(re);
  return m ? m[1] : null;
}

export async function fetchOfacEntities(): Promise<{
  entities: SanctionsEntity[];
  status: SanctionsSourceStatus;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(SDN_CSV_URL, {
      signal: controller.signal,
      headers: { "User-Agent": "WorldView/1.0 (sanctions-layer)" },
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`OFAC SDN CSV returned ${res.status}`);
    }

    const text = await res.text();
    const lastModified = res.headers.get("last-modified");
    const rows = parseOfacCsv(text);
    const entities: SanctionsEntity[] = [];
    const version = lastModified ?? new Date().toISOString().slice(0, 10);

    for (const row of rows) {
      if (!row.uid || !row.name) continue;

      const isVessel = row.sdnType === "-vessel-" || !!row.vesselType;
      const isAircraft = row.sdnType === "-aircraft-";
      const entityType = classifyEntityType(row.sdnType, {
        isVessel,
        isAircraft,
      });

      const country = row.vesselFlag || extractCountryFromRemarks(row.remarks) || null;
      const geo = deriveGeo(null, country);

      const imo = extractIdFromRemarks(row.remarks, "IMO");
      const mmsi = extractIdFromRemarks(row.remarks, "MMSI");
      const tailNumber = extractIdFromRemarks(row.remarks, "Tail Number");
      const icao24 = extractIdFromRemarks(row.remarks, "ICAO24");

      entities.push({
        id: stableEntityId("OFAC", row.uid),
        name: cleanName(row.name),
        aliases: [],
        entityType,
        authority: "OFAC",
        program: row.program || "SDN",
        designationDate: null,
        status: "Active",
        identifiers: {
          ofacSdnId: row.uid,
          imo,
          mmsi,
          callsign: row.callSign || null,
          tailNumber,
          icao24,
        },
        jurisdictionCountry: country,
        linkedCountries: country ? [country] : [],
        geo,
        sourceTrace: buildSourceTrace("OFAC", OFAC_SOURCE_URL, version),
      });
    }

    return {
      entities,
      status: {
        status: "live",
        lastUpdated: Date.now(),
        rowCount: entities.length,
        datasetVersion: version,
        errorCode: null,
      },
    };
  } catch (err) {
    return {
      entities: [],
      status: {
        status: "unavailable",
        lastUpdated: null,
        rowCount: 0,
        datasetVersion: null,
        errorCode: err instanceof Error ? err.message : "unknown",
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
