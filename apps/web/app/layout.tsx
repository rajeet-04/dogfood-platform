import type { Metadata, Viewport } from "next";

import "./globals.css";
import { AppShell } from "../components/app-shell";
import { ThemeProvider, THEME_BOOTSTRAP } from "../components/ui/theme";
import { ToastProvider } from "../components/ui/toast";

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
    { media: "(prefers-color-scheme: dark)", color: "#171821" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // The bootstrap script below mutates the class list before React hydrates,
    // so the mismatch is expected and intentionally suppressed.
    <html lang="en" suppressHydrationWarning>
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
