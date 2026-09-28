import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "../lib/cn";

/**
 * Focused layout for the signed-out routes. The app header is already on
 * screen, so these pages only need to centre one card and stay narrow enough
 * to read comfortably on a phone.
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
  width = "narrow",
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: "narrow" | "wide";
}) {
  return (
    <main className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center sm:py-16">
      <div
        className={cn(
          "w-full",
          width === "narrow" ? "max-w-md" : "max-w-2xl",
        )}
      >
        <div className="rounded-xl border border-line bg-surface p-6 shadow-sm sm:p-8">
          <h1 className="text-title font-semibold text-fg">{title}</h1>
          {description ? (
            <p className="mt-1.5 text-small text-fg-subtle">{description}</p>
          ) : null}
          <div className="mt-6">{children}</div>
        </div>
        {footer ? (
          <p className="mt-4 text-center text-small text-fg-subtle">{footer}</p>
        ) : null}
      </div>
    </main>
  );
}

export function AuthLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      // Inline in a sentence, but still a comfortable touch target on a phone.
      className="inline-block rounded-xs py-1.5 font-medium text-accent underline-offset-4 transition-colors hover:text-accent-hover hover:underline"
    >
      {children}
    </Link>
  );
}
