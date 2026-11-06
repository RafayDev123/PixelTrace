import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PixelTrace: Image Intelligence & Metadata Analyzer", template: "%s · PixelTrace" },
  description: "Inspect the EXIF, IPTC and XMP metadata embedded in images, with transparent forensic indicators and privacy-first handling.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#060a13", colorScheme: "dark" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
