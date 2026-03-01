import dynamic from "next/dynamic";

const WorldViewApp = dynamic(() => import("../components/WorldViewApp"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0b131b",
        color: "#d7e2ee",
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace',
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: 3 }}>
        WORLDVIEW CONSOLE
      </div>
      <div style={{ opacity: 0.6, fontSize: 11, letterSpacing: 1 }}>
        INITIALIZING DASHBOARD...
      </div>
    </div>
  ),
});

export default function HomePage() {
  return (
    <main style={{ width: "100vw", height: "100vh", margin: 0, overflow: "hidden" }}>
      <WorldViewApp />
    </main>
  );
}
