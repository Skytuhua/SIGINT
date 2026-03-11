"use client";

interface CompactLineSeries {
  label: string;
  values: number[];
  color: string;
}

interface CompactLineChartProps {
  series: CompactLineSeries[];
  width?: number;
  height?: number;
  responsive?: boolean;
}

function range(series: CompactLineSeries[]) {
  const values = series.flatMap((s) => s.values);
  if (!values.length) return { min: 0, max: 1 };
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  return { min, max };
}

export default function CompactLineChart({
  series,
  width = 360,
  height = 160,
  responsive = true,
}: CompactLineChartProps) {
  const { min, max } = range(series);
  const maxLen = Math.max(1, ...series.map((s) => s.values.length));
  const stepX = maxLen <= 1 ? width : width / (maxLen - 1);

  return (
    <div className="si-compact-line-chart">
      <svg
        width={responsive ? "100%" : width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="trend chart"
      >
        <line x1={0} y1={height - 1} x2={width} y2={height - 1} className="si-chart-axis" />
        <line x1={0} y1={0} x2={0} y2={height} className="si-chart-axis" />
        {series.map((item) => {
          const points = item.values
            .map((value, index) => {
              const x = index * stepX;
              const y = height - ((value - min) / (max - min)) * (height - 6) - 3;
              return `${x.toFixed(2)},${y.toFixed(2)}`;
            })
            .join(" ");

          return <polyline key={item.label} points={points} fill="none" stroke={item.color} strokeWidth="1.4" />;
        })}
      </svg>
      <div className="si-chart-legend">
        {series.map((item) => (
          <span key={item.label} style={{ color: item.color }}>
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

