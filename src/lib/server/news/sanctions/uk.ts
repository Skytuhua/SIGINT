import type { SanctionsEntity, SanctionsSourceStatus } from "./types";
import {
  stableEntityId,
  classifyEntityType,
  cleanName,
  deriveGeo,
  buildSourceTrace,
} from "./normalize";

const UK_CSV_URL =
  "https://assets.publishing.service.gov.uk/media/65a68f4ee96df5000d7b4461/UK_Sanctions_List.csv";
const UK_SOURCE_URL =
  "https://www.gov.uk/government/publications/the-uk-sanctions-list";
const REQUEST_TIMEOUT_MS = 30_000;

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

function findColIndex(headers: string[], ...candidates: string[]): number {
  for (const c of candidates) {
    const idx = headers.findIndex(
      (h) =>
        h
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .includes(c.toLowerCase().replace(/[^a-z0-9]/g, ""))
    );
    if (idx >= 0) return idx;
  }
  return -1;
}

export async function fetchUkEntities(): Promise<{
  entities: SanctionsEntity[];
  status: SanctionsSourceStatus;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(UK_CSV_URL, {
      signal: controller.signal,
      headers: { "User-Agent": "SIGINT/1.0 (sanctions-layer)" },
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`UK Sanctions CSV returned ${res.status}`);
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
    const colId = findColIndex(headers, "GroupID", "UniqueID", "Group ID", "Unique ID");
    const colName = findColIndex(headers, "Name6", "name6", "Name 6", "EntityName", "WholeName");
    const colNameFull = findColIndex(headers, "name1", "Name1");
    const colType = findColIndex(headers, "GroupTypeDescription", "GroupType", "Type");
    const colRegime = findColIndex(headers, "RegimeName", "Regime");
    const colCountry = findColIndex(headers, "Country", "country");
    const colDesignation = findColIndex(headers, "DateDesignated", "DesignationDate", "ListedDate");
    const colAlias = findColIndex(headers, "AliasName", "alias");

    const entities: SanctionsEntity[] = [];
    const seen = new Set<string>();

    for (let i = 1; i < lines.length; i++) {
      const cols = splitCsvLine(lines[i]);
      const id = cols[colId]?.trim();
      let name = cols[colName]?.trim();
      if (!name && colNameFull >= 0) name = cols[colNameFull]?.trim();
      if (!name) continue;

      const canonId = id || `row-${i}`;
      if (seen.has(canonId)) continue;
      seen.add(canonId);

      const rawType = cols[colType]?.trim() ?? null;
      const regime = cols[colRegime]?.trim() ?? "UK Sanctions";
      const country = cols[colCountry]?.trim()?.slice(0, 2)?.toUpperCase() || null;
      const desDate = cols[colDesignation]?.trim() || null;

      const aliases: string[] = [];
      if (colAlias >= 0) {
        const aliasRaw = cols[colAlias]?.trim();
        if (aliasRaw && aliasRaw !== name) aliases.push(cleanName(aliasRaw));
      }

      entities.push({
        id: stableEntityId("UK", canonId),
        name: cleanName(name),
        aliases,
        entityType: classifyEntityType(rawType),
        authority: "UK",
        program: regime,
        designationDate: desDate,
        status: "Active",
        identifiers: { ukId: canonId },
        jurisdictionCountry: country,
        linkedCountries: country ? [country] : [],
        geo: deriveGeo(null, country),
        sourceTrace: buildSourceTrace(
          "UK",
          UK_SOURCE_URL,
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
