import * as React from "react";
import { cn } from "../../utils";

/**
 * TierBadge — a rank or tier label ("Gold", "Level 3"), with an optional
 * leading icon and a tone from the brand's `accents`.
 *
 * `tone` names a brand accent: the badge reads `--brand-accent-<tone>` for its
 * border and a 15% tint behind the text, and keeps the foreground colour for
 * the text, so it reads at AA whatever the accent. Without a tone, or when the
 * brand has no such accent, it is the secondary chip.
 *
 * @stability Beta
 */
export interface TierBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** The rank or tier, as shown ("Gold"). */
  label: React.ReactNode;
  /** A key of the brand's `accents` (`"gold"`). Unset: neutral. */
  tone?: string | undefined;
  /** Leading icon (a lucide icon, sized by the badge). */
  icon?: React.ReactNode;
  /** `sm` for a list row, `md` (default) for a header. */
  size?: "sm" | "md";
  /** Stable test/automation selector (emitted as `data-testid`). */
  testID?: string | undefined;
}

export function TierBadge({ label, tone, icon, size = "md", testID, className, style, ...props }: TierBadgeProps) {
  // CSS can't tell whether the brand defines `--brand-accent-<tone>`, so every badge starts as
  // the secondary chip and the accent only paints over it: each accent use falls back to
  // transparent (border, tint) or the text colour (icon), which leaves the secondary chip
  // whenever the brand has no such accent.
  const accent = tone ? `--brand-accent-${tone}` : undefined;
  return (
    <span
      data-slot="tier-badge"
      data-tone={tone}
      data-testid={testID}
      className={cn(
        "inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full border border-transparent bg-secondary font-semibold text-secondary-foreground [&_svg]:shrink-0",
        size === "sm" ? "px-2 py-0.5 text-xs [&_svg]:size-3" : "px-2.5 py-1 text-sm [&_svg]:size-3.5",
        className
      )}
      style={
        accent
          ? {
              borderColor: `var(${accent}, transparent)`,
              backgroundImage: `linear-gradient(color-mix(in srgb, var(${accent}, transparent) 15%, transparent), color-mix(in srgb, var(${accent}, transparent) 15%, transparent))`,
              ...style,
            }
          : style
      }
      {...props}
    >
      {icon ? (
        <span aria-hidden="true" className="inline-flex" style={accent ? { color: `var(${accent}, currentColor)` } : undefined}>
          {icon}
        </span>
      ) : null}
      {label}
    </span>
  );
}
