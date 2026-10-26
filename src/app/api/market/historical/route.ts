import { NextResponse } from "next/server";
import { getHistoricalCloses } from "../../../../lib/server/news/providers/yahooFinance";
import { STANDARD_LIMITER } from "../../../../lib/server/rateLimitPresets";
import { withRateLimit } from "../../../../lib/server/withRateLimit";

const CORR_ASSETS = ["SPY", "TLT", "GLD", "USO", "BTC-USD", "UUP"];
const CORR_LABELS = ["SPY", "TLT", "GLD", "OIL", "BTC", "DXY"];

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 5) return 0;
  const xa = a.slice(-n);
  const xb = b.slice(-n);
  const meanA = xa.reduce((s, v) => s + v, 0) / n;
  const meanB = xb.reduce((s, v) => s + v, 0) / n;
  let num = 0,
    denA = 0,
    denB = 0;
  for (let i = 0; i < n; i++) {
    const da = xa[i] - meanA;
    const db = xb[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  return den === 0 ? 0 : parseFloat((num / den).toFixed(2));
}

async function handler() {
  const results = await Promise.all(
    CORR_ASSETS.map((sym) => getHistoricalCloses(sym, "1mo", "1d")),
  );

  const series: Record<string, number[]> = {};
  let degraded = false;
  for (let i = 0; i < CORR_ASSETS.length; i++) {
    series[CORR_LABELS[i]] = results[i].data;
    if (results[i].degraded) degraded = true;
  }

  // Compute correlation matrix
  const n = CORR_LABELS.length;
  const correlations: number[][] = Array.from({ length: n }, () =>
    Array(n).fill(0),
  );
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        correlations[i][j] = 1;
      } else if (j > i) {
        const val = pearson(
          series[CORR_LABELS[i]] ?? [],
          series[CORR_LABELS[j]] ?? [],
        );
        correlations[i][j] = val;
        correlations[j][i] = val;
      }
    }
  }

  return NextResponse.json(
    {
      series,
      correlations,
      assets: CORR_LABELS,
      degraded,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export const GET = withRateLimit(STANDARD_LIMITER, handler);
