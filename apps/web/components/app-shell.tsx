import { Header } from "./header";

/**
 * Persistent chrome around every route: the sticky header, a keyboard skip
 * link, and the page transition wrapper.
 *
 * Pages own their own single `<main>`, so the skip target is a neutral wrapper
 * rather than a second landmark.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <Header />
      <div id="main-content" tabIndex={-1} className="animate-page flex-1 focus:outline-none">
        {children}
      </div>
    </div>
  );
}
