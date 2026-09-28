"use client";

import { useId, type ReactNode } from "react";

import { cn } from "../../lib/cn";

export type Segment<T extends string> = {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  count?: number;
};

/**
 * In-place switch for small sets of mutually exclusive options. Radio-group
 * semantics so arrow keys and screen readers behave correctly.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<Segment<T>>;
  size?: "sm" | "md";
  className?: string;
  label: string;
}) {
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-line bg-surface-sunken p-0.5",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <label
            key={option.value}
            className={cn(
              "relative cursor-pointer rounded-[7px] font-medium transition-colors select-none",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-[var(--df-ring)]",
              size === "sm" ? "px-2.5 py-1 text-caption" : "px-3 py-1.5 text-small",
              selected
                ? "bg-surface text-fg shadow-xs"
                : "text-fg-subtle hover:text-fg",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={selected}
              onChange={() => onChange(option.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
            <span className="flex items-center gap-1.5">
              {option.icon}
              {option.label}
              {option.count !== undefined ? (
                <span
                  className={cn(
                    "tabular rounded-full px-1.5 text-micro font-semibold",
                    selected
                      ? "bg-accent-soft text-accent-soft-fg"
                      : "bg-surface-active text-fg-subtle",
                  )}
                >
                  {option.count}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}
