"use client";

interface PanelFooterProps {
  updatedAt?: number | null;
  source?: string;
  health?: "ok" | "loading" | "stale" | "error" | "idle";
  message?: string;
}

function healthClass(health: PanelFooterProps["health"]): string {
  if (!health) return "";
  return `is-${health}`;
}

export default function PanelFooter({ updatedAt, source, health = "idle", message }: PanelFooterProps) {
  return (
    <footer className="wv-panel-footer">
      <div className="wv-panel-footer-meta">
        <span>{source ?? "LOCAL"}</span>
        <span>{updatedAt ? new Date(updatedAt).toISOString().slice(11, 19) + "Z" : "--"}</span>
        {message ? <span className="wv-panel-footer-message">{message}</span> : null}
      </div>
      <span className={`wv-panel-health ${healthClass(health)}`} aria-label={`status ${health}`} />
    </footer>
  );
}

