"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      style={{
        background: "#0a0a0a",
        color: "#ff4444",
        fontFamily: "'Courier New', monospace",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "50vh",
        padding: "2rem",
      }}
    >
      <div style={{ maxWidth: 520, textAlign: "center" }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>
          System Error
        </h2>
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
    </div>
  );
}
