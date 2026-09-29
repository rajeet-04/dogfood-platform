import type { Metadata, Viewport } from "next";
import { Fragment_Mono, Hanken_Grotesk, Unbounded } from "next/font/google";

import "./globals.css";
import { AppShell } from "../components/app-shell";
import { ThemeProvider, THEME_BOOTSTRAP } from "../components/ui/theme";
import { ToastProvider } from "../components/ui/toast";

const body = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const display = Unbounded({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

const data = Fragment_Mono({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-data",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "DOGFOOD",
    template: "%s · DOGFOOD",
  },
  description: "Self-hosted hackathon submission and judging platform",
  applicationName: "DOGFOOD",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f8f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1320" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // The bootstrap script below mutates the class list before React hydrates,
    // so the mismatch is expected and intentionally suppressed.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${body.variable} ${display.variable} ${data.variable}`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }}
        />
      </head>
      <body className="min-h-dvh bg-canvas text-fg antialiased">
        <ThemeProvider>
          <ToastProvider>
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
