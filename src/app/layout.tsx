import "./globals.css";
import type { ReactNode } from "react";
import { Inter, Roboto_Mono } from "next/font/google";

const fontUi = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ui",
  display: "swap",
});

const fontMono = Roboto_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-tech-mono",
  display: "swap",
});

export const metadata = {
  title: "SIGINT",
  description: "SIGINT geospatial intelligence dashboard powered by CesiumJS",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${fontUi.variable} ${fontMono.variable}`}
        style={{ margin: 0, padding: 0, background: "#000", overflow: "hidden" }}
      >
        {children}
      </body>
    </html>
  );
}
