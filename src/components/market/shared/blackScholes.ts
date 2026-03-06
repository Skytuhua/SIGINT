/** Abramowitz & Stegun cumulative normal distribution approximation */
function cdf(x: number): number {
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + p * Math.abs(x) / Math.SQRT2);
  const poly = t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5))));
  return 0.5 * (1 + sign * (1 - poly * Math.exp(-x * x / 2)));
}

/** Standard normal PDF */
function pdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Black-Scholes price for European option.
 * @param S  Spot price
 * @param K  Strike price
 * @param T  Time to expiry in years
 * @param r  Risk-free rate (e.g. 0.045)
 * @param sigma  Implied volatility (e.g. 0.25)
 * @param type  "call" or "put"
 */
export function bsPrice(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  type: "call" | "put",
): number {
  if (T <= 0) {
    return type === "call" ? Math.max(S - K, 0) : Math.max(K - S, 0);
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  if (type === "call") return S * cdf(d1) - K * Math.exp(-r * T) * cdf(d2);
  return K * Math.exp(-r * T) * cdf(-d2) - S * cdf(-d1);
}

export interface Greeks {
  delta: number;
  gamma: number;
  theta: number; // per calendar day
  vega: number;  // per 1% move in vol
}

/**
 * Black-Scholes Greeks.
 */
export function bsGreeks(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  type: "call" | "put",
): Greeks {
  if (T <= 0) {
    const delta = type === "call" ? (S > K ? 1 : 0) : (S < K ? -1 : 0);
    return { delta, gamma: 0, theta: 0, vega: 0 };
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const pdfD1 = pdf(d1);
  const ert = Math.exp(-r * T);

  const delta = type === "call" ? cdf(d1) : cdf(d1) - 1;
  const gamma = pdfD1 / (S * sigma * sqrtT);
  const thetaCall = -(S * pdfD1 * sigma) / (2 * sqrtT) - r * K * ert * cdf(d2);
  const thetaPut  = -(S * pdfD1 * sigma) / (2 * sqrtT) + r * K * ert * cdf(-d2);
  const theta = (type === "call" ? thetaCall : thetaPut) / 365;
  const vega = S * pdfD1 * sqrtT / 100; // per 1% vol change

  return { delta, gamma, theta, vega };
}

/** Deterministic IV per ticker hash (15%–55%) */
export function tickerIV(ticker: string): number {
  const hash = ticker.split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0);
  return 0.15 + (Math.abs(hash) % 40) / 100;
}
