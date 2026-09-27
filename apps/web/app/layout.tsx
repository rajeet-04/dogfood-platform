import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "DOGFOOD",
  description: "Self-hosted hackathon submission and judging platform",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}