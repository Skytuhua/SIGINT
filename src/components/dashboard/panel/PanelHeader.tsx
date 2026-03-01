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
    <header className="wv-panel-header">
      <div className="wv-panel-header-main">
        <button
          type="button"
          className={`wv-panel-drag-handle ${locked ? "is-locked" : ""}`.trim()}
          aria-label={locked ? "Panel position locked" : "Move panel"}
          title={locked ? "Panel is locked. Unlock to move." : "Move panel"}
          disabled={locked}
        >
          <span className="wv-panel-drag-icon" aria-hidden="true" />
        </button>
        {onToggleLock ? (
          <button
            type="button"
            className={`wv-panel-lock-button ${locked ? "is-active" : ""}`.trim()}
            onClick={onToggleLock}
            aria-label={locked ? "Unlock panel position and size" : "Lock panel position and size"}
            title={locked ? "Unlock panel position and size" : "Lock panel position and size"}
            aria-pressed={locked}
          >
            <span className="wv-panel-lock-icon" aria-hidden="true" />
          </button>
        ) : null}
        <div className="wv-panel-title-wrap">
          <h3 className="wv-panel-title" title={title}>
            {title}
          </h3>
          {subtitle ? (
            <div className="wv-panel-subtitle" title={subtitle}>
              {subtitle}
            </div>
          ) : null}
        </div>
        <div className="wv-panel-header-right">
          {tabs}
          {controls}
        </div>
      </div>
      {filters ? <div className="wv-panel-filters">{filters}</div> : null}
    </header>
  );
}

