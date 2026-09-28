/**
 * Presentation-only formatting helpers shared by server and client components.
 * Everything is locale-aware and returns an em dash for absent values so
 * tables never collapse to an empty cell.
 */

export const EM_DASH = "—";

const DATE_TIME = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const DATE_ONLY = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

const DATE_TIME_SHORT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

export function formatDateTime(
  value: Date | string | null | undefined,
): string {
  if (!value) return EM_DASH;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return EM_DASH;
  return DATE_TIME.format(date);
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return EM_DASH;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return EM_DASH;
  return DATE_ONLY.format(date);
}

export function formatCompactDateTime(
  value: Date | string | null | undefined,
): string {
  if (!value) return EM_DASH;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return EM_DASH;
  return DATE_TIME_SHORT.format(date);
}

/** "3 days ago", "in 2 hours". Falls back to an absolute date past a year. */
export function formatRelative(
  value: Date | string | null | undefined,
  now: Date = new Date(),
): string {
  if (!value) return EM_DASH;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return EM_DASH;
  const delta = date.getTime() - now.getTime();
  const magnitude = Math.abs(delta);
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (magnitude >= ms) {
      return RELATIVE.format(Math.round(delta / ms), unit);
    }
  }
  return RELATIVE.format(Math.round(delta / 1000), "second");
}

/** `Date` -> value for `<input type="datetime-local">` in the local zone. */
export function toLocalInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `Date` -> value for a UTC-backed `<input type="datetime-local">`. */
export function toUtcLocalInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 16);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return EM_DASH;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return count === 1 ? singular : plural;
}

/** "1 project" / "4 projects" */
export function countLabel(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${formatNumber(count)} ${pluralize(count, singular, plural)}`;
}

/** Up to two uppercase initials for avatar fallbacks. */
export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((part) => [...part][0]?.toUpperCase() ?? "")
    .join("");
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Deterministic hue from a string, used to give avatars a stable tint so the
 * same person is always the same colour without storing anything.
 */
export function hueFromString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

/** A readable host from a URL, for link chips. */
export function displayHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export type Countdown = {
  days: number;
  hours: number;
  minutes: number;
  totalMs: number;
  overdue: boolean;
};

export function countdownTo(
  target: Date | string | null | undefined,
  now: Date = new Date(),
): Countdown | null {
  if (!target) return null;
  const date = target instanceof Date ? target : new Date(target);
  if (Number.isNaN(date.getTime())) return null;
  const totalMs = date.getTime() - now.getTime();
  const abs = Math.abs(totalMs);
  return {
    days: Math.floor(abs / 86_400_000),
    hours: Math.floor((abs % 86_400_000) / 3_600_000),
    minutes: Math.floor((abs % 3_600_000) / 60_000),
    totalMs,
    overdue: totalMs < 0,
  };
}
