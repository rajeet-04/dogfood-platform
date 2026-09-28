"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "../../lib/cn";

/**
 * Accessible popover menu. Opens on click, closes on outside click, Escape or
 * blur-out, and returns focus to the trigger when dismissed with the keyboard.
 */
export function Dropdown({
  trigger,
  children,
  align = "end",
  className,
  panelClassName,
  label,
  testId,
  as = "menu",
}: {
  trigger: (props: {
    open: boolean;
    toggle: () => void;
    id: string;
    "aria-expanded": boolean;
    "aria-haspopup": "menu" | "dialog";
  }) => ReactNode;
  children: (props: { close: () => void }) => ReactNode;
  align?: "start" | "end";
  className?: string;
  panelClassName?: string;
  label?: string;
  testId?: string;
  /**
   * `menu` for a list of commands, `dialog` for a panel that contains its own
   * forms or interactive content (a menu may only contain menu items).
   */
  as?: "menu" | "dialog";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)} data-testid={testId}>
      {trigger({
        open,
        toggle: () => setOpen((value) => !value),
        id,
        "aria-expanded": open,
        "aria-haspopup": as,
      })}
      {open ? (
        <div
          role={as}
          aria-labelledby={id}
          aria-label={label}
          className={cn(
            "animate-pop absolute z-40 mt-1.5 min-w-56 overflow-hidden rounded-lg",
            "border border-line bg-surface shadow-pop",
            align === "end" ? "right-0" : "left-0",
            panelClassName,
          )}
        >
          {children({ close: () => setOpen(false) })}
        </div>
      ) : null}
    </div>
  );
}

export function DropdownItem({
  className,
  onClick,
  href,
  children,
  tone = "default",
  ...props
}: {
  className?: string;
  onClick?: () => void;
  href?: string;
  children: ReactNode;
  tone?: "default" | "danger";
} & Omit<React.ComponentProps<"button">, "onClick" | "className">) {
  const base = cn(
    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-small transition-colors",
    "focus-visible:bg-surface-hover focus-visible:outline-none",
    tone === "danger"
      ? "text-danger-fg hover:bg-danger-soft"
      : "text-fg hover:bg-surface-hover",
    className,
  );

  if (href) {
    return (
      <a
        href={href}
        role="menuitem"
        className={base}
        onClick={onClick}
        {...(props as React.ComponentProps<"a">)}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      type="button"
      role="menuitem"
      className={base}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pt-2.5 pb-1.5 text-micro font-semibold tracking-[0.06em] text-fg-faint uppercase">
      {children}
    </p>
  );
}

export function DropdownSeparator() {
  return <div className="my-1 h-px bg-line-subtle" role="separator" />;
}
