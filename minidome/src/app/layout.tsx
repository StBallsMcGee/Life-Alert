import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "THE MINIDOME", template: "%s · THE MINIDOME" },
  description: "Private NFL playoff One-and-Done fantasy leagues",
  robots: { index: false, follow: false },
  applicationName: "THE MINIDOME",
  appleWebApp: { capable: true, title: "MINIDOME", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: "#131419", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
