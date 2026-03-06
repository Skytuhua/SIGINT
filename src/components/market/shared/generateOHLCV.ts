export interface CandleBar {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Linear congruential generator for reproducible randomness seeded by ticker */
function makeLcg(seed: number) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = ((s * 1664525 + 1013904223) & 0xffffffff) >>> 0;
    return s / 0xffffffff;
  };
}

function tickerSeed(ticker: string): number {
  return ticker.split("").reduce((a, c, i) => (a + c.charCodeAt(0) * (i + 1)) | 0, 0x9e3779b9);
}

/**
 * Generate a deterministic OHLCV series. Same ticker + params always produce the same data.
 * @param ticker  Symbol string (used as RNG seed)
 * @param bars    Number of candles to produce
 * @param basePrice  Reference price (last close will be near this)
 * @param dailyVolPct  Per-bar typical % volatility (default 2%)
 */
export function generateOHLCV(
  ticker: string,
  bars: number,
  basePrice: number,
  dailyVolPct = 2,
): CandleBar[] {
  const rng = makeLcg(tickerSeed(ticker));
  const volFrac = dailyVolPct / 100;

  // Build a price series ending near basePrice
  const closes: number[] = [];
  let price = basePrice * (0.85 + rng() * 0.3); // start ±15%
  for (let i = 0; i < bars; i++) {
    const change = (rng() - 0.48) * volFrac; // slight upward drift bias (0.48 vs 0.5)
    price = Math.max(price * (1 + change), 0.01);
    closes.push(price);
  }

  // Scale so the last close is exactly basePrice
  const scaleFactor = basePrice / closes[closes.length - 1];
  for (let i = 0; i < closes.length; i++) closes[i] *= scaleFactor;

  const now = Date.now();
  const barMs = 5 * 60 * 1000; // default 5-min bars

  return closes.map((close, i) => {
    const open = i === 0 ? close * (0.99 + rng() * 0.02) : closes[i - 1];
    const wiggle = close * volFrac * 0.5;
    const high = Math.max(open, close) + rng() * wiggle;
    const low  = Math.min(open, close) - rng() * wiggle;
    const volume = Math.floor((0.3 + rng() * 1.4) * basePrice * 1_000);
    const ts = now - (bars - 1 - i) * barMs;
    return { ts, open, high, low, close, volume };
  });
}
