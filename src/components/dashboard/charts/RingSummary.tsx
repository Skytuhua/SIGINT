"use client";

interface RingSummaryDatum {
  id: string;
  label: string;
  value: number;
  color: string;
}

interface RingSummaryProps {
  data: RingSummaryDatum[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
}

export default function RingSummary({ data, size = 132, thickness = 18, centerLabel }: RingSummaryProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0) || 1;
  const radius = size / 2 - thickness;
  const circumference = 2 * Math.PI * radius;

  let running = 0;

  return (
    <div className="wv-ring-summary">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="ring summary">
        <g transform={`translate(${size / 2}, ${size / 2}) rotate(-90)`}>
          {data.map((item) => {
            const ratio = item.value / total;
            const segment = circumference * ratio;
            const dashArray = `${segment} ${circumference - segment}`;
            const dashOffset = -running;
            running += segment;

            return (
              <circle
                key={item.id}
                r={radius}
                cx={0}
                cy={0}
                fill="none"
                stroke={item.color}
                strokeWidth={thickness}
                strokeDasharray={dashArray}
                strokeDashoffset={dashOffset}
              />
            );
          })}
        </g>
        <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" className="wv-ring-center">
          {centerLabel ?? String(total)}
        </text>
      </svg>
      <ul className="wv-ring-legend">
        {data.map((item) => (
          <li key={item.id}>
            <span className="wv-ring-dot" style={{ background: item.color }} />
            <span>{item.label}</span>
            <span>{item.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

