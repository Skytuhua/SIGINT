import type { SanctionsEntity, SanctionsSourceStatus } from "./types";
import {
  stableEntityId,
  classifyEntityType,
  cleanName,
  deriveGeo,
  buildSourceTrace,
} from "./normalize";

const EU_CSV_URL =
  "https://webgate.ec.europa.eu/fsd/fsf/public/files/csvFullSanctionsList/content?token=dG9rZW4tMjAxNw";
const EU_SOURCE_URL =
  "https://data.europa.eu/data/datasets/consolidated-list-of-persons-groups-and-entities-subject-to-eu-financial-sanctions";
const REQUEST_TIMEOUT_MS = 30_000;

function splitCsvLine(line: string): string[] {
  const cols: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ";" && !inQuotes) {
      cols.push(current);
      current = "";
    } else if (ch === "," && !inQuotes && !line.includes(";")) {
      cols.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cols.push(current);
  return cols;
}

function findColIndex(headers: string[], ...candidates: string[]): number {
  for (const c of candidates) {
    const idx = headers.findIndex(
      (h) => h.toLowerCase().replace(/[^a-z0-9]/g, "").includes(c.toLowerCase().replace(/[^a-z0-9]/g, ""))
    );
    if (idx >= 0) return idx;
  }
  return -1;
}

export async function fetchEuEntities(): Promise<{
  entities: SanctionsEntity[];
  status: SanctionsSourceStatus;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(EU_CSV_URL, {
      signal: controller.signal,
      headers: { "User-Agent": "WorldView/1.0 (sanctions-layer)" },
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`EU sanctions CSV returned ${res.status}`);
    }

    const text = await res.text();
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length < 2) {
      return {
        entities: [],
        status: {
          status: "degraded",
          lastUpdated: Date.now(),
          rowCount: 0,
          datasetVersion: null,
          errorCode: "empty-csv",
        },
      };
    }

    const headers = splitCsvLine(lines[0]).map((h) => h.trim());
    const colId = findColIndex(headers, "Entity_LogicalId", "LogicalId", "Id");
    const colName = findColIndex(headers, "NameAlias_WholeName", "WholeName", "Name");
    const colType = findColIndex(headers, "Entity_SubjectType", "SubjectType", "Type");
    const colProgram = findColIndex(headers, "Entity_Regulation", "Regulation", "Programme");
    const colCountry = findColIndex(headers, "AddressCountry", "Country");
    const colCity = findColIndex(headers, "AddressCity", "City");
    const colDesignation = findColIndex(headers, "Entity_ListingDate", "ListingDate", "DesignationDate");

    const entities: SanctionsEntity[] = [];
    const seen = new Set<string>();

    for (let i = 1; i < lines.length; i++) {
      const cols = splitCsvLine(lines[i]);
      const id = cols[colId]?.trim();
      const name = cols[colName]?.trim();
      if (!name) continue;

      const canonId = id || `row-${i}`;
      if (seen.has(canonId)) continue;
      seen.add(canonId);

      const rawType = cols[colType]?.trim() ?? null;
      const program = cols[colProgram]?.trim() ?? "EU Sanctions";
      const country = cols[colCountry]?.trim()?.slice(0, 2)?.toUpperCase() || null;
      const city = cols[colCity]?.trim() || null;
      const desDate = cols[colDesignation]?.trim() || null;

      entities.push({
        id: stableEntityId("EU", canonId),
        name: cleanName(name),
        aliases: [],
        entityType: classifyEntityType(rawType),
        authority: "EU",
        program,
        designationDate: desDate,
        status: "Active",
        identifiers: { euId: canonId },
        jurisdictionCountry: country,
        linkedCountries: country ? [country] : [],
        geo: deriveGeo(city, country),
        sourceTrace: buildSourceTrace(
          "EU",
          EU_SOURCE_URL,
          new Date().toISOString().slice(0, 10)
        ),
      });
    }

    return {
      entities,
      status: {
        status: "live",
        lastUpdated: Date.now(),
        rowCount: entities.length,
        datasetVersion: new Date().toISOString().slice(0, 10),
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
