"use client";

import type { ReactNode } from "react";

export function PanelLoadingState({ rows = 6 }: { rows?: number }) {
  return (
    <div className="si-panel-state">
      <div className="si-skeleton-block" />
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="si-skeleton-row" />
      ))}
    </div>
  );
}

export function PanelEmptyState({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="si-panel-state">
      <div className="si-panel-state-line">{message}</div>
      {actionLabel ? (
        <button type="button" className="si-inline-action" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function PanelErrorState({
  message,
  details,
  onRetry,
}: {
  message: string;
  details?: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <details className="si-panel-state si-panel-error" open>
      <summary>
        <span>{message}</span>
        {onRetry ? (
          <button
            type="button"
            className="si-inline-action"
            onClick={(event) => {
              event.preventDefault();
              onRetry();
            }}
          >
            Retry
          </button>
        ) : null}
      </summary>
      {details ? <div className="si-panel-error-details">{details}</div> : null}
    </details>
  );
}

