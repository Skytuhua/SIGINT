import type { QueryAST } from "../types";

const SRC_ALIAS: Record<string, string> = {
  guardian: "theguardian.com",
  reuters: "reuters.com",
  bloomberg: "bloomberg.com",
  ap: "apnews.com",
  sec: "sec",
  gdelt: "gdelt",
  rss: "rss",
};

function normalizeDate(value?: string): string | undefined {
  if (!value) return undefined;
  const match = value.match(/^\d{4}-\d{2}-\d{2}$/);
  return match ? value : undefined;
}

export function normalizeQueryAst(input: QueryAST): QueryAST {
  const next: QueryAST = {
    ...input,
    raw: input.raw.trim(),
    freeText: input.freeText
      .map((t) => t.trim())
      .filter(Boolean),
  };

  if (next.sym) next.sym = next.sym.toUpperCase();
  if (next.cik) next.cik = next.cik.replace(/[^\d]/g, "").padStart(10, "0");
  if (next.filingForm) next.filingForm = next.filingForm.toUpperCase();
  if (next.timespan && !["24h", "7d", "30d"].includes(next.timespan)) {
    next.timespan = undefined;
  }

  next.fromDate = normalizeDate(next.fromDate);
  next.toDate = normalizeDate(next.toDate);

  if (next.src?.length) {
    const mapped = next.src
      .map((value) => SRC_ALIAS[value.toLowerCase()] ?? value.toLowerCase())
      .filter(Boolean);
    next.src = Array.from(new Set(mapped));
  }

  if (next.has?.length) {
    const filtered = next.has.filter((token): token is "video" | "coords" =>
      token === "video" || token === "coords"
    );
    next.has = Array.from(new Set(filtered));
  }

  if (next.type === "filing" && !next.cat) {
    next.cat = "filings";
  }

  if (next.filingForm && next.type !== "filing") {
    next.type = "filing";
    next.cat = "filings";
  }

  return next;
}
