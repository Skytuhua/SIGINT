"use client";

import React from "react";

interface ChgCellProps {
  value: number;
  decimals?: number;
  suffix?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function ChgCell({ value, decimals = 2, suffix = "%", className = "", style }: ChgCellProps) {
  const modifier = value > 0 ? "is-up" : value < 0 ? "is-down" : "is-flat";
  const sign = value > 0 ? "+" : "";
  return (
    <span className={`${modifier} ${className}`.trim()} style={style}>
      {sign}{value.toFixed(decimals)}{suffix}
    </span>
  );
}
