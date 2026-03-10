"use client";

import React, { useEffect, useRef, memo } from "react";

interface TradingViewWidgetProps {
  /** TradingView widget script URL */
  scriptSrc: string;
  /** Widget configuration object (serialised into the script tag) */
  config: Record<string, unknown>;
  /** Container height */
  height?: number | string;
  /** Container width */
  width?: number | string;
  /** Extra class names on the wrapper */
  className?: string;
  /** Extra inline styles on the wrapper */
  style?: React.CSSProperties;
  /** Fallback while loading */
  fallback?: React.ReactNode;
}

/**
 * Reusable TradingView embeddable widget loader.
 *
 * Works by injecting a <script> tag with the widget config
 * into a container div, following TradingView's embed pattern.
 * Always uses dark theme and transparent background.
 */
function TradingViewWidgetInner({
  scriptSrc,
  config,
  height = 400,
  width = "100%",
  className,
  style,
  fallback,
}: TradingViewWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear previous widget
    container.innerHTML = "";

    // Create inner div for TradingView to target
    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    container.appendChild(widgetDiv);

    // Inject the script
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = scriptSrc;
    script.async = true;
    script.innerHTML = JSON.stringify({
      ...config,
      colorTheme: "dark",
      theme: "dark",
      backgroundColor: "rgba(10, 14, 20, 1)",
      isTransparent: false,
      locale: "en",
    });
    container.appendChild(script);
    scriptRef.current = script;

    return () => {
      // Cleanup
      if (container) {
        container.innerHTML = "";
      }
    };
  }, [scriptSrc, JSON.stringify(config)]);

  return (
    <div
      ref={containerRef}
      className={`tradingview-widget-container ${className ?? ""}`}
      style={{
        height,
        width,
        overflow: "hidden",
        ...style,
      }}
    >
      {fallback ?? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "var(--wv-text-muted, #666)",
            fontSize: 11,
            letterSpacing: "0.05em",
          }}
        >
          Loading widget…
        </div>
      )}
    </div>
  );
}

export const TradingViewWidget = memo(TradingViewWidgetInner);
export default TradingViewWidget;
