"use client";

import { scaleValue } from "../../../lib/dashboard/format";

interface MiniBarProps {
  values: number[];
  max?: number;
  color?: string;
}

export default function MiniBar({ values, max, color = "#6f94ad" }: MiniBarProps) {
  const upper = max ?? Math.max(...values, 1);

  return (
    <div className="si-mini-bar" role="img" aria-label="distribution bars">
      {values.map((value, index) => (
        <span
          key={`${index}-${value}`}
          style={{
            height: `${Math.round(scaleValue(value, 0, upper) * 100)}%`,
            background: color,
          }}
        />
      ))}
    </div>
  );
}

