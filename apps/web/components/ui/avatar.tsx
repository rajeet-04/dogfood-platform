import { cn } from "../../lib/cn";
import { hueFromString, initials as toInitials } from "../../lib/format";

const SIZES = {
  xs: "size-5 text-[0.5625rem]",
  sm: "size-6 text-[0.625rem]",
  md: "size-8 text-caption",
  lg: "size-10 text-small",
  xl: "size-14 text-heading",
} as const;

/**
 * Avatar with a deterministic fallback: the same person always gets the same
 * tint, so a roster reads as distinct without storing any colour per user.
 */
export function Avatar({
  name,
  src,
  size = "md",
  className,
  square = false,
}: {
  name: string | null | undefined;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
  square?: boolean;
}) {
  const label = name?.trim() || "Unknown";
  const hue = hueFromString(label);

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className={cn(
          "shrink-0 object-cover ring-1 ring-line",
          square ? "rounded-md" : "rounded-full",
          SIZES[size],
          className,
        )}
      />
    );
  }

  return (
    <span
      title={label}
      aria-hidden="true"
      style={{
        backgroundColor: `oklch(0.94 0.045 ${hue})`,
        color: `oklch(0.42 0.11 ${hue})`,
      }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-semibold tracking-wide select-none",
        square ? "rounded-md" : "rounded-full",
        SIZES[size],
        className,
      )}
    >
      {toInitials(label)}
    </span>
  );
}

/** Overlapping avatars with a "+N" overflow chip. */
export function AvatarGroup({
  people,
  max = 4,
  size = "sm",
}: {
  people: Array<{ id: string; name: string | null }>;
  max?: number;
  size?: keyof typeof SIZES;
}) {
  const shown = people.slice(0, max);
  const overflow = people.length - shown.length;
  return (
    <span className="flex items-center">
      {shown.map((person, index) => (
        <Avatar
          key={person.id}
          name={person.name}
          size={size}
          className={cn(
            "ring-2 ring-surface",
            index > 0 && "-ml-1.5",
          )}
        />
      ))}
      {overflow > 0 ? (
        <span
          className={cn(
            "-ml-1.5 inline-flex items-center justify-center rounded-full bg-surface-active font-semibold text-fg-muted ring-2 ring-surface",
            SIZES[size],
          )}
        >
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}
