import type { NewsCategory, QueryAST } from "../types";
import { normalizeQueryAst } from "./normalize";
import { tokenizeQuery } from "./tokenize";

const CATEGORIES = new Set<NewsCategory>([
  "world",
  "markets",
  "financial",
  "ipo",
  "tech",
  "ai",
  "cyber",
  "semiconductors",
  "cloud",
  "startups",
  "events",
  "energy",
  "defense",
  "space",
  "biotech",
  "crypto",
  "local",
  "filings",
  "watchlist",
]);

function parseNear(value: string): QueryAST["near"] | undefined {
  const parts = value.split(",").map((v) => v.trim());
  if (parts.length !== 3) return undefined;
  const lat = Number(parts[0]);
  const lon = Number(parts[1]);
  const km = Number(parts[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(km)) {
    return undefined;
  }
  return { lat, lon, km };
}

function parseSrc(value: string): string[] {
  return value
    .split(/[|,]/g)
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseHas(value: string): Array<"video" | "coords"> {
  return value
    .split(/[|,]/g)
    .map((v) => v.trim().toLowerCase())
    .filter((v): v is "video" | "coords" => v === "video" || v === "coords");
}

export function parseQuery(rawQuery: string): QueryAST {
  const tokens = tokenizeQuery(rawQuery);
  const ast: QueryAST = { raw: rawQuery, freeText: [] };

  for (const token of tokens) {
    const idx = token.indexOf(":");
    if (idx <= 0) {
      ast.freeText.push(token);
      continue;
    }

    const key = token.slice(0, idx).toLowerCase();
    const value = token.slice(idx + 1).trim();
    if (!value) continue;

    switch (key) {
      case "sym":
        ast.sym = value;
        break;
      case "cik":
        ast.cik = value;
        break;
      case "src":
        ast.src = parseSrc(value);
        break;
      case "cat":
        if (CATEGORIES.has(value as NewsCategory)) {
          ast.cat = value as NewsCategory;
        }
        break;
      case "place":
        ast.place = value;
        break;
      case "country":
        ast.country = value.toUpperCase();
        break;
      case "near":
        ast.near = parseNear(value);
        break;
      case "time":
      case "timespan":
        ast.timespan = value as QueryAST["timespan"];
        break;
      case "from":
        ast.fromDate = value;
        break;
      case "to":
        ast.toDate = value;
        break;
      case "type":
        if (value === "filing") ast.type = "filing";
        break;
      case "form":
        ast.filingForm = value;
        ast.type = "filing";
        break;
      case "has":
        ast.has = parseHas(value);
        break;
      default:
        ast.freeText.push(token);
        break;
    }
  }

  return normalizeQueryAst(ast);
}

