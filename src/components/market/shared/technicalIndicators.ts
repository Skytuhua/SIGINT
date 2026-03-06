type MaybeNum = number | null;

export function sma(values: number[], period: number): MaybeNum[] {
  return values.map((_, i) => {
    if (i < period - 1) return null;
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    return sum / period;
  });
}

export function ema(values: number[], period: number): MaybeNum[] {
  const k = 2 / (period + 1);
  const result: MaybeNum[] = new Array(values.length).fill(null);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { result[i] = null; continue; }
    if (i === period - 1) {
      // seed with SMA
      let sum = 0;
      for (let j = 0; j < period; j++) sum += values[j];
      prev = sum / period;
      result[i] = prev;
    } else {
      prev = values[i] * k + prev! * (1 - k);
      result[i] = prev;
    }
  }
  return result;
}

export function rsi(values: number[], period = 14): MaybeNum[] {
  const result: MaybeNum[] = new Array(values.length).fill(null);
  if (values.length < period + 1) return result;

  // Wilder smoothing
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;

  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

export interface MacdResult {
  macdLine: MaybeNum[];
  signalLine: MaybeNum[];
  histogram: MaybeNum[];
}

export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): MacdResult {
  const fastEma  = ema(values, fast)  as (number | null)[];
  const slowEma  = ema(values, slow)  as (number | null)[];
  const macdLine: MaybeNum[] = values.map((_, i) => {
    if (fastEma[i] == null || slowEma[i] == null) return null;
    return fastEma[i]! - slowEma[i]!;
  });

  // Signal line = EMA(macdLine, signalPeriod) — but only over non-null values
  const macdValues = macdLine.map((v) => v ?? 0);
  const rawSignal = ema(macdValues, signalPeriod);
  const signalLine: MaybeNum[] = rawSignal.map((v, i) =>
    macdLine[i] == null ? null : v,
  );

  const histogram: MaybeNum[] = macdLine.map((m, i) => {
    if (m == null || signalLine[i] == null) return null;
    return m - signalLine[i]!;
  });

  return { macdLine, signalLine, histogram };
}
