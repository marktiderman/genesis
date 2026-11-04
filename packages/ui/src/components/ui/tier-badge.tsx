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
  const accent = tone ? `var(--brand-accent-${tone}, hsl(var(--secondary)))` : undefined;
  return (
    <span
      data-slot="tier-badge"
      data-tone={tone}
      data-testid={testID}
      className={cn(
        "inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full border font-semibold text-foreground [&_svg]:shrink-0",
        size === "sm" ? "px-2 py-0.5 text-xs [&_svg]:size-3" : "px-2.5 py-1 text-sm [&_svg]:size-3.5",
        !accent && "border-transparent bg-secondary text-secondary-foreground",
        className
      )}
      style={
        accent
          ? { borderColor: accent, backgroundColor: `color-mix(in srgb, ${accent} 15%, transparent)`, ...style }
          : style
      }
      {...props}
    >
      {icon ? (
        <span aria-hidden="true" className="inline-flex" style={accent ? { color: accent } : undefined}>
          {icon}
        </span>
      ) : null}
      {label}
    </span>
  );
}
