"use client";

import type { ReactNode } from "react";

interface PanelHeaderProps {
  title: string;
  subtitle?: string;
  tabs?: ReactNode;
  controls?: ReactNode;
  filters?: ReactNode;
  locked?: boolean;
  onToggleLock?: () => void;
}

export default function PanelHeader({
  title,
  subtitle,
  tabs,
  controls,
  filters,
  locked = false,
  onToggleLock,
}: PanelHeaderProps) {
  return (
    <header className="si-panel-header">
      <div className="si-panel-header-main">
        <button
          type="button"
          className={`si-panel-drag-handle ${locked ? "is-locked" : ""}`.trim()}
          aria-label={locked ? "Panel position locked" : "Move panel"}
          title={locked ? "Panel is locked. Unlock to move." : "Move panel"}
          disabled={locked}
        >
          <span className="si-panel-drag-icon" aria-hidden="true" />
        </button>
        {onToggleLock ? (
          <button
            type="button"
            className={`si-panel-lock-button ${locked ? "is-active" : ""}`.trim()}
            onClick={onToggleLock}
            aria-label={locked ? "Unlock panel position and size" : "Lock panel position and size"}
            title={locked ? "Unlock panel position and size" : "Lock panel position and size"}
            aria-pressed={locked}
          >
            <span className="si-panel-lock-icon" aria-hidden="true" />
          </button>
        ) : null}
        <div className="si-panel-title-wrap">
          <h3 className="si-panel-title" title={title}>
            {title}
          </h3>
          {subtitle ? (
            <div className="si-panel-subtitle" title={subtitle}>
              {subtitle}
            </div>
          ) : null}
        </div>
        <div className="si-panel-header-right">
          {tabs}
          {controls}
        </div>
      </div>
      {filters ? <div className="si-panel-filters">{filters}</div> : null}
    </header>
  );
}

