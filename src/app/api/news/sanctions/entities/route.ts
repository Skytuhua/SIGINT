import { NextResponse } from "next/server";
import { getSanctionsData } from "../../../../../lib/server/news/sanctions";
import type { SanctionsEntity } from "../../../../../lib/server/news/sanctions/types";
import { STANDARD_LIMITER } from "../../../../../lib/server/rateLimitPresets";
import { withRateLimit } from "../../../../../lib/server/withRateLimit";

export const dynamic = "force-dynamic";

function matchesFilter(entity: SanctionsEntity, key: string, value: string): boolean {
  switch (key) {
    case "authority":
      return value.split(",").some((v) => v.toUpperCase() === entity.authority);
    case "entityType":
      return value.split(",").some(
        (v) => v.toLowerCase() === entity.entityType.toLowerCase()
      );
    case "status":
      return value.toLowerCase() === entity.status.toLowerCase();
    case "program":
      return entity.program.toLowerCase().includes(value.toLowerCase());
    case "hasIdentifier": {
      if (value !== "1") return true;
      const ids = entity.identifiers;
      return !!(ids.imo || ids.mmsi || ids.callsign || ids.tailNumber || ids.icao24);
    }
    case "q": {
      const q = value.toLowerCase();
      if (entity.name.toLowerCase().includes(q)) return true;
      if (entity.aliases.some((a) => a.toLowerCase().includes(q))) return true;
      const ids = entity.identifiers;
      const idValues = [
        ids.ofacSdnId, ids.euId, ids.ukId, ids.unId,
        ids.imo, ids.mmsi, ids.callsign, ids.tailNumber, ids.icao24,
      ].filter(Boolean) as string[];
      return idValues.some((v) => v.toLowerCase().includes(q));
    }
    default:
      return true;
  }
}

async function handler(request: Request) {
  try {
    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(500, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "200", 10) || 200));

    const { entities, sourceStatus } = await getSanctionsData();

    const filterKeys = ["authority", "entityType", "status", "program", "hasIdentifier", "q"];
    let filtered = entities;
    for (const key of filterKeys) {
      const val = url.searchParams.get(key);
      if (val) {
        filtered = filtered.filter((e) => matchesFilter(e, key, val));
      }
    }

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const slice = filtered.slice(start, start + pageSize);

    const sanitized = slice.map(({ raw, ...rest }) => rest);

    const sources = Object.fromEntries(
      Object.entries(sourceStatus).map(([k, v]) => [
        k,
        v ? { status: v.status, rowCount: v.rowCount, datasetVersion: v.datasetVersion, lastUpdated: v.lastUpdated } : null,
      ])
    );

    return NextResponse.json(
      { entities: sanitized, total, page, pageSize, sources },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      { entities: [], total: 0, page: 1, pageSize: 200, sources: {}, error: String(error) },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export const GET = withRateLimit(STANDARD_LIMITER, handler);
