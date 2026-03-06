import type { SanctionsEntity, SanctionsSourceStatus } from "./types";
import {
  stableEntityId,
  classifyEntityType,
  cleanName,
  deriveGeo,
  buildSourceTrace,
} from "./normalize";

const UN_XML_URL =
  "https://scsanctions.un.org/resources/xml/en/consolidated.xml";
const UN_SOURCE_URL =
  "https://www.un.org/securitycouncil/sanctions/information";
const REQUEST_TIMEOUT_MS = 30_000;

function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function extractAllBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[\\s\\S]*?</${tag}>`, "gi");
  return xml.match(re) ?? [];
}

function extractAttr(xml: string, attr: string): string | null {
  const re = new RegExp(`${attr}\\s*=\\s*"([^"]*)"`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function parseIndividual(block: string, listType: string): SanctionsEntity | null {
  const dataid = extractTag(block, "DATAID") ?? extractAttr(block, "DATAID");
  const refNum = extractTag(block, "REFERENCE_NUMBER");
  const firstName = extractTag(block, "FIRST_NAME") ?? "";
  const secondName = extractTag(block, "SECOND_NAME") ?? "";
  const thirdName = extractTag(block, "THIRD_NAME") ?? "";
  const fullName = cleanName([firstName, secondName, thirdName].filter(Boolean).join(" "));
  if (!fullName) return null;

  const aliasBlocks = extractAllBlocks(block, "INDIVIDUAL_ALIAS");
  const aliases: string[] = [];
  for (const ab of aliasBlocks) {
    const aName = extractTag(ab, "ALIAS_NAME");
    if (aName && aName !== fullName) aliases.push(cleanName(aName));
  }

  const nationality = extractTag(block, "NATIONALITY")
    ? extractTag(extractAllBlocks(block, "NATIONALITY")[0] ?? "", "VALUE")
    : null;
  const country = nationality?.toUpperCase().slice(0, 2) ?? null;

  const listedOn = extractTag(block, "LISTED_ON");
  const comments = extractTag(block, "COMMENTS1") ?? "";

  const id = stableEntityId("UN", dataid ?? refNum ?? fullName.slice(0, 32));

  return {
    id,
    name: fullName,
    aliases,
    entityType: "Individual",
    authority: "UN",
    program: listType || "UNSC Consolidated",
    designationDate: listedOn ?? null,
    status: "Active",
    identifiers: { unId: dataid ?? refNum ?? null },
    jurisdictionCountry: country,
    linkedCountries: country ? [country] : [],
    geo: deriveGeo(null, country),
    sourceTrace: buildSourceTrace("UN", UN_SOURCE_URL, listedOn),
  };
}

function parseEntity(block: string, listType: string): SanctionsEntity | null {
  const dataid = extractTag(block, "DATAID") ?? extractAttr(block, "DATAID");
  const refNum = extractTag(block, "REFERENCE_NUMBER");
  const firstName = extractTag(block, "FIRST_NAME") ?? "";
  const fullName = cleanName(firstName);
  if (!fullName) return null;

  const aliasBlocks = extractAllBlocks(block, "ENTITY_ALIAS");
  const aliases: string[] = [];
  for (const ab of aliasBlocks) {
    const aName = extractTag(ab, "ALIAS_NAME");
    if (aName && aName !== fullName) aliases.push(cleanName(aName));
  }

  const listedOn = extractTag(block, "LISTED_ON");
  const comments = extractTag(block, "COMMENTS1") ?? "";
  const id = stableEntityId("UN", dataid ?? refNum ?? fullName.slice(0, 32));

  const rawType = comments.toLowerCase();
  const isVessel = rawType.includes("vessel") || rawType.includes("ship");

  return {
    id,
    name: fullName,
    aliases,
    entityType: classifyEntityType(null, { isVessel }),
    authority: "UN",
    program: listType || "UNSC Consolidated",
    designationDate: listedOn ?? null,
    status: "Active",
    identifiers: { unId: dataid ?? refNum ?? null },
    jurisdictionCountry: null,
    linkedCountries: [],
    geo: null,
    sourceTrace: buildSourceTrace("UN", UN_SOURCE_URL, listedOn),
  };
}

export async function fetchUnEntities(): Promise<{
  entities: SanctionsEntity[];
  status: SanctionsSourceStatus;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(UN_XML_URL, {
      signal: controller.signal,
      headers: { "User-Agent": "WorldView/1.0 (sanctions-layer)" },
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`UN consolidated XML returned ${res.status}`);
    }

    const xml = await res.text();
    const dateGenerated =
      extractTag(xml, "dateGenerated") ??
      extractAttr(xml, "dateGenerated") ??
      new Date().toISOString().slice(0, 10);

    const entities: SanctionsEntity[] = [];

    const individuals = extractAllBlocks(xml, "INDIVIDUAL");
    for (const block of individuals) {
      const listType = extractTag(block, "UN_LIST_TYPE") ?? "";
      const ent = parseIndividual(block, listType);
      if (ent) entities.push(ent);
    }

    const entityBlocks = extractAllBlocks(xml, "ENTITY");
    for (const block of entityBlocks) {
      const listType = extractTag(block, "UN_LIST_TYPE") ?? "";
      const ent = parseEntity(block, listType);
      if (ent) entities.push(ent);
    }

    return {
      entities,
      status: {
        status: "live",
        lastUpdated: Date.now(),
        rowCount: entities.length,
        datasetVersion: dateGenerated,
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
