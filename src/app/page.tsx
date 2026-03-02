import dynamic from "next/dynamic";
import InitialLoader from "../components/InitialLoader";

const WorldViewApp = dynamic(() => import("../components/WorldViewApp"), {
  ssr: false,
  loading: () => <InitialLoader />,
});

export default function HomePage() {
  return (
    <main style={{ width: "100vw", height: "100vh", margin: 0, overflow: "hidden" }}>
      <WorldViewApp />
    </main>
  );
}
