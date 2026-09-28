"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LogIn, Menu, Plus, UserPlus, X } from "lucide-react";

import { cn } from "../lib/cn";
import { ThemeToggle } from "./ui/theme";
import { NavLinks, type NavItem } from "./nav-links";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Small-screen navigation. Below `lg` the primary links collapse into a
 * slide-over panel; above it the header renders `NavLinks` inline and this
 * trigger is hidden, so the two never compete for the same action.
 */
export function MobileNav({
  items,
  extraLinks,
}: {
  items: NavItem[];
  extraLinks: NavItem[];
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const titleId = useId();

  useEffect(() => setMounted(true), []);

  // Any navigation closes the panel.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Lock the page behind the panel and keep focus inside it.
  useEffect(() => {
    if (!open) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const items = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [open, close]);

  const panel = open ? (
    <div
      className="animate-fade fixed inset-0 z-50 lg:hidden"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="absolute inset-0 bg-ink-1000/40 backdrop-blur-[2px]" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "animate-slide-in absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col",
          "border-r border-line bg-surface shadow-lg",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line-subtle px-4 py-3.5">
          <p id={titleId} className="text-subheading font-semibold text-fg">
            Menu
          </p>
          <button
            type="button"
            onClick={close}
            aria-label="Close navigation menu"
            className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <NavLinks
            items={items}
            onNavigate={close}
            className="flex-col items-stretch gap-0.5 [&_a]:px-3 [&_a]:py-2.5"
          />
          {extraLinks.length > 0 ? (
            <ul className="mt-1 flex flex-col gap-0.5">
              {extraLinks.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={close}
                    className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-small font-medium text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
                  >
                    {item.href === "/login" ? (
                      <LogIn aria-hidden="true" className="size-4" />
                    ) : item.href === "/register" ? (
                      <UserPlus aria-hidden="true" className="size-4" />
                    ) : (
                      <Plus aria-hidden="true" className="size-4" />
                    )}
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line-subtle px-4 py-3.5">
          <span className="text-caption text-fg-subtle">Appearance</span>
          <ThemeToggle />
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-md text-fg-muted",
          "transition-colors hover:bg-surface-hover hover:text-fg lg:hidden",
        )}
      >
        <Menu aria-hidden="true" className="size-5" />
      </button>
      {mounted && panel ? createPortal(panel, document.body) : null}
    </>
  );
}
