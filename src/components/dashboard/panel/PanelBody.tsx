"use client";

import { forwardRef } from "react";
import type { HTMLAttributes } from "react";

interface PanelBodyProps extends HTMLAttributes<HTMLDivElement> {
  noPadding?: boolean;
}

const PanelBody = forwardRef<HTMLDivElement, PanelBodyProps>(function PanelBody(
  { noPadding = false, className = "", ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={`si-panel-body ${noPadding ? "is-tight" : ""} ${className}`.trim()}
      {...rest}
    />
  );
});

export default PanelBody;

