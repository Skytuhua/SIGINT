"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#0a0a0a",
          color: "#ff4444",
          fontFamily: "'Courier New', monospace",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100dvh",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: 520, textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>
            SIGINT — Fatal Error
          </h1>
          <p style={{ color: "#aaa", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
            {error.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={reset}
            style={{
              background: "#222",
              color: "#0f0",
              border: "1px solid #333",
              padding: "0.5rem 1.5rem",
              fontFamily: "inherit",
              cursor: "pointer",
              fontSize: "0.875rem",
            }}
          >
            RETRY
          </button>
        </div>
      </body>
    </html>
  );
}
