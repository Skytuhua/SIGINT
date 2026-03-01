import type { QueryAST } from "../types";

function quoteIfNeeded(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value;
}

export function stringifyQueryAst(ast: QueryAST): string {
  const tokens: string[] = [];

  if (ast.sym) tokens.push(`sym:${ast.sym}`);
  if (ast.cik) tokens.push(`cik:${ast.cik}`);
  if (ast.src?.length) tokens.push(`src:${ast.src.join("|")}`);
  if (ast.cat) tokens.push(`cat:${ast.cat}`);
  if (ast.place) tokens.push(`place:${quoteIfNeeded(ast.place)}`);
  if (ast.country) tokens.push(`country:${ast.country}`);
  if (ast.near) tokens.push(`near:${ast.near.lat},${ast.near.lon},${ast.near.km}`);
  if (ast.timespan) tokens.push(`time:${ast.timespan}`);
  if (ast.fromDate) tokens.push(`from:${ast.fromDate}`);
  if (ast.toDate) tokens.push(`to:${ast.toDate}`);
  if (ast.type === "filing") tokens.push("type:filing");
  if (ast.filingForm) tokens.push(`form:${ast.filingForm}`);
  if (ast.has?.length) tokens.push(`has:${ast.has.join("|")}`);

  for (const term of ast.freeText) {
    tokens.push(quoteIfNeeded(term));
  }

  return tokens.join(" ").trim();
}

