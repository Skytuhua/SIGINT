export function formatNumber(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return "--";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatSigned(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "--";
  const abs = Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (value > 0) return `+${abs}`;
  if (value < 0) return `-${abs}`;
  return abs;
}

export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "--";
  return `${formatNumber(value, digits)}%`;
}

export function formatAltitudeMeters(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(meters)) return "--";
  return `${formatNumber(meters * 3.28084, 0)} ft`;
}

export function formatSpeedMs(speedMs: number | null | undefined): string {
  if (speedMs == null || !Number.isFinite(speedMs)) return "--";
  return `${formatNumber(speedMs * 1.94384, 0)} kt`;
}

export function formatUtc(ts: number | null | undefined): string {
  if (!ts) return "--";
  return new Date(ts).toISOString().replace("T", " ").slice(0, 19) + "Z";
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function scaleValue(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  if (max <= min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}

export function sparkFromSeries(values: number[], length = 20): number[] {
  if (!values.length) return [];
  if (values.length <= length) return values;
  const step = values.length / length;
  const sampled: number[] = [];
  for (let i = 0; i < length; i++) {
    sampled.push(values[Math.floor(i * step)] ?? values[values.length - 1]);
  }
  return sampled;
}

export function hashToSignedPercent(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  return ((h % 120) - 60) / 10;
}

