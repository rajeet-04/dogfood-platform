import type { ReactNode } from "react";
import {
  CircleCheck,
  CircleAlert,
  Info,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { cn } from "../../lib/cn";

const TONE = {
  info: {
    wrap: "border-info-border bg-info-soft text-info-fg",
    icon: Info,
  },
  success: {
    wrap: "border-success-border bg-success-soft text-success-fg",
    icon: CircleCheck,
  },
  warning: {
    wrap: "border-warning-border bg-warning-soft text-warning-fg",
    icon: TriangleAlert,
  },
  danger: {
    wrap: "border-danger-border bg-danger-soft text-danger-fg",
    icon: CircleAlert,
  },
  neutral: {
    wrap: "border-line bg-surface-sunken text-fg-muted",
    icon: Info,
  },
} as const;

export type AlertTone = keyof typeof TONE;

/**
 * Inline status message. Always leads with an icon and a text label so the
 * meaning survives a monochrome screen or a colour-blind reader.
 */
export function Alert({
  tone = "info",
  title,
  children,
  action,
  className,
  testId,
  icon: IconOverride,
}: {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  testId?: string;
  icon?: LucideIcon;
}) {
  const config = TONE[tone];
  const Icon = IconOverride ?? config.icon;
  return (
    <div
      data-testid={testId}
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-small",
        config.wrap,
        className,
      )}
    >
      <Icon aria-hidden="true" className="mt-px size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? (
          <div className={cn(title && "mt-0.5", "leading-5")}>{children}</div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
