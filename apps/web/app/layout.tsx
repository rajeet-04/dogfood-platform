import type { Metadata } from "next";

import "./globals.css";
import { Header } from "../components/header";

export const metadata: Metadata = {
  title: "DOGFOOD",
  description: "Self-hosted hackathon submission and judging platform",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <Header />
        {children}
      </body>
    </html>
  );
}