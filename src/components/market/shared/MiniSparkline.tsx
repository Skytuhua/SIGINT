"use client";

interface MiniSparklineProps {
  prices: number[];
  up: boolean;
  width?: number;
  height?: number;
  strokeWidth?: number;
}

export function MiniSparkline({ prices, up, width = 50, height = 16, strokeWidth = 1.2 }: MiniSparklineProps) {
  if (prices.length < 2) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const step = width / (prices.length - 1);
  const pts = prices
    .map((p, i) => `${(i * step).toFixed(1)},${(height - ((p - min) / range) * height).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={width} height={height} style={{ display: "block", flexShrink: 0 }}>
      <polyline
        points={pts}
        fill="none"
        stroke={up ? "#36b37e" : "#ff5a5f"}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
