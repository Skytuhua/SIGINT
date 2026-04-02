"use client";

import { type ReactNode, useEffect } from "react";

interface PhoneOverlayShellProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
  className?: string;
  bodyClassName?: string;
  ariaLabel?: string;
}

export default function PhoneOverlayShell({
  title,
  onClose,
  children,
  actions,
  footer,
  closeLabel = "Close",
  className,
  bodyClassName,
  ariaLabel,
}: PhoneOverlayShellProps) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="si-phone-overlay-root"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? title}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={`si-phone-overlay-shell${className ? ` ${className}` : ""}`.trim()}>
        <div className="si-phone-overlay-header">
          <div className="si-phone-overlay-title">{title}</div>
          <div className="si-phone-overlay-header-actions">
            {actions}
            <button
              type="button"
              className="si-phone-overlay-close"
              onClick={onClose}
              aria-label={closeLabel}
              title={closeLabel}
            >
              CLOSE
            </button>
          </div>
        </div>
        <div className={`si-phone-overlay-body${bodyClassName ? ` ${bodyClassName}` : ""}`.trim()}>
          {children}
        </div>
        {footer ? <div className="si-phone-overlay-footer">{footer}</div> : null}
      </div>
    </div>
  );
}
