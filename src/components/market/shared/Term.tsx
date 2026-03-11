"use client";

import { useState, useRef, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getGlossaryEntry } from "../../../data/marketGlossary";

interface TermProps {
  /** Glossary key, e.g. "VIX", "PE", "OAS" */
  id: string;
  /** Override display text (defaults to the glossary term) */
  children?: ReactNode;
}

/**
 * Inline term wrapper that shows a definition tooltip on hover.
 * Renders a dotted-underline span; tooltip appears after a short delay.
 */
export default function Term({ id, children }: TermProps) {
  const entry = getGlossaryEntry(id);
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number; bottom: number }>({ x: 0, y: 0, bottom: 0 });
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEnter = useCallback((e: React.MouseEvent<HTMLSpanElement>) => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPos({ x: rect.left + rect.width / 2, y: rect.top, bottom: rect.bottom });
    enterTimer.current = setTimeout(() => setShow(true), 300);
  }, []);

  const handleLeave = useCallback(() => {
    if (enterTimer.current) {
      clearTimeout(enterTimer.current);
      enterTimer.current = null;
    }
    leaveTimer.current = setTimeout(() => setShow(false), 150);
  }, []);

  const handleTooltipEnter = useCallback(() => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }, []);

  const handleTooltipLeave = useCallback(() => {
    leaveTimer.current = setTimeout(() => setShow(false), 150);
  }, []);

  // If term not in glossary, render children as-is
  if (!entry) return <>{children ?? id}</>;

  const display = children ?? entry.term;

  // Flip tooltip below when not enough space above (~120px needed)
  const flipBelow = pos.y < 120;
  const clampedX = typeof window !== "undefined"
    ? Math.max(140, Math.min(pos.x, window.innerWidth - 140))
    : pos.x;

  const tooltipStyle: React.CSSProperties = {
    position: "fixed",
    left: clampedX,
    zIndex: 99999,
    ...(flipBelow
      ? { top: pos.bottom + 6, transform: "translateX(-50%)" }
      : { top: pos.y - 6, transform: "translate(-50%, -100%)" }),
  };

  return (
    <>
      <span
        className="si-term"
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        {display}
      </span>

      {show &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className={`si-term-tooltip${flipBelow ? " is-flipped" : ""}`}
            style={tooltipStyle}
            onMouseEnter={handleTooltipEnter}
            onMouseLeave={handleTooltipLeave}
          >
            <div className="si-term-tooltip-full">{entry.full}</div>
            <div className="si-term-tooltip-def">{entry.definition}</div>
            <div className="si-term-tooltip-usage">{entry.usage}</div>
            <div className="si-term-tooltip-arrow" />
          </div>,
          document.body,
        )}
    </>
  );
}
