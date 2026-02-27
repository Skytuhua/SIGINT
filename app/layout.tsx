import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "WorldView",
  description: "Geospatial intel-style dashboard with Cesium",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Script src="https://cesium.com/downloads/cesiumjs/releases/1.126/Build/Cesium/Cesium.js" strategy="beforeInteractive" />
        <link rel="stylesheet" href="https://cesium.com/downloads/cesiumjs/releases/1.126/Build/Cesium/Widgets/widgets.css" />
        {children}
      </body>
    </html>
  );
}
