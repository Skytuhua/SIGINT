"use client";

interface SparklineProps {
  values: number[];
  width?: number | string;
  height?: number;
  stroke?: string;
  fill?: string;
  ariaLabel?: string;
}

function minMax(values: number[]) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
  if (min === max) return { min: min - 1, max: max + 1 };
  return { min, max };
}

export default function Sparkline({
  values,
  width = "100%",
  height = 22,
  stroke = "#78b5dd",
  fill = "rgba(120, 181, 221, 0.14)",
  ariaLabel = "sparkline",
}: SparklineProps) {
  const geometryWidth = typeof width === "number" ? width : 88;

  if (!values.length) {
    return (
      <svg
        className="si-sparkline"
        width={width}
        height={height}
        viewBox={`0 0 ${geometryWidth} ${height}`}
        preserveAspectRatio="none"
        aria-label={ariaLabel}
      />
    );
  }

  const { min, max } = minMax(values);
  const stepX = values.length <= 1 ? geometryWidth : geometryWidth / (values.length - 1);
  const points = values
    .map((value, index) => {
      const x = index * stepX;
      const y = height - ((value - min) / (max - min)) * (height - 1);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const areaPoints = `0,${height} ${points} ${geometryWidth},${height}`;

  return (
    <svg
      className="si-sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${geometryWidth} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
    >
      <polyline points={areaPoints} fill={fill} stroke="none" />
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.25" />
    </svg>
  );
}

