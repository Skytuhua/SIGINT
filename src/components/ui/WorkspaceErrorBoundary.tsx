"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  name: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class WorkspaceErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.name}] workspace crash:`, error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            background: "#0d0d0d",
            color: "#ff4444",
            fontFamily: "'Courier New', monospace",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "40vh",
            padding: "2rem",
          }}
        >
          <div style={{ maxWidth: 480, textAlign: "center" }}>
            <h3 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>
              {this.props.name} — Workspace Error
            </h3>
            <p style={{ color: "#888", fontSize: "0.8rem", marginBottom: "1rem" }}>
              {this.state.error?.message || "An unexpected error occurred."}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                background: "#1a1a1a",
                color: "#0f0",
                border: "1px solid #333",
                padding: "0.4rem 1.2rem",
                fontFamily: "inherit",
                cursor: "pointer",
                fontSize: "0.8rem",
              }}
            >
              RETRY
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
