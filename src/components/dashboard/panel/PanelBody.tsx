"use client";

import type { HTMLAttributes } from "react";

interface PanelBodyProps extends HTMLAttributes<HTMLDivElement> {
  noPadding?: boolean;
}

export default function PanelBody({ noPadding = false, className = "", ...rest }: PanelBodyProps) {
  return (
    <div
      className={`wv-panel-body ${noPadding ? "is-tight" : ""} ${className}`.trim()}
      {...rest}
    />
  );
}

