"use client";

import type { HTMLAttributes } from "react";
import { useSIGINTStore } from "../../../store";

interface PanelProps extends HTMLAttributes<HTMLElement> {
  panelId?: string;
  workspace?: "dashboard" | "news";
}

export default function Panel({
  panelId,
  workspace = "dashboard",
  className = "",
  children,
  onFocus,
  onMouseDown,
  onPointerDown,
  ...rest
}: PanelProps) {
  const focused = useSIGINTStore((s) =>
    workspace === "news" ? s.news.panelFocusId === panelId : s.dashboard.panelFocusId === panelId
  );
  const setPanelFocus = useSIGINTStore((s) =>
    workspace === "news" ? s.setNewsPanelFocus : s.setPanelFocus
  );
  const bringPanelToFront = useSIGINTStore((s) =>
    workspace === "news" ? s.bringNewsPanelToFront : s.bringPanelToFront
  );

  const activate = () => {
    setPanelFocus(panelId ?? null);
    if (panelId) {
      bringPanelToFront(panelId);
    }
  };

  return (
    <section
      className={`si-panel ${focused ? "is-focused" : ""} ${className}`.trim()}
      data-panel-focusable="true"
      data-panel-id={panelId}
      tabIndex={0}
      onFocus={(event) => {
        activate();
        onFocus?.(event);
      }}
      onMouseDown={onMouseDown}
      onPointerDown={(event) => {
        activate();
        onPointerDown?.(event);
      }}
      {...rest}
    >
      {children}
    </section>
  );
}
